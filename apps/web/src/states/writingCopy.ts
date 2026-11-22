/**
 * Wording for the "wording of names and addresses" section. It says what was seen in the text and never says the
 * text is wrong: a pack may write a name or address this way on purpose.
 */
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import type { WritingFilter, WritingOrder, WritingReport } from "./writingReport";
import type { RuleHit, WritingRule } from "./writingRules";
import type { ApostropheMix } from "./writingApostrophe";
import { longDirection, shortDirection } from "./writingDirection";
import { STREET_TYPE_PAIRS, type StyleMix } from "./writingStyle";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
/** Quote the text seen in the pack's own words. */
const q = (s: string, l: Locale) => (l === "fr" ? `«\u00a0${s}\u00a0»` : `“${s}”`);

export const wrHeading = (l: Locale) => t(l, "Wording of names and addresses", "Rédaction des noms et des adresses");
export const wrToggle = (open: boolean, l: Locale) => (open ? t(l, "Hide the wording check", "Masquer l’examen de la rédaction") : t(l, "Look at how names and addresses are written", "Examiner la rédaction des noms et des adresses"));
export const wrIntro = (l: Locale) =>
  t(
    l,
    "Each name and address is read for things like all capital letters, a phone number or web address in the name, a postal code or province in the address, or a street type written two ways. These are things the text shows, not mistakes: a pack may write a place this way on purpose.",
    "Chaque nom et chaque adresse est lu à la recherche de choses comme les lettres toutes en majuscules, un numéro de téléphone ou une adresse web dans le nom, un code postal ou une province dans l’adresse, ou un type de rue écrit de deux façons. Ce sont des éléments que le texte montre, pas des erreurs\u00a0: un pack peut écrire un lieu ainsi exprès.",
  );
export const wrCoverage = (checked: number, nothing: number, l: Locale) =>
  t(
    l,
    `${checked} ${plural(checked, "place has", "places have")} a name or an address to read${nothing > 0 ? `; ${nothing} ${plural(nothing, "has", "have")} neither` : ""}.`,
    `${checked} lieu${checked > 1 ? "x ont" : " a"} un nom ou une adresse à lire${nothing > 0 ? `\u00a0; ${nothing} ${nothing > 1 ? "n’ont" : "n’a"} ni l’un ni l’autre` : ""}.`,
  );
export const wrSummary = (n: number, l: Locale) =>
  n === 0 ? t(l, "Nothing stood out in the wording.", "Rien ne se distingue dans la rédaction.") : t(l, `${n} ${plural(n, "place has", "places have")} wording worth a look.`, `${n} lieu${n > 1 ? "x ont" : " a"} une rédaction à examiner.`);
export const wrNoMatch = (l: Locale) => t(l, "No place matches that choice.", "Aucun lieu ne correspond à ce choix.");
export const wrFilterGroup = (l: Locale) => t(l, "Show", "Afficher");
export const wrOrderGroup = (l: Locale) => t(l, "Order", "Ordre");

export const wrRuleLabel = (r: WritingRule, l: Locale): string => {
  switch (r) {
    case "name-all-capitals": return t(l, "Name in capital letters", "Nom en majuscules");
    case "name-all-lower": return t(l, "Name in lower case", "Nom en minuscules");
    case "name-contact": return t(l, "Phone or web address in the name", "Téléphone ou adresse web dans le nom");
    case "name-is-address": return t(l, "Name that looks like an address", "Nom qui ressemble à une adresse");
    case "name-edge-punctuation": return t(l, "Punctuation at the edge of the name", "Ponctuation au bord du nom");
    case "name-repeated-word": return t(l, "Word repeated in the name", "Mot répété dans le nom");
    case "name-same-as-address": return t(l, "Name the same as the address", "Nom identique à l’adresse");
    case "address-all-capitals": return t(l, "Address in capital letters", "Adresse en majuscules");
    case "address-all-lower": return t(l, "Address in lower case", "Adresse en minuscules");
    case "address-postal-code": return t(l, "Postal code in the address", "Code postal dans l’adresse");
    case "address-province": return t(l, "Province in the address", "Province dans l’adresse");
    case "name-very-long": return t(l, "Very long name", "Nom très long");
    case "address-no-number": return t(l, "Street with no number", "Rue sans numéro");
    case "address-contact": return t(l, "Phone or web address in the address", "Téléphone ou adresse web dans l’adresse");
  }
};

