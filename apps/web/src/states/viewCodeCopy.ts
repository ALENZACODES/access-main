import type { Locale } from "./stateCopy";
import { t } from "./typography";

/** FR lists join with a narrow no-break space before the semicolon. Done outside t() so typed words are never reshaped. */
export const viewJoin = (items: readonly string[], locale: Locale): string => items.join(locale === "fr" ? "\u202f; " : "; ");

/** Keys are code words and are shown as written. */
export function viewIgnoredText(ignored: readonly string[], locale: Locale): string {
  return `${t(locale, "Left out", "Laissé de côté")}${locale === "fr" ? "\u00a0" : ""}: ${viewJoin(ignored, locale)}`;
}

export const viewAppliedText = (n: number, locale: Locale): string =>
  n === 0 ? t(locale, "Nothing in this code can be used here.", "Rien dans ce code ne peut être utilisé ici.") : t(locale, `Settings found: ${n}.`, `Réglages trouvés\u00a0: ${n}.`);

export const viewAppliedStatus = (locale: Locale): string => t(locale, "View applied.", "Vue appliquée.");
