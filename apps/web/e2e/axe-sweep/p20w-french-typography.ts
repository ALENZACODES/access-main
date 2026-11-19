/** French-Canadian typography checks for displayed UI copy and accessible descriptions. */
export interface TypographyFragment {
  readonly path: string;
  readonly text: string;
  readonly language: string;
  readonly visible: boolean;
  readonly kind: "text" | "attribute";
}

export interface TypographyFinding {
  readonly code: string;
  readonly path: string;
  readonly excerpt: string;
  readonly offset: number;
}

export const NO_BREAK_SPACE = "\u00A0";
export const NARROW_NO_BREAK_SPACE = "\u202F";
export const CURLY_APOSTROPHE = "\u2019";
export const LEFT_GUILLEMET = "\u00AB";
export const RIGHT_GUILLEMET = "\u00BB";

function primary(language: string): string {
  return language.toLowerCase().split("-")[0]?.trim() ?? "";
}

function isPunctuationNeighbour(value: string): boolean {
  return /[\p{L}\p{N}»]/u.test(value);
}

function isAttachedToWord(text: string, index: number): boolean {
  const previous = text[index - 1] ?? "";
  const beforeSpace = text[index - 2] ?? "";
  return isPunctuationNeighbour(previous) ||
    (/[ \t\u00A0\u202F]/.test(previous) && isPunctuationNeighbour(beforeSpace));
}

function finding(code: string, path: string, text: string, offset: number): TypographyFinding {
  return { code, path, excerpt: text.slice(Math.max(0, offset - 24), Math.min(text.length, offset + 24)), offset };
}

/**
 * Checks only rules for which a single precise character is required.
 * The caller decides if the prose is French. English passages marked en are
 * intentionally excluded, and names or ISO dates never need a guess.
 */
export function frenchTypographyFindings(fragment: TypographyFragment): TypographyFinding[] {
  if (!fragment.visible || primary(fragment.language) !== "fr") return [];
  const text = fragment.text.normalize("NFC");
  const problems: TypographyFinding[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i] ?? "";
    const previous = i > 0 ? text[i - 1] ?? "" : "";
    const next = text[i + 1] ?? "";
    if (char === "'") {
      if (/\p{L}/u.test(previous) && /\p{L}/u.test(next)) {
        problems.push(finding("straight-apostrophe", fragment.path, text, i));
      }
      continue;
    }
    if (char === ":" && isAttachedToWord(text, i)) {
      if (previous !== NO_BREAK_SPACE) problems.push(finding("colon-space", fragment.path, text, i));
      continue;
    }
    if ((char === ";" || char === "!" || char === "?") && isAttachedToWord(text, i)) {
      if (previous !== NARROW_NO_BREAK_SPACE) problems.push(finding("narrow-space", fragment.path, text, i));
      continue;
    }
    if (char === LEFT_GUILLEMET && next !== NARROW_NO_BREAK_SPACE && next !== "") {
      problems.push(finding("open-guillemet", fragment.path, text, i));
      continue;
    }
    if (char === RIGHT_GUILLEMET && previous !== NARROW_NO_BREAK_SPACE && previous !== "") {
      problems.push(finding("close-guillemet", fragment.path, text, i));
    }
  }
  return problems;
}

export function auditFrenchFragments(fragments: readonly TypographyFragment[]): TypographyFinding[] {
  return fragments.flatMap(frenchTypographyFindings);
}

/**
 * Converts a draft into Canadian French punctuation. This is a draft helper,
 * not a live text mutation: the application must supply the correct copy.
 * It leaves URLs, email addresses, and dates unchanged.
 */
export function formatFrenchDraft(draft: string): string {
  const preserved: string[] = [];
  const tokens = draft.replace(/(?:https?:\/\/|mailto:)[^\s]+|\b[^\s@]+@[^\s@]+\.[^\s@]+/gi, (value) => {
    const index = preserved.push(value) - 1;
    return `\uE000${index}\uE001`;
  });
  const normalized = tokens.normalize("NFC").replace(/([\p{L}])'([\p{L}])/gu, `$1${CURLY_APOSTROPHE}$2`);
  const colon = normalized.replace(/[ \t\u00A0\u202F]*:/g, NO_BREAK_SPACE + ":");
  const narrow = colon.replace(/[ \t\u00A0\u202F]*([;!?])/g, NARROW_NO_BREAK_SPACE + "$1");
  const quoted = narrow
    .replace(/«[ \t\u00A0\u202F]*/g, LEFT_GUILLEMET + NARROW_NO_BREAK_SPACE)
    .replace(/[ \t\u00A0\u202F]*»/g, NARROW_NO_BREAK_SPACE + RIGHT_GUILLEMET);
  return quoted.replace(/\uE000(\d+)\uE001/g, (_match, digits: string) => preserved[Number(digits)] ?? "");
}

/** A standalone typography assertion never changes text supplied by the app. */
export function punctuationSummary(findings: readonly TypographyFinding[]): string {
  const grouped = new Map<string, number>();
  for (const item of findings) grouped.set(item.code, (grouped.get(item.code) ?? 0) + 1);
  return [...grouped.entries()].sort((a, b) => a[0].localeCompare(b[0]))
    .map(([name, count]) => `${name}: ${count}`).join("; ");
}

export function hasFrenchTypographyIssues(fragments: readonly TypographyFragment[]): boolean {
  return auditFrenchFragments(fragments).length > 0;
}

/** Latin text can contain apostrophes in codes; only letter-to-letter marks matter. */
export function unicodeApostrophePositions(text: string): number[] {
  const positions: number[] = [];
  for (let index = 1; index < text.length - 1; index += 1) {
    if (text[index] !== "'") continue;
    if (/\p{L}/u.test(text[index - 1] ?? "") && /\p{L}/u.test(text[index + 1] ?? "")) positions.push(index);
  }
  return positions;
}

export function trailingHardSpaces(text: string): number {
  const match = /[\u00A0\u202F]+$/.exec(text);
  return match?.[0].length ?? 0;
}

export function frenchSpacingToken(token: ":" | ";" | "!" | "?"): string {
  return (token === ":" ? NO_BREAK_SPACE : NARROW_NO_BREAK_SPACE) + token;
}

export function quoteFrench(value: string): string {
  return `${LEFT_GUILLEMET}${NARROW_NO_BREAK_SPACE}${value}${NARROW_NO_BREAK_SPACE}${RIGHT_GUILLEMET}`;
}

export function isFormattedFrenchQuote(value: string): boolean {
  return value.startsWith(LEFT_GUILLEMET + NARROW_NO_BREAK_SPACE) &&
    value.endsWith(NARROW_NO_BREAK_SPACE + RIGHT_GUILLEMET);
}

/** The caller can present these data-only codes in an accessible report. */
export function typographyCountsByPath(findings: readonly TypographyFinding[]): Record<string, number> {
  const result: Record<string, number> = Object.create(null) as Record<string, number>;
  for (const finding of findings) result[finding.path] = (result[finding.path] ?? 0) + 1;
  return result;
}
