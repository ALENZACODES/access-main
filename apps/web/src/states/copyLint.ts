/**
 * Copy linter for user-facing strings. Blocks overclaims and prohibited wording and,
 * for French, checks typography. Used by the test suite over every string the states
 * package can produce, so a bad string fails CI.
 */
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";

export type CopyIssue =
  | "overclaim-verified"
  | "overclaim-realtime"
  | "overclaim-partnership"
  | "overclaim-certified"
  | "overclaim-guarantee"
  | "mentions-ai"
  | "straight-apostrophe"
  | "punctuation-spacing";

const RULES: ReadonlyArray<readonly [CopyIssue, RegExp]> = [
  ["overclaim-verified", /\bverified\b|\bvérifi/i],
  ["overclaim-realtime", /real[- ]?time|temps réel|live data|à jour en direct/i],
  ["overclaim-partnership", /\bpartner|partenaire|official|officiel/i],
  ["overclaim-certified", /certified|certifi|\bAAA\b|conformant|conforme/i],
  ["overclaim-guarantee", /guarantee|garanti/i],
  ["mentions-ai", /\bAI\b|\bIA\b|artificial intelligence|intelligence artificielle/i],
];

export function lintCopy(text: string, locale: Locale): CopyIssue[] {
  const issues: CopyIssue[] = [];
  for (const [issue, re] of RULES) if (re.test(text)) issues.push(issue);
  if (locale === "fr") issues.push(...lintFrench(text));
  return issues;
}
