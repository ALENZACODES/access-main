/**
 * Words for the spot-check sheet, in English and French. The sheet puts what the pack reports next
 * to questions to answer by looking. It says "the pack reports", never that a place is accessible,
 * and never that a record is right or wrong: the person looking decides what they saw.
 */
import type { WheelchairTag } from "./packPlaces";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const SPOT_FILENAMES: Readonly<Record<Locale, { html: string; text: string; csv: string }>> = {
  en: { html: "spot-check-sheet.html", text: "spot-check-sheet.txt", csv: "spot-check-sheet.csv" },
  fr: { html: "feuille-d-observation-sur-place.html", text: "feuille-d-observation-sur-place.txt", csv: "feuille-d-observation-sur-place.csv" },
};

export const CHECK_KEYS = ["step", "door", "ramp", "level", "match"] as const;
export type CheckKey = (typeof CHECK_KEYS)[number];
export type AnswerKey = "yes" | "no" | "not-sure" | "same" | "different" | "could-not-tell";

export const CHECK_ANSWERS: Readonly<Record<CheckKey, readonly AnswerKey[]>> = {
  step: ["yes", "no", "not-sure"],
  door: ["yes", "no", "not-sure"],
  ramp: ["yes", "no", "not-sure"],
  level: ["yes", "no", "not-sure"],
  match: ["same", "different", "could-not-tell"],
};

const places = (n: number, locale: Locale): string => t(locale, `${n} ${n === 1 ? "place" : "places"}`, `${n} ${n === 1 ? "lieu" : "lieux"}`);

export function sheetTitle(count: number, locale: Locale): string {
  return t(locale, `Spot-check sheet: ${places(count, locale)}`, `Feuille d’observation sur place\u00a0: ${places(count, locale)}`);
}

export function sheetIntro(seed: string, balanced: boolean, locale: Locale): string {
  const how = balanced
    ? t(locale, "taken in turn from each wheelchair tag the pack reports", "prises à tour de rôle parmi chaque étiquette de fauteuil roulant du jeu de lieux")
    : t(locale, "drawn at random", "tirées au hasard");
  return t(
    locale,
    `These places were ${how}, using the seed “${seed}”. For each one, look at the place in person and answer the questions. The tag shown is what the saved pack reports, with its source. Your answers are for you: nothing here is sent or saved by the App.`,
    `Ces lieux ont été ${how}, avec la valeur de départ «\u202f${seed}\u202f». Pour chacun, allez voir le lieu et répondez aux questions. L’étiquette indiquée est celle que rapporte le jeu de lieux enregistré, avec sa source. Vos réponses sont pour vous\u00a0: rien ici n’est envoyé ni enregistré par l’application.`,
  );
}

export const sheetFooter = (locale: Locale): readonly string[] => [
  t(locale, "What the pack reports is a report with a source and a date. It is not a finding, and what you see may differ.", "Ce que rapporte le jeu de lieux est un rapport avec une source et une date. Ce n’est pas un constat, et ce que vous voyez peut différer."),
  t(locale, "This sheet does not change the pack. Places were chosen to spread the looking, not to represent the whole pack.", "Cette feuille ne modifie pas le jeu de lieux. Les lieux ont été choisis pour répartir les visites, non pour représenter tout le jeu."),
];

export function tagWord(tag: WheelchairTag, locale: Locale): string {
  switch (tag) {
    case "yes":
      return t(locale, "Yes", "Oui");
    case "limited":
      return t(locale, "Limited", "Limité");
    case "no":
      return t(locale, "No", "Non");
    case "designated":
      return t(locale, "Designated", "Désigné");
    case "unknown":
      return "UNKNOWN";
  }
}

export function checkQuestion(key: CheckKey, locale: Locale): string {
  switch (key) {
    case "step":
      return t(locale, "Is there a step at the main entrance?", "Y a-t-il une marche à l’entrée principale\u00a0?");
    case "door":
      return t(locale, "Can the main door be opened without help?", "La porte principale peut-elle s’ouvrir sans aide\u00a0?");
    case "ramp":
      return t(locale, "Is there a ramp or a lift where there is a step?", "Y a-t-il une rampe ou un élévateur là où il y a une marche\u00a0?");
    case "level":
      return t(locale, "Is the way from the door to the main area level?", "Le trajet entre la porte et l’aire principale est-il de niveau\u00a0?");
    case "match":
      return t(locale, "Does what you see match the tag the pack reports?", "Ce que vous voyez correspond-il à l’étiquette que rapporte le jeu de lieux\u00a0?");
  }
}

export function answerWord(key: AnswerKey, locale: Locale): string {
  switch (key) {
    case "yes":
      return t(locale, "Yes", "Oui");
    case "no":
      return t(locale, "No", "Non");
    case "not-sure":
      return t(locale, "Not sure", "Pas certain");
    case "same":
      return t(locale, "Same", "Pareil");
    case "different":
      return t(locale, "Different", "Différent");
    case "could-not-tell":
      return t(locale, "Could not tell", "Impossible à dire");
  }
}

export const labels = {
  name: (l: Locale) => t(l, "Name", "Nom"),
  id: (l: Locale) => t(l, "Place id", "Identifiant du lieu"),
  tag: (l: Locale) => t(l, "The pack reports", "Le jeu de lieux rapporte"),
  address: (l: Locale) => t(l, "Address", "Adresse"),
  category: (l: Locale) => t(l, "Kind of place", "Type de lieu"),
  note: (l: Locale) => t(l, "Pack note", "Note du jeu de lieux"),
  visitedOn: (l: Locale) => t(l, "Date you looked", "Date de votre visite"),
  notes: (l: Locale) => t(l, "Your notes", "Vos notes"),
  questions: (l: Locale) => t(l, "Questions to answer by looking", "Questions auxquelles répondre sur place"),
} as const;

export function sourceLine(source: string, retrieved: string, locale: Locale): string {
  return t(locale, `${source}, retrieved ${retrieved}`, `${source}, consulté le ${retrieved}`);
}

export function seedLabel(locale: Locale): string {
  return t(locale, "Seed", "Valeur de départ");
}

export function noPlaces(locale: Locale): string {
  return t(locale, "There are no places to choose from.", "Il n’y a aucun lieu à choisir.");
}

export function spotSampleLine(shown: number, wanted: number, available: number, locale: Locale): string {
  if (available === 0) return noPlaces(locale);
  if (shown < wanted) {
    return t(locale, `Only ${places(available, locale)} to choose from, so ${shown === 1 ? "that one is" : "all of them are"} on the sheet.`, `Il n’y a que ${places(available, locale)} à choisir\u00a0: ${shown === 1 ? "il figure" : "tous figurent"} sur la feuille.`);
  }
  return t(locale, `${places(shown, locale)} chosen from ${available}.`, `${places(shown, locale)} choisi${shown === 1 ? "" : "s"} parmi ${available}.`);
}

export function tallyLine(byTag: Readonly<Record<WheelchairTag, number>>, locale: Locale): string {
  const order: WheelchairTag[] = ["yes", "limited", "no", "designated", "unknown"];
  const parts = order.filter((k) => byTag[k] > 0).map((k) => t(locale, `${tagWord(k, locale)}: ${byTag[k]}`, `${tagWord(k, locale)}\u00a0: ${byTag[k]}`));
  return parts.length === 0 ? "" : t(locale, `By the tag the pack reports: ${parts.join("; ")}.`, `Selon l’étiquette rapportée\u00a0: ${parts.join("; ")}.`);
}
