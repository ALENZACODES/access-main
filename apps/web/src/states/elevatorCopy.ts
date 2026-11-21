/** Words for the saved elevator notices. Every line says "saved copy" or "notice"; none says an elevator works. */
import type { ElevatorNotice } from "./packElevators";
import type { NoticeReading, NoticeState } from "./elevatorRead";
import { formatDate } from "./provenance";
import { tierLabel } from "./recordTier";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export function elevatorHeading(locale: Locale): string {
  return t(locale, "Saved elevator notices", "Avis d’ascenseur enregistrés");
}

export function elevatorLead(locale: Locale): string {
  return t(
    locale,
    "These are copies of the operator’s notices from when the pack was built. They are not live and may be out of date. Check with the operator before you rely on an elevator.",
    "Ce sont des copies des avis de l’exploitant, prises à la construction du lot. Elles ne sont pas en direct et peuvent être périmées. Renseignez-vous auprès de l’exploitant avant de compter sur un ascenseur.",
  );
}

export function droppedNote(n: number, locale: Locale): string {
  if (n <= 0) return "";
  return t(
    locale,
    `${n} saved ${n === 1 ? "record" : "records"} could not be read and ${n === 1 ? "is" : "are"} not shown.`,
    `${n} ${n === 1 ? "enregistrement n’a pas pu être lu et n’est pas affiché" : "enregistrements n’ont pas pu être lus et ne sont pas affichés"}.`,
  );
}

export function stationName(station: string, locale: Locale): string {
  return station === "" ? t(locale, "Station not named", "Station non nommée") : station;
}

export function stateText(state: NoticeState, locale: Locale): string {
  return state === "out-of-service"
    ? t(locale, "Out of service", "Hors service")
    : t(locale, "Back in service, as the notice says", "De nouveau en service, selon l’avis");
}

export interface ReadingLine {
  readonly label: string;
  readonly value: string;
}

/** What was read from the words, as label and value pairs. A part the words do not state is left out. */
export function readingLines(r: NoticeReading, locale: Locale): ReadingLine[] {
  const out: ReadingLine[] = [];
  if (r.elevator !== null) out.push({ label: t(locale, "Elevator", "Ascenseur"), value: r.elevator });
  if (r.state !== null) out.push({ label: t(locale, "The notice says", "L’avis indique"), value: stateText(r.state, locale) });
  if (r.cause === "maintenance") out.push({ label: t(locale, "Reason given", "Raison donnée"), value: t(locale, "Maintenance", "Entretien") });
  if (r.between !== null) out.push({ label: t(locale, "Between", "Entre"), value: r.between });
  return out;
}

export function noReadingNote(locale: Locale): string {
  return t(locale, "These words were not read into parts. They are shown as written.", "Ces mots n’ont pas été divisés en parties. Ils sont affichés tels quels.");
}

/** "Source: TTC GTFS-Realtime accessibility alerts. Licence: OGL-Toronto-1.0. Retrieved 13 November 2026. Tier 0." */
export function noticeSourceLine(n: Pick<ElevatorNotice, "sourceName" | "licence" | "retrievedOn" | "tier">, locale: Locale): string {
  const unknown = "UNKNOWN";
  const date = n.retrievedOn === null ? unknown : formatDate(n.retrievedOn, locale);
  return t(
    locale,
    `Source: ${n.sourceName ?? unknown}. Licence: ${n.licence ?? unknown}. Retrieved ${date}. ${tierLabel(n.tier, locale)}, saved copy.`,
    `Source\u00a0: ${n.sourceName ?? unknown}. Licence\u00a0: ${n.licence ?? unknown}. Consulté le ${date}. ${tierLabel(n.tier, locale)}, copie enregistrée.`,
  );
}

export function stopIdsLine(ids: readonly string[], locale: Locale): string {
  if (ids.length === 0) return "";
  return t(locale, `Stop ids in the notice: ${ids.join(", ")}.`, `Identifiants d’arrêt dans l’avis\u00a0: ${ids.join(", ")}.`);
}

export function languageNote(lang: "en" | "fr" | null, locale: Locale): string {
  if (lang === null || lang === locale) return "";
  return lang === "en" ? t(locale, "The notice is in English.", "L’avis est en anglais.") : t(locale, "The notice is in French.", "L’avis est en français.");
}

export function toolsLabel(open: boolean, locale: Locale): string {
  return open ? t(locale, "Hide search and saving", "Masquer la recherche et l’enregistrement") : t(locale, "Search, filter and save the notices", "Chercher, filtrer et enregistrer les avis");
}

export function searchLabel(locale: Locale): string {
  return t(locale, "Search the notices", "Chercher dans les avis");
}

export function searchHelp(locale: Locale): string {
  return t(locale, "A station, an elevator label, a place in the notice or a stop id.", "Une station, l’étiquette d’un ascenseur, un lieu de l’avis ou un identifiant d’arrêt.");
}

export function ageFilterLabel(locale: Locale): string {
  return t(locale, "When it was last checked", "Dernier contrôle");
}

export function sortLabel(locale: Locale): string {
  return t(locale, "Order", "Ordre");
}

export function allLabel(locale: Locale): string {
  return t(locale, "Any time", "N’importe quand");
}

export function sortName(sort: "station" | "oldest" | "newest", locale: Locale): string {
  if (sort === "station") return t(locale, "By station name", "Par nom de station");
  return sort === "oldest" ? t(locale, "Longest since checked first", "Contrôle le plus ancien d’abord") : t(locale, "Most recently checked first", "Contrôle le plus récent d’abord");
}

export function saveTextLabel(locale: Locale): string {
  return t(locale, "Save as a text file", "Enregistrer en fichier texte");
}

export function saveCsvLabel(locale: Locale): string {
  return t(locale, "Save as a CSV file", "Enregistrer en fichier CSV");
}

export function savedNote(file: string, locale: Locale): string {
  return t(locale, `Saved ${file}.`, `${file} enregistré.`);
}

export function saveFailedNote(locale: Locale): string {
  return t(locale, "This browser could not make a file here.", "Ce navigateur n’a pas pu créer de fichier ici.");
}
