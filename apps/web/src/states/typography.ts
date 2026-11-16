/**
 * French typography helpers.
 * Rules: ’ apostrophe, U+00A0 before ":", U+202F before ; ! ? and inside « ».
 * Colons inside times (10:30) and URLs (https://) are left alone.
 */
import type { Locale } from "./stateCopy";

export const NBSP = " ";
export const NNBSP = " ";

const isDigit = (c: string | undefined): boolean => c !== undefined && c >= "0" && c <= "9";
const isSpace = (c: string | undefined): boolean => c === " " || c === NBSP || c === NNBSP;

/** Normalise French punctuation. Idempotent. */
export function frTypography(input: string): string {
  const prepared = input
    .replace(/'/g, "’")
    .replace(new RegExp("«[" + NBSP + NNBSP + " ]*", "g"), "«" + NNBSP)
    .replace(new RegExp("[" + NBSP + NNBSP + " ]*»", "g"), NNBSP + "»");

  let out = "";
  for (let i = 0; i < prepared.length; i++) {
    const c = prepared[i]!;
    if (c === ":") {
      const prev = out[out.length - 1];
      const next = prepared[i + 1];
      if ((isDigit(prev) && isDigit(next)) || next === "/") {
        out += c;
        continue;
      }
      out = stripTrailingSpaces(out);
      out += out.length > 0 ? NBSP + c : c;
    } else if (c === ";" || c === "!" || c === "?") {
      out = stripTrailingSpaces(out);
      out += out.length > 0 ? NNBSP + c : c;
    } else {
      out += c;
    }
  }
  return out;
}

function stripTrailingSpaces(s: string): string {
  let end = s.length;
  while (end > 0 && isSpace(s[end - 1])) end--;
  return s.slice(0, end);
}

export type FrenchIssue = "straight-apostrophe" | "punctuation-spacing";

/** Report French typography problems in a string. Empty array means clean. */
export function lintFrench(s: string): FrenchIssue[] {
  const issues: FrenchIssue[] = [];
  if (s.includes("'")) issues.push("straight-apostrophe");
  if (s.replace(/'/g, "’") !== frTypography(s)) issues.push("punctuation-spacing");
  return issues;
}

/** Pick the string for a locale and apply French typography to the French one. */
export function t(locale: Locale, en: string, fr: string): string {
  return locale === "fr" ? frTypography(fr) : en;
}
