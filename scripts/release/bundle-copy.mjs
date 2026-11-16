/**
 * Extract statically shipped JavaScript string content without treating
 * function names, comments, or regex source text as interface copy.
 * This is a conservative lexical pass, not a JavaScript interpreter.
 */

const JS_IDENTIFIER = /[\p{L}\p{N}_$]/u;

/** Read a string token and return its raw payload and next offset. */
function quoted(source, start, quote) {
  let content = '';
  let index = start + 1;
  while (index < source.length) {
    const next = source[index];
    if (next === '\\') {
      if (index + 1 >= source.length) return { error: 'unterminated escape', next: source.length };
      content += source.slice(index, index + 2);
      index += 2;
      continue;
    }
    if (next === quote) return { text: content, next: index + 1 };
    if (quote !== '`' && (next === '\n' || next === '\r')) {
      return { error: 'unterminated string', next: index };
    }
    content += next;
    index += 1;
  }
  return { error: 'unterminated string', next: source.length };
}

/** Decode common escaped Unicode forms; preserve unknown escapes literally. */
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

/**
 * Only lexical string tokens are inspected. The caller must additionally
 * inspect HTML, JSON and localisation catalogues as plain text.
 */
export function extractShippedStrings(source) {
  const strings = [];
  let position = 0;
  let previous = '';
  while (position < source.length) {
    const char = source[position];
    const next = source[position + 1];
    if (char === '/' && next === '/') {
      position = source.indexOf('\n', position + 2);
      if (position < 0) break;
      continue;
    }
    if (char === '/' && next === '*') {
      const stop = source.indexOf('*/', position + 2);
      position = stop < 0 ? source.length : stop + 2;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      const read = quoted(source, position, char);
      if (read.error) {
        return { strings, error: `${read.error} at offset ${position}` };
      }
      strings.push({ value: decodeStaticString(read.text), offset: position });
      position = read.next;
      previous = 'literal';
      continue;
    }
    if (char === '/' && next !== '=' && next !== '/' && next !== '*'
      && !['literal', 'identifier', ')', ']'].includes(previous)) {
      // Skip regular expression syntax, including escaped / and character sets.
      let cursor = position + 1;
      let insideClass = false;
      for (; cursor < source.length; cursor += 1) {
        const ch = source[cursor];
        if (ch === '\\') { cursor += 1; continue; }
        if (ch === '[') insideClass = true;
        if (ch === ']') insideClass = false;
        if (ch === '/' && !insideClass) break;
        if (ch === '\n') break;
      }
      if (source[cursor] === '/') {
        position = cursor + 1;
        while (/[a-z]/i.test(source[position] ?? '')) position += 1;
        previous = 'literal';
        continue;
      }
    }
    if (JS_IDENTIFIER.test(char)) {
      while (position < source.length && JS_IDENTIFIER.test(source[position])) position += 1;
      previous = 'identifier';
      continue;
    }
    if (!/\s/.test(char)) previous = char;
    position += 1;
  }
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
    const offset = Number(error.match(/offset (\\d+)/)?.[1] ?? 0);
    const excerpt = source.slice(Math.max(0, offset - 50), offset + 80).replace(/\\s+/g, ' ');
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