/** What was seen, in one sentence, with the piece of text when the rule has one. */
export const wrHitLine = (h: RuleHit, l: Locale): string => {
  const seen = h.seen === null ? "" : h.seen;
  switch (h.rule) {
    case "name-all-capitals": return t(l, "The name is written in capital letters.", "Le nom est écrit en majuscules.");
    case "name-all-lower": return t(l, "The name is written in lower case.", "Le nom est écrit en minuscules.");
    case "name-contact": return t(l, `The name contains what looks like a phone number or web address: ${q(seen, l)}.`, `Le nom contient ce qui ressemble à un numéro de téléphone ou à une adresse web\u00a0: ${q(seen, l)}.`);
    case "name-is-address": return t(l, "The name looks like a street address.", "Le nom ressemble à une adresse municipale.");
    case "name-edge-punctuation": return t(l, `The name starts or ends with ${q(seen, l)}.`, `Le nom commence ou finit par ${q(seen, l)}.`);
    case "name-repeated-word": return t(l, `The word ${q(seen, l)} comes twice in a row in the name.`, `Le mot ${q(seen, l)} revient deux fois de suite dans le nom.`);
    case "name-same-as-address": return t(l, "The name is the same as the address.", "Le nom est identique à l’adresse.");
    case "name-very-long": return t(l, "The name is very long.", "Le nom est très long.");
    case "address-all-capitals": return t(l, "The address is written in capital letters.", "L’adresse est écrite en majuscules.");
    case "address-all-lower": return t(l, "The address is written in lower case.", "L’adresse est écrite en minuscules.");
    case "address-postal-code": return t(l, `The address includes what looks like a postal code: ${q(seen, l)}.`, `L’adresse comprend ce qui ressemble à un code postal\u00a0: ${q(seen, l)}.`);
    case "address-province": return t(l, `The address includes a province or country: ${q(seen, l)}.`, `L’adresse comprend une province ou un pays\u00a0: ${q(seen, l)}.`);
    case "address-no-number": return t(l, "The address has a street but no number.", "L’adresse comporte une rue mais pas de numéro.");
    case "address-contact": return t(l, `The address contains what looks like a phone number or web address: ${q(seen, l)}.`, `L’adresse contient ce qui ressemble à un numéro de téléphone ou à une adresse web\u00a0: ${q(seen, l)}.`);
  }
};

export const wrFilterLabel = (f: WritingFilter, l: Locale): string => {
  if (f === "all") return t(l, "All", "Tous");
  if (f === "names") return t(l, "Names", "Noms");
  if (f === "addresses") return t(l, "Addresses", "Adresses");
  if (f === "style") return t(l, "Street type written two ways", "Type de rue écrit de deux façons");
  if (f === "apostrophe") return t(l, "Apostrophe written two ways", "Apostrophe écrite de deux façons");
  if (f === "direction") return t(l, "Direction written two ways", "Direction écrite de deux façons");
  return wrRuleLabel(f, l);
};
export const wrOrderLabel = (o: WritingOrder, l: Locale) => (o === "most" ? t(l, "Most noticed first", "Le plus de remarques d’abord") : o === "name" ? t(l, "By name", "Par nom") : t(l, "Pack order", "Ordre du pack"));
export const wrNoName = (l: Locale) => t(l, "Name not in the pack", "Nom absent du pack");
export const wrNoAddress = (l: Locale) => t(l, "Address not in the pack", "Adresse absente du pack");

