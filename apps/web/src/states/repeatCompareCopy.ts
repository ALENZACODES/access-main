/** Wording for the field-by-field comparison of a group of possible repeats. */
import { REPEAT_FIELDS, type FieldState, type RepeatField } from "./repeatCompare";
import { DUPLICATE_REASONS } from "./duplicateScore";
import type { RepeatStats } from "./repeatStats";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

const FIELDS_EN: Record<RepeatField, string> = { name: "Name", address: "Address", kind: "Kind", tag: "Wheelchair tag", position: "Position", source: "Source", retrieved: "Retrieved on", note: "Note" };
const FIELDS_FR: Record<RepeatField, string> = { name: "Nom", address: "Adresse", kind: "Type", tag: "Balise d’accès en fauteuil roulant", position: "Position", source: "Source", retrieved: "Consulté le", note: "Note" };
export const repeatFieldLabel = (f: RepeatField, l: Locale) => (l === "fr" ? FIELDS_FR[f] : FIELDS_EN[f]);

const STATES_EN: Record<FieldState, string> = { same: "Same", differs: "Differs", partial: "Given by some only", none: "Not given" };
const STATES_FR: Record<FieldState, string> = { same: "Identique", differs: "Diffère", partial: "Donnée par certaines fiches seulement", none: "Non donnée" };
export const repeatStateLabel = (s: FieldState, l: Locale) => (l === "fr" ? STATES_FR[s] : STATES_EN[s]);

export const repeatCompareToggle = (open: boolean, l: Locale) => (open ? t(l, "Hide the comparison", "Masquer la comparaison") : t(l, "Compare these records field by field", "Comparer ces fiches champ par champ"));
export const repeatCompareCaption = (n: number, l: Locale) => t(l, `Group ${n}, field by field`, `Groupe ${n}, champ par champ`);
export const repeatCompareFieldHeader = (l: Locale) => t(l, "Field", "Champ");
export const repeatCompareState = (l: Locale) => t(l, "Match", "Concordance");
export const repeatCompareMember = (id: string, l: Locale) => t(l, `Record ${id}`, `Fiche ${id}`);
export const repeatCompareNotGiven = (l: Locale) => t(l, "not given", "non donné");
export const repeatCompareDiffering = (fields: readonly RepeatField[], l: Locale) =>
  fields.length === 0 ? t(l, "The records agree on every field they give.", "Les fiches concordent sur tous les champs qu’elles donnent.") : t(l, `They differ on: ${fields.map((f) => repeatFieldLabel(f, l)).join(", ")}.`, `Elles diffèrent sur\u00a0: ${fields.map((f) => repeatFieldLabel(f, l)).join(", ")}.`);
export const repeatCompareSpread = (m: number | null, l: Locale) => (m === null ? "" : t(l, `The records’ positions are up to ${m} m apart.`, `Les positions des fiches sont distantes d’au plus ${m}\u00a0m.`));
export const repeatCompareCaveat = (l: Locale) => t(l, "Nothing is chosen or merged here. The pack does not say which value is right.", "Rien n’est choisi ni fusionné ici. Le pack ne dit pas quelle valeur est la bonne.");
export const ALL_REPEAT_FIELD_LABELS = (l: Locale): string[] => REPEAT_FIELDS.map((f) => repeatFieldLabel(f, l));

const REASON_SHORT_EN = { "same-name": "same name", "similar-name": "similar name", "same-address": "same address", "very-near": "very near", near: "near", "same-kind": "same kind" } as const;
const REASON_SHORT_FR = { "same-name": "même nom", "similar-name": "nom semblable", "same-address": "même adresse", "very-near": "très proches", near: "proches", "same-kind": "même type" } as const;
/** One line: the sizes of the groups, then each reason that carried at least one group. */
export const repeatStatsLine = (s: RepeatStats, l: Locale): string => {
  const names = l === "fr" ? REASON_SHORT_FR : REASON_SHORT_EN;
  const reasons = DUPLICATE_REASONS.filter((r) => s.byReason[r] > 0).map((r) => `${names[r]} (${s.byReason[r]})`);
  const sizes = t(l, `${s.pairsOnly} of two places, ${s.larger} larger (up to ${s.largest}).`, `${s.pairsOnly} de deux lieux, ${s.larger} plus grands (jusqu’à ${s.largest}).`);
  const why = reasons.length === 0 ? "" : t(l, ` Reasons: ${reasons.join(", ")}.`, ` Raisons\u00a0: ${reasons.join(", ")}.`);
  const tags = s.tagDisagreements === 0 ? "" : t(l, ` ${s.tagDisagreements} ${s.tagDisagreements === 1 ? "group reports" : "groups report"} different tags.`, ` ${s.tagDisagreements} ${s.tagDisagreements === 1 ? "groupe rapporte" : "groupes rapportent"} des balises différentes.`);
  return `${sizes}${why}${tags}`;
};
