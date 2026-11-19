/**
 * Language boundaries for two English-only sentences emitted by the embedded
 * housing depth and local-report components. This is presentation metadata:
 * do not change evidence, search results, text or local storage.
 */
export type HousingEnglishSentence = "completeness" | "privacy";

const COMPLETENESS = /^\d+ of \d+ fields in this record are recorded; the rest are Unknown\.$/;
const PRIVACY = /^Optional\. Fixed choices only: no name, contact details, address or free text\. The date is kept as a calendar quarter\. Saved on this device; nothing is sent\.$/;

export function normalizeHousingSentence(value: string): string {
  return value.normalize("NFC").replace(/\s+/g, " ").trim();
}

/** Explicit classification; other sentences must remain subject to the audit. */
export function housingEnglishSentence(value: string): HousingEnglishSentence | null {
  const text = normalizeHousingSentence(value);
  if (COMPLETENESS.test(text)) return "completeness";
  if (PRIVACY.test(text)) return "privacy";
  return null;
}

const ANNOTATED = "data-housing-language-owner";

/**
 * Only an exact, complete English paragraph receives lang=en. A paragraph
 * already bearing an upstream language annotation is never overwritten.
 * When the upstream text changes, our old annotation is withdrawn.
 */
export function annotateHousingEnglish(root: HTMLElement): number {
  let changes = 0;
  for (const paragraph of Array.from(root.querySelectorAll<HTMLParagraphElement>("p"))) {
    const match = housingEnglishSentence(paragraph.textContent ?? "");
    const owned = paragraph.getAttribute(ANNOTATED) === "housing";
    if (match === null) {
      if (owned) {
        paragraph.removeAttribute("lang");
        paragraph.removeAttribute(ANNOTATED);
        changes += 1;
      }
      continue;
    }
    if (paragraph.hasAttribute("lang") && !owned) continue;
    if (paragraph.getAttribute("lang") !== "en" || !owned) {
      paragraph.setAttribute("lang", "en");
      paragraph.setAttribute(ANNOTATED, "housing");
      changes += 1;
    }
  }
  return changes;
}