const form = (mix: StyleMix, f: "short" | "long") => (f === "short" ? shortForm(mix.long) : mix.long.charAt(0).toUpperCase() + mix.long.slice(1));
const shortForm = (long: string) => {
  const w = STREET_TYPE_PAIRS.find((p) => p.long === long)?.short[0] ?? long;
  return w.charAt(0).toUpperCase() + w.slice(1);
};
export const wrStyleLine = (mix: StyleMix, l: Locale) => {
  const total = mix.shortCount + mix.longCount;
  const here = mix.minority === "short" ? mix.shortCount : mix.longCount;
  const other = mix.minority === "short" ? "long" : "short";
  const otherCount = total - here;
  const usesWord = form(mix, mix.minority);
  const otherWord = form(mix, other);
  return t(
    l,
    `This address uses ${q(usesWord, l)}, as ${here} of ${total} street addresses of this type do; ${otherCount} write ${q(otherWord, l)}.`,
    `Cette adresse écrit ${q(usesWord, l)}, comme ${here} adresse${here > 1 ? "s" : ""} sur ${total} de ce type\u00a0; ${otherCount} écrivent ${q(otherWord, l)}.`,
  );
};
export const wrStyleSummary = (report: Pick<WritingReport, "mixes">, l: Locale) => {
  const n = report.mixes.length;
  return n === 0 ? "" : t(l, `${n} street ${plural(n, "type is", "types are")} written two ways in the list.`, `${n} type${n > 1 ? "s" : ""} de rue ${n > 1 ? "sont écrits" : "est écrit"} de deux façons dans la liste.`);
};
export const wrDirectionLine = (mix: StyleMix, l: Locale) => {
  const total = mix.shortCount + mix.longCount;
  const here = mix.minority === "short" ? mix.shortCount : mix.longCount;
  const otherCount = total - here;
  const usesWord = mix.minority === "short" ? shortDirection(mix.long) : longDirection(mix.long);
  const otherWord = mix.minority === "short" ? longDirection(mix.long) : shortDirection(mix.long);
  return t(
    l,
    `This address ends with ${q(usesWord, l)}, as ${here} of ${total} addresses with this direction do; ${otherCount} write ${q(otherWord, l)}.`,
    `Cette adresse se termine par ${q(usesWord, l)}, comme ${here} adresse${here > 1 ? "s" : ""} sur ${total} avec cette direction\u00a0; ${otherCount} écrivent ${q(otherWord, l)}.`,
  );
};
export const wrDirectionSummary = (report: Pick<WritingReport, "directionMixes">, l: Locale) => {
  const n = report.directionMixes.length;
  return n === 0 ? "" : t(l, `${n} ${plural(n, "direction is", "directions are")} written two ways in the list.`, `${n} direction${n > 1 ? "s sont écrites" : " est écrite"} de deux façons dans la liste.`);
};
const apostropheName = (f: ApostropheMix["minority"], l: Locale) => (f === "straight" ? t(l, "the straight form", "la forme droite") : t(l, "the curly form", "la forme courbe"));
export const wrApostropheLine = (mix: ApostropheMix, l: Locale) => {
  const total = mix.straightCount + mix.curlyCount;
  const here = mix.minority === "straight" ? mix.straightCount : mix.curlyCount;
  const otherCount = total - here;
  const other = mix.minority === "straight" ? "curly" : "straight";
  return t(
    l,
    `This name uses ${apostropheName(mix.minority, l)} of the apostrophe, as ${here} of ${total} names with an apostrophe do; ${otherCount} use ${apostropheName(other, l)}.`,
    `Ce nom utilise ${apostropheName(mix.minority, l)} de l’apostrophe, comme ${here} nom${here > 1 ? "s" : ""} sur ${total} avec une apostrophe\u00a0; ${otherCount} utilisent ${apostropheName(other, l)}.`,
  );
};
export const wrApostropheSummary = (report: Pick<WritingReport, "apostropheMix">, l: Locale) =>
  report.apostropheMix === null ? "" : t(l, "The apostrophe in names is written two ways in the list.", "L’apostrophe des noms est écrite de deux façons dans la liste.");
export const wrMoreLine = (n: number, l: Locale) => t(l, `${n} more ${plural(n, "place is", "places are")} in the saved files.`, `${n} autre${n > 1 ? "s" : ""} lieu${n > 1 ? "x figurent" : " figure"} dans les fichiers enregistrés.`);
export const wrCaveat = (l: Locale) => t(l, "Not a list of mistakes. The text is shown as the pack gives it and nothing is changed.", "Ce n’est pas une liste d’erreurs. Le texte est montré tel que le pack le donne et rien n’est modifié.");
export const wrSaveText = (l: Locale) => t(l, "Save as a text file", "Enregistrer en fichier texte");
export const wrSaveCsv = (l: Locale) => t(l, "Save as a CSV file", "Enregistrer en fichier CSV");
export const wrSavedLine = (name: string, l: Locale) => t(l, `Saved ${name}.`, `Fichier ${name} enregistré.`);
export const wrCannotSave = (l: Locale) => t(l, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.");
export const WR_TEXT_NAME: Readonly<Record<Locale, string>> = { en: "wording-of-names-and-addresses.txt", fr: "redaction-des-noms-et-adresses.txt" };
export const WR_CSV_NAME: Readonly<Record<Locale, string>> = { en: "wording-of-names-and-addresses.csv", fr: "redaction-des-noms-et-adresses.csv" };
export const WR_CSV_HEADER = ["place_id", "place_name", "address", "field", "rule", "seen", "street_type_note"] as const;
