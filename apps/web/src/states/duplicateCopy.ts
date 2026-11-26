/** Wording for the possible-duplicates tool. It says "may be the same place" and never says which record is right. */
import type { DuplicateReason, Strictness } from "./duplicateScore";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const dupHeading = (l: Locale) => t(l, "Possible repeats", "Répétitions possibles");
export const dupToggle = (open: boolean, l: Locale) => (open ? t(l, "Hide possible repeats", "Masquer les répétitions possibles") : t(l, "Look for places listed more than once", "Chercher les lieux listés plus d’une fois"));
export const dupIntro = (l: Locale) =>
  t(
    l,
    "Places whose name, street address or position are alike may be the same place listed twice. This only points at them. Two places can share a name and a street and still be different, and nothing is merged, hidden or removed. It cannot tell you which record is right.",
    "Des lieux dont le nom, l’adresse ou la position se ressemblent peuvent être un même lieu listé deux fois. Cela ne fait que les signaler. Deux lieux peuvent avoir le même nom et la même rue et rester différents, et rien n’est fusionné, caché ni retiré. Cela ne peut pas dire quelle fiche est la bonne.",
  );
export const dupLevelGroupLabel = (l: Locale) => t(l, "How alike places must be", "À quel point les lieux doivent se ressembler");
export const dupLevelLabel = (s: Strictness, l: Locale) => (s === "strict" ? t(l, "Very alike", "Très semblables") : s === "balanced" ? t(l, "Alike", "Semblables") : t(l, "Somewhat alike", "Plutôt semblables"));
export const dupNone = (l: Locale) => t(l, "No places on this list look alike at this level.", "Aucun lieu de cette liste ne se ressemble à ce niveau.");
export const dupNoPlaces = (l: Locale) => t(l, "There are no places to compare.", "Il n’y a aucun lieu à comparer.");
export const dupSummary = (groups: number, places: number, l: Locale) =>
  t(l, `${groups} ${groups === 1 ? "group" : "groups"} of places that look alike, ${places} places in all.`, `${groups} ${groups === 1 ? "groupe" : "groupes"} de lieux qui se ressemblent, ${places} lieux en tout.`);
export const dupSkippedLine = (n: number, l: Locale) =>
  n === 0 ? "" : t(l, `${n} very common ${n === 1 ? "name, address or area was" : "names, addresses or areas were"} left out because too many places share ${n === 1 ? "it" : "them"}.`, `${n} ${n === 1 ? "nom, adresse ou secteur très courant a été laissé de côté" : "noms, adresses ou secteurs très courants ont été laissés de côté"}, car trop de lieux ${n === 1 ? "le partagent" : "les partagent"}.`);
export const dupGroupLabel = (n: number, size: number, l: Locale) => t(l, `Group ${n}: ${size} places`, `Groupe ${n}\u00a0: ${size} lieux`);
export const dupNoName = (l: Locale) => t(l, "Name not in the pack", "Nom absent du pack");
export const dupTagsDiffer = (l: Locale) => t(l, "These records report different wheelchair tags. The pack does not say which is right.", "Ces fiches rapportent des balises d’accès en fauteuil roulant différentes. Le pack ne dit pas laquelle est la bonne.");
export const dupMemberFields = (l: Locale) => ({ address: t(l, "Address", "Adresse"), kind: t(l, "Kind", "Type"), tag: t(l, "Tag", "Balise"), id: t(l, "Id", "Id") });
export const dupUnknownValue = (l: Locale) => t(l, "UNKNOWN", "UNKNOWN");
export const dupMetresLine = (m: number, l: Locale) => t(l, `${Math.round(m)} m apart`, `${Math.round(m)}\u00a0m de distance`);

const REASONS_EN: Record<DuplicateReason, string> = {
  "same-name": "same name",
  "similar-name": "similar name",
  "same-address": "same street address",
  "very-near": "very near each other",
  near: "near each other",
  "same-kind": "same kind of place",
};
const REASONS_FR: Record<DuplicateReason, string> = {
  "same-name": "même nom",
  "similar-name": "nom semblable",
  "same-address": "même adresse civique",
  "very-near": "très proches l’un de l’autre",
  near: "proches l’un de l’autre",
  "same-kind": "même type de lieu",
};
export const dupReasonLabel = (r: DuplicateReason, l: Locale) => (l === "fr" ? REASONS_FR[r] : REASONS_EN[r]);
export const dupReasonsLine = (rs: readonly DuplicateReason[], l: Locale) => rs.map((r) => dupReasonLabel(r, l)).join(l === "fr" ? ", " : ", ");

export const dupSaveText = (l: Locale) => t(l, "Save as a text file", "Enregistrer en fichier texte");
export const dupSaveCsv = (l: Locale) => t(l, "Save as a CSV file", "Enregistrer en fichier CSV");
export const dupSavedLine = (name: string, l: Locale) => t(l, `Saved ${name}.`, `Fichier ${name} enregistré.`);
export const dupCannotSave = (l: Locale) => t(l, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici.");
export const DUP_TEXT_NAME: Readonly<Record<Locale, string>> = { en: "possible-repeats.txt", fr: "repetitions-possibles.txt" };
export const DUP_CSV_NAME: Readonly<Record<Locale, string>> = { en: "possible-repeats.csv", fr: "repetitions-possibles.csv" };
export const DUP_CSV_HEADER = ["group", "place_a_id", "place_a_name", "place_b_id", "place_b_name", "score", "reasons", "metres", "wheelchair_a", "wheelchair_b"] as const;
export const dupTextCaveat = (l: Locale) => t(l, "Places that may be the same place. Not a finding: nothing was merged or removed, and the pack does not say which record is right.", "Lieux qui pourraient être un même lieu. Ce n’est pas une conclusion\u00a0: rien n’a été fusionné ni retiré, et le pack ne dit pas quelle fiche est la bonne.");
