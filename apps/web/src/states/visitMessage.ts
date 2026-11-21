/**
 * A short message the person can send to a place, made from the questions not yet asked.
 *
 * The message names no one but the place, holds nothing about the sender, and says that the
 * details come from a saved copy of open data that may be missing or out of date. It asks;
 * it does not claim anything about the place beyond what the pack reports.
 */
import { OSM_CREDIT } from "./dataCredits";
import type { Locale } from "./stateCopy";
import { t } from "./typography";
import type { PlaceQuestions, VisitQuestion } from "./visitQuestions";

export interface DraftMessage {
  readonly subject: string;
  readonly body: string;
}

/** A mail link much longer than this is cut off by some mail apps, so a longer message is offered for copying only. */
export const MAX_MAILTO_LENGTH = 1800;

/** The questions that make sense to put in a message to the place: the contact question is the person's own. */
export function askableQuestions(place: PlaceQuestions, done: ReadonlySet<string>): VisitQuestion[] {
  return place.questions.filter((q) => q.topic !== "contact" && !done.has(q.key));
}

/** The draft for one place, or null when no question is left to ask. */
export function draftMessage(place: PlaceQuestions, locale: Locale, done: ReadonlySet<string> = new Set()): DraftMessage | null {
  const questions = askableQuestions(place, done);
  if (questions.length === 0) return null;
  const who = place.name ?? t(locale, "your place", "votre lieu");
  const lines: string[] = [
    t(locale, "Hello,", "Bonjour,"),
    "",
    t(locale, `I am planning to visit ${who} and have a few questions about getting in and getting around.`, `Je prévois de me rendre à ${who} et j’ai quelques questions sur l’accès et les déplacements.`),
    t(
      locale,
      'I am using a saved copy of open data. In my questions, "the pack" means that copy. Some details in it are missing or may be out of date.',
      "J’utilise une copie enregistrée de données ouvertes. Dans mes questions, «\u202fle pack\u202f» désigne cette copie. Certains détails y manquent ou peuvent être périmés.",
    ),
    "",
    ...questions.map((q, i) => `${i + 1}. ${q.text}`),
    "",
    t(locale, "Thank you for your time.", "Merci du temps que vous m’accorderez."),
    "",
    OSM_CREDIT,
  ];
  return { subject: t(locale, "Questions before a visit", "Questions avant une visite"), body: lines.join("\n") + "\n" };
}

/** A mailto link for the draft, with no address (the person chooses whom to write to), or null if it would be too long. */
export function mailtoHref(message: DraftMessage): string | null {
  const href = `mailto:?subject=${encodeURIComponent(message.subject)}&body=${encodeURIComponent(message.body.replace(/\n/g, "\r\n"))}`;
  return href.length <= MAX_MAILTO_LENGTH ? href : null;
}

/** The draft as one block of text, subject first, for copying. */
export function draftToText(message: DraftMessage, locale: Locale): string {
  return `${t(locale, "Subject", "Objet")}${locale === "fr" ? "\u00a0:" : ":"} ${message.subject}\n\n${message.body}`;
}
