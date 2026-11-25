// Lets the person see whether their browser can do the three things the App needs to hand over a file: make a file in
// memory, make an address the browser can download from, and name the file it saves. The answers are shown on screen
// and are not stored or sent. Nothing is saved or downloaded by the check: it makes no file and no address, and it
// only asks whether the three things exist. A question the browser does not answer, or answers in a shape the App
// would not accept, stays UNKNOWN (null here) and is never turned into No.
//
// This file never calls the function that makes a download address. It only looks at whether the function exists, so
// the scan that lists the places that make files does not list this one.

import type { Locale } from "./copyLint";

export type SaveQuestion = "blob" | "address" | "attribute";

export const SAVE_QUESTIONS: readonly SaveQuestion[] = ["blob", "address", "attribute"];

/** What can be asked. Each method may be missing, may throw, and may answer in any shape; the reading checks all three. */
export interface SaveHost {
  /** Whether a file can be made in memory */
  blob?: () => unknown;
  /** Whether an address can be made for a file in memory */
  address?: () => unknown;
  /** Whether a link can carry the name of the file to save */
  attribute?: () => unknown;
}

export interface SaveReading {
  blob: boolean | null;
  address: boolean | null;
  attribute: boolean | null;
}

export const EMPTY_SAVE_READING: SaveReading = { blob: null, address: null, attribute: null };

const asBoolean = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

function attempt(ask: (() => unknown) | undefined): boolean | null {
  if (typeof ask !== "function") return null;
  try {
    return asBoolean(ask());
  } catch {
    return null;
  }
}

/** Asks the host each question once. Never throws, and never gives a value that is not a plain yes or no. */
export function readSave(host: SaveHost): SaveReading {
  // The methods are called through thunks so each keeps the host as `this`.
  return {
    blob: attempt(host.blob === undefined ? undefined : () => host.blob?.()),
    address: attempt(host.address === undefined ? undefined : () => host.address?.()),
    attribute: attempt(host.attribute === undefined ? undefined : () => host.attribute?.()),
  };
}

/** The questions the browser gave a yes or no to, in the order of the questions. */
export function answeredSave(r: SaveReading): SaveQuestion[] {
  return SAVE_QUESTIONS.filter((q) => r[q] !== null);
}

export type SaveFindingCode = "no-answer" | "missing";

export interface SaveFinding {
  code: SaveFindingCode;
  question: SaveQuestion;
}

/** One finding for each question with no answer, and one for each the browser said No to. */
export function checkSave(r: SaveReading): SaveFinding[] {
  const out: SaveFinding[] = [];
  for (const question of SAVE_QUESTIONS) {
    if (r[question] === null) out.push({ code: "no-answer", question });
    else if (r[question] === false) out.push({ code: "missing", question });
  }
  return out;
}

const QUESTION_NAME: Record<Locale, Record<SaveQuestion, string>> = {
  en: { blob: "Making a file in memory", address: "Making an address for the file", attribute: "Naming the file to save" },
  fr: { blob: "Fabriquer un fichier en mémoire", address: "Fabriquer une adresse pour le fichier", attribute: "Nommer le fichier à enregistrer" },
};

export function saveQuestionName(locale: Locale, q: SaveQuestion): string {
  return QUESTION_NAME[locale][q];
}

const YES: Record<Locale, string> = { en: "Yes", fr: "Oui" };
const NO: Record<Locale, string> = { en: "No", fr: "Non" };
export const SAVE_UNKNOWN: Record<Locale, string> = { en: "Unknown", fr: "Inconnu" };

/** What the browser said for one question, in plain words. Unknown stays unknown. */
export function saveAnswerText(locale: Locale, q: SaveQuestion, r: SaveReading): string {
  const v = r[q];
  return v === null ? SAVE_UNKNOWN[locale] : v ? YES[locale] : NO[locale];
}

export function saveFindingText(locale: Locale, f: SaveFinding): string {
  const name = QUESTION_NAME[locale][f.question];
  if (f.code === "missing") {
    return locale === "fr"
      ? `${name}\u00A0: le navigateur dit que ce n’est pas possible ici, alors le bouton d’un téléchargement peut ne rien faire.`
      : `${name}: the browser says this is not available here, so a download button may do nothing.`;
  }
  return locale === "fr" ? `${name}\u00A0: le navigateur n’a pas répondu.` : `${name}: the browser gave no answer.`;
}

/** One sentence for the whole check: how many of the questions the browser answered. */
export function saveSummary(locale: Locale, answered: number, asked: number = SAVE_QUESTIONS.length): string {
  if (locale === "fr") return `${answered} ${answered <= 1 ? "réponse" : "réponses"} sur ${asked} ${asked <= 1 ? "question" : "questions"}.`;
  return `${answered} ${answered === 1 ? "answer" : "answers"} to ${asked} ${asked === 1 ? "question" : "questions"}.`;
}

/** What the panel keeps after a check, until the person leaves or asks again. */
export interface SaveCheckView {
  reading: SaveReading;
  /** How many of the questions the browser answered */
  answered: number;
  findings: readonly SaveFinding[];
}

export function saveCheck(reading: SaveReading): SaveCheckView {
  return { reading, answered: answeredSave(reading).length, findings: checkSave(reading) };
}

/** The pieces of the browser the host looks at. Typed loosely, because every one of them can be missing or odd. */
export interface SaveEnv {
  Blob?: unknown;
  URL?: unknown;
  document?: { createElement?: (tag: string) => unknown };
}

/**
 * A host over the real browser. It only looks at whether three things exist. It makes no file and no address, and the
 * link it makes to look at is never put on the page.
 */
export function saveHost(env: SaveEnv = globalThis as unknown as SaveEnv): SaveHost {
  return {
    blob: () => typeof env.Blob === "function",
    address: () => {
      const u = env.URL;
      if (u === undefined || u === null || (typeof u !== "function" && typeof u !== "object")) return undefined;
      return typeof (u as { createObjectURL?: unknown }).createObjectURL === "function";
    },
    attribute: () => {
      const doc = env.document;
      if (doc === undefined || typeof doc.createElement !== "function") return undefined;
      const link = doc.createElement("a");
      return typeof link === "object" && link !== null ? "download" in link : undefined;
    },
  };
}
