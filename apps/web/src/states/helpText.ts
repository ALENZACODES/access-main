/** Picks the words for a language from a localised text, and says when it had to use the other language. */
import type { Localised } from "./packHelp";
import type { Locale } from "./stateCopy";

export interface PickedText {
  readonly text: string;
  /** The language the text is in. */
  readonly lang: Locale;
  /** True when the page's language was not given and the other one is shown instead. */
  readonly fallback: boolean;
}

export function pickText(l: Localised, locale: Locale): PickedText | null {
  const other: Locale = locale === "en" ? "fr" : "en";
  if (l[locale] !== null) return { text: l[locale], lang: locale, fallback: false };
  if (l[other] !== null) return { text: l[other], lang: other, fallback: true };
  return null;
}
