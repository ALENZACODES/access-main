/**
 * Detect text left in copied packages after the display-copy preparation pass.
 * This is an input-quality gate, not a substitute for examining built assets.
 * Protocol keys and internal identifiers are never interpreted as place claims.
 */
import { BANNED_PATTERNS } from './check.mjs';
import { extractShippedStrings, isLegacyTechnicalToken } from './bundle-copy.mjs';
import { TECHNICAL_VALUES } from './prepare-copy.mjs';

const URL_OR_PATH = /^(?:[a-z][a-z0-9+.-]*:|\.\.?\/|\/|@[a-z0-9_.-]+\/|#[\w-]+$|\.[\w-]+$)/i;
const IDENTIFIER = /^[\p{L}_$][\p{L}\p{N}_$.-]*$/u;
const VISIBLE_TAGS = new Set([
  'a', 'button', 'caption', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'label', 'legend', 'li', 'option', 'p', 'span', 'strong', 'summary', 'td', 'th', 'title',
]);

/** A value is display copy only when its meaning is presentable to a person. */
export function isDisplayCandidate(value) {
  if (!value || !value.trim()) return false;
  if (TECHNICAL_VALUES.has(value) || isLegacyTechnicalToken(value)) return false;
  if (URL_OR_PATH.test(value)) return false;
  if (IDENTIFIER.test(value) && !/^(?:verify|verified|unverified|verification)$/i.test(value)) return false;
  return true;
}

export function prohibitedCopyPatterns(text) {
  if (!isDisplayCandidate(text)) return [];
  return BANNED_PATTERNS.filter((pattern) => {
    pattern.lastIndex = 0;
    return pattern.test(text);
  }).map((pattern) => pattern.source);
}

/**
 * Analyse string tokens and return repeatable, non-sensitive locations.
 * Do not print the source literal: it could contain a private note.
 */
export function auditCopiedSourceStrings(source, file) {
  const { strings, error } = extractShippedStrings(source);
  if (error) return [{ file, offset: 0, code: 'SOURCE_LEX', detail: error }];
  const findings = [];
  for (const { value, offset } of strings) {
    const matched = prohibitedCopyPatterns(value);
    if (matched.length > 0) {
      findings.push({ file, offset, code: 'SOURCE_COPY', detail: 'Prohibited display wording remains' });
    }
  }
  return findings;
}

/**
 * Inspect unadorned JSX text. Complex mixed-content JSX must still pass
 * the built-artifact scan. This audit deliberately does not infer expression
 * output or attempt to rewrite arbitrary JSX syntax.
 */
export function auditCopiedJsxText(source, file) {
  const findings = [];
  const element = /<([a-z][a-z0-9]*)>([^<>{}\r\n]+)<\/\1>/gi;
  for (const match of source.matchAll(element)) {
    if (!VISIBLE_TAGS.has(match[1].toLowerCase())) continue;
    const index = match.index ?? 0;
    const prefix = source.slice(source.lastIndexOf('\n', index - 1) + 1, index);
    if (prefix.trimStart().startsWith('//')) continue;
    if (prohibitedCopyPatterns(match[2]).length > 0) {
      findings.push({ file, offset: index, code: 'JSX_COPY', detail: 'Prohibited JSX wording remains' });
    }
  }
  return findings;
}

export function auditPreparedModule(source, file) {
  const issues = auditCopiedSourceStrings(source, file);
  if (/\.[jt]sx$/i.test(file)) issues.push(...auditCopiedJsxText(source, file));
  return issues.sort((a, b) => a.offset - b.offset || a.code.localeCompare(b.code, 'en'));
}

export function formatCopyFinding(finding) {
  return `${finding.file}:${finding.offset} [${finding.code}] ${finding.detail}`;
}
