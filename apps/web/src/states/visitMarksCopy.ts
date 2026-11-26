/** Words for the visit marks. They describe the person's own notes; none says anything about a place. */
import { formatDate } from "./provenance";
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import type { MarkSummary, VisitMark, VisitStatus } from "./visitMarks";

export function statusName(status: VisitStatus, locale: Locale): string {
  switch (status) {
    case "to-visit": return t(locale, "To visit", "À visiter");
    case "been": return t(locale, "Been there", "Déjà allé");
    case "ruled-out": return t(locale, "Ruled out", "Écarté");
  }
}

export function noMarkName(locale: Locale): string {
  return t(locale, "No mark", "Aucune marque");
}

export function marksToolsLabel(open: boolean, locale: Locale): string {
  return open ? t(locale, "Hide marks", "Masquer les marques") : t(locale, "Mark places as to visit, been there or ruled out", "Marquer les lieux comme à visiter, déjà allé ou écarté");
}

export function marksLead(locale: Locale): string {
  return t(
    locale,
    "These marks are your own notes. They say nothing about the place, and they do not change what the pack says about it.",
    "Ces marques sont vos propres notes. Elles ne disent rien du lieu et ne changent pas ce que le lot en dit.",
  );
}

export function placeMarkLabel(name: string, locale: Locale): string {
  return t(locale, `Mark for ${name}`, `Marque pour ${name}`);
}

export function markDayLine(mark: VisitMark | null, locale: Locale): string {
  if (mark === null) return "";
  if (mark.markedOn === null) return t(locale, "Marked on a day that is not saved.", "Marquée un jour qui n’est pas enregistré.");
  return t(locale, `Marked ${formatDate(mark.markedOn, locale)}.`, `Marquée le ${formatDate(mark.markedOn, locale)}.`);
}

export function marksSummaryLine(s: MarkSummary, locale: Locale): string {
  const parts = [
    t(locale, `${s.counts["to-visit"]} to visit`, `${s.counts["to-visit"]} à visiter`),
    t(locale, `${s.counts.been} been there`, `${s.counts.been} déjà allé`),
    t(locale, `${s.counts["ruled-out"]} ruled out`, `${s.counts["ruled-out"]} écarté${s.counts["ruled-out"] > 1 ? "s" : ""}`),
    t(locale, `${s.unmarked} with no mark`, `${s.unmarked} sans marque`),
  ];
  return `${parts.join(", ")}.`;
}

export function elsewhereLine(n: number, locale: Locale): string {
  if (n <= 0) return "";
  return t(
    locale,
    `${n} ${n === 1 ? "mark is" : "marks are"} on places that are not on the list now.`,
    `${n} ${n === 1 ? "marque est sur un lieu qui n’est plus dans la liste" : "marques sont sur des lieux qui ne sont plus dans la liste"}.`,
  );
}

export function clearElsewhereLabel(locale: Locale): string {
  return t(locale, "Remove the marks on places not on the list", "Retirer les marques des lieux absents de la liste");
}

export function marksNotKept(locale: Locale): string {
  return t(locale, "These marks could not be saved on this device. They will be gone when you close the page.", "Ces marques n’ont pas pu être enregistrées sur cet appareil. Elles disparaîtront à la fermeture de la page.");
}

export function noListedPlaces(locale: Locale): string {
  return t(locale, "No place is on the list, so there is nothing to mark.", "Aucun lieu n’est dans la liste\u00a0: il n’y a rien à marquer.");
}

export function marksSaveText(locale: Locale): string {
  return t(locale, "Save the marks as a text file", "Enregistrer les marques en fichier texte");
}

export function marksSaveCsv(locale: Locale): string {
  return t(locale, "Save the marks as a CSV file", "Enregistrer les marques en fichier CSV");
}

export function marksSaved(file: string, locale: Locale): string {
  return t(locale, `Saved ${file}.`, `${file} enregistré.`);
}

export function marksSaveFailed(locale: Locale): string {
  return t(locale, "This browser could not make a file here.", "Ce navigateur n’a pas pu créer de fichier ici.");
}

export function markChanged(name: string, status: VisitStatus | null, locale: Locale): string {
  return status === null
    ? t(locale, `Mark removed for ${name}.`, `Marque retirée pour ${name}.`)
    : t(locale, `${name}: ${statusName(status, "en")}.`, `${name}\u00a0: ${statusName(status, "fr")}.`);
}

export function marksFull(locale: Locale): string {
  return t(locale, "No more marks can be kept. Remove one to add another.", "Aucune autre marque ne peut être conservée. Retirez-en une pour en ajouter une autre.");
}
