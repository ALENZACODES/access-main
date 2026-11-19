/** French copy typography checks; preserves explicit English spans. */
export type CopyLanguage = "en" | "fr" | "UNKNOWN";
export interface CopySpan {
  readonly id: string;
  readonly text: string;
  readonly language: CopyLanguage;
  readonly visible: boolean;
  readonly userFacing: boolean;
}
export interface CopyFinding {
  readonly code: string;
  readonly id: string;
  readonly index: number;
  readonly detail: string;
}
export interface CopyReport {
  readonly inspected: number;
  readonly unknown: number;
  readonly findings: readonly CopyFinding[];
}
const quote = "«";
const endQuote = "»";
const nbsp = "\u00a0";
const narrow = "\u202f";
const punctuation = new Set([";", "!", "?"]);
const spaces = new Set([" ", "\t", "\n", "\r", "\u00a0", "\u202f"]);
const finding = (code: string, id: string, index: number, detail: string): CopyFinding => ({ code, id, index, detail });

export function isFrenchPunctuation(char: string): boolean {
  return punctuation.has(char) || char === ":" || char === quote || char === endQuote;
}
export function checkFrenchSpan(span: CopySpan): CopyFinding[] {
  if (!span.visible || !span.userFacing || span.language !== "fr") return [];
  const issues: CopyFinding[] = [];
  const value = span.text.normalize("NFC");
  for (let index = 0; index < value.length; index += 1) {
    const char = value[index]!;
    const previous = value[index - 1] ?? "";
    const next = value[index + 1] ?? "";
    if (char === "'" && /[\p{L}]/u.test(previous) && /[\p{L}]/u.test(next)) {
      issues.push(finding("apostrophe-curly", span.id, index, "Use U+2019 between letters"));
    }
    if (char === ":" && index > 0 && previous !== nbsp && previous !== "/") {
      issues.push(finding("colon-nbsp", span.id, index, "Use U+00A0 before a colon"));
    }
    if (punctuation.has(char) && index > 0 && previous !== narrow) {
      issues.push(finding("punctuation-nnbsp", span.id, index, "Use U+202F before ; ! ?"));
    }
    if (char === quote && next !== narrow) {
      issues.push(finding("guillemet-open-nnbsp", span.id, index, "Use U+202F after opening guillemet"));
    }
    if (char === endQuote && previous !== narrow) {
      issues.push(finding("guillemet-close-nnbsp", span.id, index, "Use U+202F before closing guillemet"));
    }
    if (char === nbsp && (punctuation.has(next) || next === endQuote)) {
      issues.push(finding("wrong-nbsp-kind", span.id, index, "Use the narrow nonbreaking space"));
    }
    if (char === narrow && next === ":") {
      issues.push(finding("colon-wrong-space", span.id, index, "Use regular nonbreaking space"));
    }
  }
  return issues;
}
export function checkFrenchCopy(spans: readonly CopySpan[]): CopyReport {
  const issues = spans.flatMap(checkFrenchSpan);
  return {
    inspected: spans.filter((span) => span.visible && span.userFacing && span.language === "fr").length,
    unknown: spans.filter((span) => span.visible && span.userFacing && span.language === "UNKNOWN").length,
    findings: issues,
  };
}
export function normalizeFrenchWhitespace(value: string): string {
  return value.normalize("NFC").replace(/\s+/gu, " ").trim();
}
export function hasForeignLanguageMark(span: CopySpan): boolean {
  return span.language === "en";
}
export function copyInventory(spans: readonly CopySpan[]): Readonly<Record<CopyLanguage, number>> {
  const result: Record<CopyLanguage, number> = { en: 0, fr: 0, UNKNOWN: 0 };
  for (const span of spans) if (span.visible && span.userFacing) result[span.language] += 1;
  return result;
}
export function copyMarkers(spans: readonly CopySpan[]): readonly string[] {
  return spans.filter((span) => span.visible && span.userFacing && span.language === "UNKNOWN").map((span) => span.id);
}
export function buildFrenchTypographyExample(): string {
  return `L’application${nbsp}:${narrow}${quote}${narrow}Inconnu${narrow}${endQuote}${narrow}!`;
}
export function requiredSpaceBefore(char: string): string | null {
  if (char === ":") return nbsp;
  if (punctuation.has(char) || char === endQuote) return narrow;
  return null;
}
export function requiredSpaceAfter(char: string): string | null {
  return char === quote ? narrow : null;
}
export function hasUnexpectedLeadingSpace(value: string): boolean {
  return value.length > 0 && spaces.has(value[0]!);
}
export function summariseFrenchIssues(issues: readonly CopyFinding[], limit = 25): string {
  if (!Number.isSafeInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
  const lines = [...new Set(issues.map((item) => `${item.code} ${item.id}@${item.index}: ${item.detail}`))];
  return [...lines.slice(0, limit), ...(lines.length > limit ? [`${lines.length - limit} more issues`] : [])].join("\n");
}
