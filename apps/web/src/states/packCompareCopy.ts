/** Words for the comparison page: what went wrong with a file, and why a row was skipped. */
import type { EarlierFileProblem, SkipReason } from "./packEarlier";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export function problemText(problem: EarlierFileProblem, locale: Locale, missing: readonly string[] = []): string {
  switch (problem) {
    case "empty":
      return t(locale, "The file is empty.", "Le fichier est vide.");
    case "too-large":
      return t(locale, "The file is too large to read here (the limit is 5 MB).", "Le fichier est trop gros pour être lu ici (la limite est de 5\u00a0Mo).");
    case "too-many-rows":
      return t(locale, "The file has too many rows to read here (the limit is 100,000).", "Le fichier compte trop de lignes pour être lu ici (la limite est de 100\u00a0000).");
    case "unterminated-quote":
      return t(locale, "A quotation mark in the file is never closed, so it cannot be read safely.", "Un guillemet du fichier n’est jamais refermé\u00a0: il ne peut pas être lu en toute sécurité.");
    case "no-header":
      return t(locale, "The file has no header row.", "Le fichier n’a pas de ligne d’en-tête.");
    case "missing-columns":
      return t(
        locale,
        `This is not a places file saved by the App. Missing columns: ${missing.join(", ")}.`,
        `Ce n’est pas un fichier de lieux enregistré par l’App. Colonnes manquantes\u00a0: ${missing.join(", ")}.`,
      );
    case "no-places":
      return t(locale, "The file has no usable place in it.", "Le fichier ne contient aucun lieu utilisable.");
  }
}

export function skipText(reason: SkipReason, locale: Locale): string {
  switch (reason) {
    case "no-id":
      return t(locale, "no place id", "pas d’identifiant de lieu");
    case "bad-id":
      return t(locale, "the place id has spaces or control characters", "l’identifiant du lieu contient des espaces ou des caractères de contrôle");
    case "repeated-id":
      return t(locale, "the place id is repeated", "l’identifiant du lieu est répété");
    case "short-row":
      return t(locale, "fewer cells than the header", "moins de cellules que l’en-tête");
    case "bad-tag":
      return t(locale, "the wheelchair tag is not one the App writes", "l’indication pour fauteuil roulant n’est pas de celles que l’App écrit");
    case "bad-position":
      return t(locale, "the position is not a valid pair of coordinates", "la position n’est pas une paire de coordonnées valide");
  }
}
