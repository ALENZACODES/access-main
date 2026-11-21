/**
 * Words for the detail step of the pack fingerprint tool, in English and French. The lists say
 * which ids are only on one device, or on both with different details. They never say which
 * device is right.
 */
import type { BucketKey } from "./packFingerprint";
import type { DetailComparison, DetailProblem } from "./packGroupDetail";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export type DetailListKind = "only-here" | "only-there" | "changed";
export const DETAIL_LIST_KINDS: readonly DetailListKind[] = ["only-here", "only-there", "changed"];

const places = (n: number, locale: Locale): string => t(locale, `${n} ${n === 1 ? "place" : "places"}`, `${n} ${n === 1 ? "lieu" : "lieux"}`);
const groupList = (keys: readonly BucketKey[]): string => keys.join(", ");

export function detailIntro(groups: readonly BucketKey[], locale: Locale): string {
  const n = groups.length;
  return t(
    locale,
    `To find which places differ, copy a detail code for the ${n === 1 ? "group" : `${n} groups`} that differ (${groupList(groups)}) on each device, and paste the other device’s code below. A detail code holds place ids and short scrambled values: no names, notes or addresses.`,
    `Pour trouver quels lieux diffèrent, copiez sur chaque appareil un code de détail pour ${n === 1 ? "le groupe" : `les ${n} groupes`} qui ${n === 1 ? "diffère" : "diffèrent"} (${groupList(groups)}), puis collez ci-dessous le code de l’autre appareil. Un code de détail contient des identifiants de lieux et de courtes valeurs brouillées\u00a0: ni noms, ni notes, ni adresses.`,
  );
}

export function detailTooMany(n: number, max: number, locale: Locale): string {
  return t(
    locale,
    `Those groups hold ${places(n, locale)} on this device, more than a detail code can list (${max}). Compare the other details of the two packs another way.`,
    `Ces groupes contiennent ${places(n, locale)} sur cet appareil, soit plus que ce qu’un code de détail peut énumérer (${max}). Comparez autrement les autres détails des deux jeux de lieux.`,
  );
}

export const detailCopyButton = (n: number, locale: Locale): string => t(locale, `Copy the detail code (${places(n, locale)})`, `Copier le code de détail (${places(n, locale)})`);
export const detailCopied = (locale: Locale): string => t(locale, "Detail code copied.", "Code de détail copié.");
export const detailCopyFailed = (locale: Locale): string => t(locale, "This browser could not copy. The detail code is shown below so you can select it.", "Ce navigateur n’a pas pu copier. Le code de détail est affiché ci-dessous pour que vous puissiez le sélectionner.");
export const detailCodeLabel = (locale: Locale): string => t(locale, "Detail code for this device", "Code de détail de cet appareil");
export const detailPasteLabel = (locale: Locale): string => t(locale, "Paste a detail code from the other device", "Collez un code de détail de l’autre appareil");
export const detailPastePlaceholder = "PACKGRP v1 g=… n=…";

export function detailProblem(problem: DetailProblem, token: string | undefined, locale: Locale): string {
  switch (problem) {
    case "empty":
      return t(locale, "Paste a detail code to compare.", "Collez un code de détail à comparer.");
    case "too-long":
      return t(locale, "That text is too long to be a detail code. Paste only the code.", "Ce texte est trop long pour être un code de détail. Collez uniquement le code.");
    case "not-a-code":
      return t(locale, "That is not a detail code. It starts with PACKGRP, and the device code starts with PACKFP.", "Ce n’est pas un code de détail. Il commence par PACKGRP, alors que le code d’appareil commence par PACKFP.");
    case "unsupported-version":
      return t(locale, "This detail code was made by a different version of the App, so it cannot be compared.", "Ce code de détail a été produit par une autre version de l’application\u00a0: il ne peut pas être comparé.");
    case "incomplete":
      return t(locale, "The detail code is cut short. Copy all of it, including the last line.", "Le code de détail est tronqué. Copiez-le en entier, y compris la dernière ligne.");
    case "malformed":
      return token ? t(locale, `Part of the detail code cannot be read (${token}). Copy it again.`, `Une partie du code de détail est illisible (${token}). Copiez-le de nouveau.`) : t(locale, "Part of the detail code cannot be read. Copy it again.", "Une partie du code de détail est illisible. Copiez-le de nouveau.");
    case "typo":
      return t(locale, "The detail code has a typo or was changed after it was made, so it is not compared. Copy it again.", "Le code de détail contient une faute de frappe ou a été modifié après sa création\u00a0: il n’est pas comparé. Copiez-le de nouveau.");
  }
}

export function detailGroupsMismatch(there: readonly BucketKey[], here: readonly BucketKey[], locale: Locale): string {
  return t(
    locale,
    `That detail code covers groups ${groupList(there)}, but the groups that differ here are ${groupList(here)}. Make the code again on the other device, after comparing the device codes.`,
    `Ce code de détail couvre les groupes ${groupList(there)}, alors que les groupes qui diffèrent ici sont ${groupList(here)}. Refaites le code sur l’autre appareil, après avoir comparé les codes d’appareil.`,
  );
}

export function detailSummary(c: DetailComparison, locale: Locale): string {
  const a = c.onlyHere.length;
  const b = c.onlyThere.length;
  const d = c.changed.length;
  if (a === 0 && b === 0 && d === 0) {
    return t(locale, `In these groups, all ${places(c.same, locale)} match. The difference is somewhere else.`, `Dans ces groupes, les ${places(c.same, locale)} correspondent tous. La différence se trouve ailleurs.`);
  }
  return t(
    locale,
    `In these groups: ${places(c.same, locale)} match, ${a} only on this device, ${b} only on the other device, ${d} on both with different details.`,
    `Dans ces groupes\u00a0: ${places(c.same, locale)} ${c.same === 1 ? "correspond" : "correspondent"}, ${a} seulement sur cet appareil, ${b} seulement sur l’autre appareil, ${d} sur les deux avec des détails différents.`,
  );
}

export function detailListHeading(kind: DetailListKind, n: number, locale: Locale): string {
  switch (kind) {
    case "only-here":
      return t(locale, `Only on this device (${n})`, `Seulement sur cet appareil (${n})`);
    case "only-there":
      return t(locale, `Only on the other device (${n})`, `Seulement sur l’autre appareil (${n})`);
    case "changed":
      return t(locale, `On both, with different details (${n})`, `Sur les deux, avec des détails différents (${n})`);
  }
}

export const detailOtherName = (locale: Locale): string => t(locale, "name is on the other device", "le nom est sur l’autre appareil");

export function detailMore(n: number, locale: Locale): string {
  return t(locale, `and ${n} more`, `et ${n} autre${n === 1 ? "" : "s"}`);
}

export const detailLimit = (locale: Locale): string =>
  t(locale, "These lists only say where the two devices differ. They do not say which device has the better record.", "Ces listes disent seulement où les deux appareils diffèrent. Elles ne disent pas quel appareil a le meilleur enregistrement.");
