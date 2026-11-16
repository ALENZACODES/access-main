/**
 * Inspect statically shipped JavaScript string and template content.
 * TypeScript's JavaScript parser handles minified syntax, regex literals and
 * interpolated templates without treating source identifiers as interface copy.
 */
import ts from 'typescript';

export function decodeStaticString(raw) {
  return raw
    .replace(/\\u\{([0-9a-fA-F]{1,6})\}/g, (all, hex) => {
      const number = Number.parseInt(hex, 16);
      return number <= 0x10ffff && !(number >= 0xd800 && number <= 0xdfff)
        ? String.fromCodePoint(number) : all;
    })
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\x([0-9a-fA-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\([\\'"`])/g, '$1');
}

/** Parser mode for a file name. Built bundles are JavaScript; copied sources can be TypeScript or JSX. */
export function scriptKindFor(fileName) {
  const name = String(fileName ?? '').toLowerCase();
  if (name.endsWith('.tsx')) return ts.ScriptKind.TSX;
  if (name.endsWith('.ts') || name.endsWith('.mts') || name.endsWith('.cts')) return ts.ScriptKind.TS;
  if (name.endsWith('.jsx')) return ts.ScriptKind.JSX;
  return ts.ScriptKind.JS;
}

/**
 * Parse every string token and fail closed on malformed input.
 * `fileName` selects the parser mode; without it the source is read as JavaScript,
 * which is right for built bundles and wrong for TypeScript sources.
 */
export function extractShippedStrings(source, fileName = 'release-bundle.js') {
  const file = ts.createSourceFile(String(fileName), source, ts.ScriptTarget.Latest, true, scriptKindFor(fileName));
  const diagnostic = file.parseDiagnostics[0];
  if (diagnostic) {
    const message = ts.flattenDiagnosticMessageText(diagnostic.messageText, ' ').toLowerCase();
    return { strings: [], error: `${message} at offset ${diagnostic.start ?? 0}` };
  }
  const strings = [];
  function visit(node) {
    if (ts.isStringLiteral(node)
      || node.kind === ts.SyntaxKind.NoSubstitutionTemplateLiteral
      || node.kind === ts.SyntaxKind.TemplateHead
      || node.kind === ts.SyntaxKind.TemplateMiddle
      || node.kind === ts.SyntaxKind.TemplateTail) {
      strings.push({ value: node.text ?? '', offset: node.getStart(file) });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  strings.sort((a, b) => a.offset - b.offset);
  return { strings, error: null };
}

const STATUS_IDENTIFIERS = new Set([
  'VERIFIED', 'UNVERIFIED', 'PROTOTYPE-UNVERIFIED',
  'verificationTier', 'verifiedClaimCount', 'refusedLabelCount',
]);

/**
 * Exclude exact legacy schema tokens, not natural-language messages.
 * The ids remain technical compatibility inputs and do not describe places.
 */
export function isLegacyTechnicalToken(text) {
  return STATUS_IDENTIFIERS.has(text);
}

export function findForbiddenShippedCopy(source, forbiddenPatterns) {
  const { strings, error } = extractShippedStrings(source);
  if (error) {
    const offset = Number(error.match(/offset (\d+)/)?.[1] ?? 0);
    const excerpt = source.slice(Math.max(0, offset - 50), offset + 80).replace(/\s+/g, ' ');
    return { issues: [`${error}; source excerpt=${JSON.stringify(excerpt)}`], inspected: strings.length };
  }
  const issues = [];
  for (const token of strings) {
    if (isLegacyTechnicalToken(token.value)) continue;
    for (const pattern of forbiddenPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(token.value)) {
        const match = token.value.match(pattern);
        const position = match?.index ?? 0;
        const from = Math.max(0, position - 35);
        const to = Math.min(token.value.length, position + (match?.[0].length ?? 0) + 55);
        const context = pattern.source.includes('rif')
          ? `; excerpt=${JSON.stringify(token.value.slice(from, to).replace(/\s+/g, ' '))}`
          : '';
        issues.push(`offset ${token.offset}: prohibited text in JavaScript string (${pattern.source})${context}`);
      }
    }
  }
  return { issues, inspected: strings.length };
}
