/**
 * Language annotations for English-only passages produced by the linked housing
 * tool. This module never translates text or changes evidence values.
 *
 * The host is responsible for identifying the language of isolated sentences
 * when the embedded package has not localized them. The patterns are narrow:
 * unrecognized text is left untouched for the accessibility audit to report.
 */
export type AnnotationKind = "record-completeness" | "local-report-privacy";

const COMPLETENESS = /^\d+ of \d+ fields in this record are recorded; the rest are Unknown\.$/;
const REPORT_PRIVACY = /^Optional\. Fixed choices only: no name, contact details, address or free text\. The date is kept as a calendar quarter\. Saved on this device; nothing is sent\.$/;

export function englishHousingPassage(text: string): AnnotationKind | null {
  const normalized = text.normalize("NFC").replace(/\s+/g, " ").trim();
  if (COMPLETENESS.test(normalized)) return "record-completeness";
  if (REPORT_PRIVACY.test(normalized)) return "local-report-privacy";
  return null;
}

/** Only mark elements whose entire rendered sentence is recognized English. */
export function annotateEnglishHousingPassages(root: HTMLElement): number {
  let changed = 0;
  for (const paragraph of root.querySelectorAll<HTMLParagraphElement>("p")) {
    const kind = englishHousingPassage(paragraph.textContent ?? "");
    const owned = paragraph.dataset.housingEnglishAnnotation === "1";
    if (kind === null) {
      if (owned) {
        paragraph.removeAttribute("lang");
        delete paragraph.dataset.housingEnglishAnnotation;
        changed += 1;
      }
      continue;
    }
    // Never overwrite a language explicitly selected by the embedded package.
    if (paragraph.hasAttribute("lang") && !owned) continue;
    if (paragraph.lang !== "en" || !owned) {
      paragraph.lang = "en";
      paragraph.dataset.housingEnglishAnnotation = "1";
      changed += 1;
    }
  }
  return changed;
}
