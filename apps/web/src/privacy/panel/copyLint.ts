// Developer-facing lint for user copy. Used by tests (and so by CI) to keep
// every EN/FR string inside the project's wording and typography rules.

export type Locale = "en" | "fr";

export type LintCode =
  | "empty"
  | "banned-term"
  | "fr-straight-apostrophe"
  | "fr-colon-space"
  | "fr-narrow-space"
  | "fr-guillemets";

export interface LintIssue {
  code: LintCode;
  /** Developer-facing explanation (English). */
  message: string;
  /** Offset in the text where the problem starts. */
  index: number;
}

interface Banned {
  re: RegExp;
  why: string;
}

// Terms the App must not use: overclaims, outside brands, AI wording, advice.
const BANNED_ALL: readonly Banned[] = [
  { re: /\bAAA\b/, why: "conformance level claim" },
  { re: /\bAI\b/, why: "AI wording" },
  { re: /artificial intelligence|\bLLM\b/i, why: "AI wording" },
];

const BANNED_EN: readonly Banned[] = [
  { re: /\bverified\b/i, why: "overclaim" },
  { re: /\breal[- ]?time\b/i, why: "overclaim" },
  { re: /\bpartner(s|ed|ship|ships)?\b/i, why: "partnership claim" },
  { re: /\bcertified\b/i, why: "overclaim" },
  { re: /\bguarantee[sd]?\b/i, why: "overclaim" },
  { re: /\beligib/i, why: "eligibility wording" },
];

// JavaScript's \b is not Unicode-aware (it fails after é), so French uses letter lookarounds.
const L0 = "(?<!\\p{L})";
const L1 = "(?!\\p{L})";
const fr = (src: string, flags = "iu"): RegExp => new RegExp(src, flags);

const BANNED_FR: readonly Banned[] = [
  { re: fr(`${L0}v[ée]rifi[ée]e?s?${L1}`), why: "overclaim" },
  { re: fr("temps r[ée]el"), why: "overclaim" },
  { re: fr(`${L0}partenaires?${L1}|partenariat`), why: "partnership claim" },
  { re: fr(`${L0}certifi[ée]e?s?${L1}`), why: "overclaim" },
  { re: fr(`${L0}garanti(?:e|s|es|t|r)?${L1}`), why: "overclaim" },
  { re: fr(`${L0}[ée]ligib`), why: "eligibility wording" },
  { re: fr(`${L0}IA${L1}|intelligence artificielle`, "u"), why: "AI wording" },
];

function push(out: LintIssue[], code: LintCode, message: string, index: number): void {
  out.push({ code, message, index });
}

function scan(out: LintIssue[], text: string, re: RegExp, code: LintCode, message: string): void {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
  for (const m of text.matchAll(g)) push(out, code, message, m.index ?? 0);
}

export function lintCopy(locale: Locale, text: string): LintIssue[] {
  const out: LintIssue[] = [];
  if (text.trim() === "") {
    push(out, "empty", "text is empty", 0);
    return out;
  }
  const banned = [...BANNED_ALL, ...(locale === "fr" ? BANNED_FR : BANNED_EN)];
  for (const b of banned) {
    for (const m of text.matchAll(new RegExp(b.re.source, b.re.flags.includes("g") ? b.re.flags : `${b.re.flags}g`))) {
      push(out, "banned-term", `${b.why}: "${m[0]}"`, m.index ?? 0);
    }
  }
  if (locale === "fr") {
    scan(out, text, /'/, "fr-straight-apostrophe", "use ’ (U+2019), not '");
    // A colon that ends a word and is followed by a space needs U+00A0 before it.
    scan(out, text, /[\p{L}\p{N})»] ?:(?=\s|$)/u, "fr-colon-space", "use U+00A0 before ':'");
    scan(out, text, /[\p{L}\p{N})»] ?[;!?]/u, "fr-narrow-space", "use U+202F before ; ! ?");
    scan(out, text, /«(?!\u202f)/u, "fr-guillemets", "use U+202F after «");
    scan(out, text, /(?<!\u202f)»/u, "fr-guillemets", "use U+202F before »");
  }
  return out;
}

/** Lint every string in a (possibly nested) copy table; functions are called with `sample`. */
export function lintTable(
  locale: Locale,
  table: unknown,
  sample = "2026-01-01",
  path = "",
): Array<LintIssue & { path: string }> {
  if (typeof table === "string") return lintCopy(locale, table).map((i) => ({ ...i, path }));
  if (typeof table === "function") {
    const v: unknown = (table as (s: string) => unknown)(sample);
    return lintTable(locale, v, sample, path);
  }
  if (table !== null && typeof table === "object") {
    return Object.entries(table).flatMap(([k, v]) =>
      lintTable(locale, v, sample, path === "" ? k : `${path}.${k}`),
    );
  }
  return [];
}
