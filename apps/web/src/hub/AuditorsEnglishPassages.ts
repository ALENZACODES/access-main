/**
 * Explicit language boundaries for two English-only paragraphs supplied by
 * the embedded auditors tool. Never deduce a language from a place name,
 * number, evidence field, or an accessibility status.
 */
export type ShellLanguage = "en" | "fr";

/** The two templates currently emitted by the linked tool in English. */
const INSTRUCTIONS = [
  "Choose the Coordinator role to move a report to its next step.",
  "A date is not permanent proof. An observation supports tier 1 for ",
] as const;

export function isAuditorsEnglishPassage(value: string): boolean {
  const text = value.normalize("NFC").replace(/\s+/g, " ").trim();
  if (text === INSTRUCTIONS[0]) return true;
  // The policy explanation includes interpolated durations. Anchor both ends
  // so unrelated prose cannot acquire a language annotation accidentally.
  return text.startsWith(INSTRUCTIONS[1]) &&
    text.includes(" tier 2 for ") &&
    text.includes(" tier 3 for ") &&
    text.endsWith("Nothing is promoted because time passes.");
}

/**
 * Mark only matching paragraphs that are actually English under a French
 * shell. Preserve any existing explicit language declaration and all text.
 * The data attribute records ownership, so a locale change can undo only
 * annotations this adapter added, leaving upstream markup unchanged.
 */
export function annotateAuditorsEnglish(
  root: HTMLElement,
  shellLanguage: ShellLanguage,
): number {
  let marked = 0;
  for (const paragraph of root.querySelectorAll<HTMLParagraphElement>("p")) {
    const owned = paragraph.dataset.p20sEnglish === "1";
    const match = isAuditorsEnglishPassage(paragraph.textContent ?? "");
    if (shellLanguage === "en" || !match) {
      if (owned) {
        paragraph.removeAttribute("lang");
        delete paragraph.dataset.p20sEnglish;
      }
      continue;
    }
    // A translated or independently marked element is not ours to rewrite.
    if (paragraph.hasAttribute("lang") && !owned) continue;
    paragraph.setAttribute("lang", "en");
    paragraph.dataset.p20sEnglish = "1";
    marked += 1;
  }
  return marked;
}
