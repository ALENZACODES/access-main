/**
 * Copy linter for user-facing strings. Blocks overclaims and prohibited wording and,
 * for French, checks typography. Used by the test suite over every string the states
 * package can produce, so a bad string fails CI.
 */
import type { Locale } from "./stateCopy";
import { lintFrench } from "./typography";
import { forbiddenOrgNeedles } from "../../../../packages/shared/test/forbiddenOrg.ts";

export type CopyIssue =
  | "overclaim-verified"
  | "overclaim-realtime"
  | "overclaim-partnership"
  | "overclaim-certified"
  | "overclaim-guarantee"
  | "mentions-ai"
  | "banned-organisation"
  | "straight-apostrophe"
  | "punctuation-spacing";

const escapeRegExp = (text: string): string => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Built only from the shared forbidden-name helper, so no name appears in this file. */
const ORG_PATTERN = new RegExp(forbiddenOrgNeedles().map(escapeRegExp).join("|"), "i");

const RULES: ReadonlyArray<readonly [CopyIssue, RegExp]> = [
  ["overclaim-verified", /\bverified\b|\bvérifi/i],
  ["overclaim-realtime", /real[- ]?time|temps réel|live data|à jour en direct/i],
  ["overclaim-partnership", /\bpartner|partenaire|official|officiel/i],
  ["overclaim-certified", /certified|certifi|\bAAA\b|conformant|conforme/i],
  ["overclaim-guarantee", /guarantee|garanti/i],
  ["mentions-ai", /\bAI\b|\bIA\b|artificial intelligence|intelligence artificielle/i],
  ["banned-organisation", ORG_PATTERN],
];

export function lintCopy(text: string, locale: Locale): CopyIssue[] {
  const issues: CopyIssue[] = [];
  for (const [issue, re] of RULES) if (re.test(text)) issues.push(issue);
  if (locale === "fr") issues.push(...lintFrench(text));
  return issues;
}
