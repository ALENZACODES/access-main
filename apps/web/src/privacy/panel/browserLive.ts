// Lets the person see what their browser tells the App right now, for the questions the list says the App asks: the
// language, whether the device says it is online, two display settings, how much space the site uses and may use, and
// whether the browser promised to keep it. Nothing else is asked: not the colour scheme, not the user agent, not the
// screen, and never a request to keep the data (`persist`). The answers are shown on screen and are not stored or sent.
// A question the browser does not answer, or answers in a shape the App would not accept, stays UNKNOWN (null here).

import type { Locale } from "./copyLint";

export type BrowserQuestion = "language" | "online" | "contrast" | "motion" | "storage" | "persisted";

export const BROWSER_QUESTIONS: readonly BrowserQuestion[] = ["language", "online", "contrast", "motion", "storage", "persisted"];

/** What can be asked. Each method may be missing, may throw, and may answer in any shape; the reading checks all three. */
export interface BrowserHost {
  language?: () => unknown;
  online?: () => unknown;
  /** True when the setting is on. `contrast` is "(prefers-contrast: more)", `motion` is "(prefers-reduced-motion: reduce)". */
  prefers?: (setting: "contrast" | "motion") => unknown;
  storage?: () => Promise<{ usage?: unknown; quota?: unknown; persisted?: unknown }>;
}

export interface BrowserReading {
  language: string | null;
  online: boolean | null;
  contrast: boolean | null;
  motion: boolean | null;
  usage: number | null;
  quota: number | null;
  persisted: boolean | null;
}

export const EMPTY_BROWSER_READING: BrowserReading = { language: null, online: null, contrast: null, motion: null, usage: null, quota: null, persisted: null };

const LANGUAGE_TAG = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8}){0,4}$/;

/** A language tag as the browser writes it, or null. A longer or odd value is not shown, so a page cannot fill the panel. */
export function cleanLanguage(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return v.length <= 35 && LANGUAGE_TAG.test(v) ? v : null;
}

const asBoolean = (value: unknown): boolean | null => (typeof value === "boolean" ? value : null);

/** A whole, finite, non-negative number of bytes, or null. */
export function cleanBytes(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && Number.isSafeInteger(Math.round(value)) ? Math.round(value) : null;
}

function attempt<T>(has: boolean, ask: () => unknown, clean: (v: unknown) => T | null): T | null {
  if (!has) return null;
  try {
    return clean(ask());
  } catch {
    return null;
  }
}

/** Asks the host each question once. Never throws, and never gives a value that does not have the shape asked for. */
export async function readBrowser(host: BrowserHost): Promise<BrowserReading> {
  const prefers = host.prefers;
  const out: BrowserReading = {
    language: attempt(typeof host.language === "function", () => host.language?.(), cleanLanguage),
    online: attempt(typeof host.online === "function", () => host.online?.(), asBoolean),
    contrast: attempt(typeof prefers === "function", () => host.prefers?.("contrast"), asBoolean),
    motion: attempt(typeof prefers === "function", () => host.prefers?.("motion"), asBoolean),
    usage: null,
    quota: null,
    persisted: null,
  };
  if (typeof host.storage === "function") {
    try {
      const s = await host.storage();
      if (s !== null && typeof s === "object") {
        out.usage = cleanBytes(s.usage);
        out.quota = cleanBytes(s.quota);
        out.persisted = asBoolean(s.persisted);
      }
    } catch {
      // A browser that refuses to answer is the same as one that does not answer.
    }
  }
  return out;
}

/** The questions the browser gave an answer to. Storage counts as answered only when both numbers came. */
export function answeredQuestions(r: BrowserReading): BrowserQuestion[] {
  const out: BrowserQuestion[] = [];
  if (r.language !== null) out.push("language");
  if (r.online !== null) out.push("online");
  if (r.contrast !== null) out.push("contrast");
  if (r.motion !== null) out.push("motion");
  if (r.usage !== null && r.quota !== null) out.push("storage");
  if (r.persisted !== null) out.push("persisted");
  return out;
}

export type BrowserFindingCode = "no-answer" | "offline-now";

export interface BrowserFinding {
  code: BrowserFindingCode;
  question: BrowserQuestion;
}

export function checkBrowser(r: BrowserReading): BrowserFinding[] {
  const answered = new Set(answeredQuestions(r));
  const out: BrowserFinding[] = [];
  for (const question of BROWSER_QUESTIONS) if (!answered.has(question)) out.push({ code: "no-answer", question });
  if (r.online === false) out.push({ code: "offline-now", question: "online" });
  return out;
}

const QUESTION_NAME: Record<Locale, Record<BrowserQuestion, string>> = {
  en: { language: "The browser language", online: "Whether the device is online", contrast: "The more contrast setting", motion: "The less motion setting", storage: "The space used and allowed", persisted: "Whether the browser promised to keep the data" },
  fr: { language: "La langue du navigateur", online: "Si l’appareil est en ligne", contrast: "Le réglage de plus de contraste", motion: "Le réglage de moins de mouvement", storage: "L’espace utilisé et permis", persisted: "Si le navigateur a promis de garder les données" },
};

export function browserQuestionName(locale: Locale, q: BrowserQuestion): string {
  return QUESTION_NAME[locale][q];
}

export function browserFindingText(locale: Locale, f: BrowserFinding): string {
  if (f.code === "offline-now") return locale === "fr" ? "Votre appareil se dit hors ligne en ce moment." : "Your device says it is offline right now.";
  return locale === "fr" ? `${QUESTION_NAME.fr[f.question]}\u00A0: le navigateur n’a pas répondu.` : `${QUESTION_NAME.en[f.question]}: the browser gave no answer.`;
}

const UNITS: Record<Locale, readonly string[]> = { en: ["B", "kB", "MB", "GB", "TB"], fr: ["o", "ko", "Mo", "Go", "To"] };

/** A size in plain units with at most two figures that matter, for example "12 MB" or "1.5 GB". */
export function browserSize(locale: Locale, bytes: number): string {
  let value = bytes;
  let unit = 0;
  while (value >= 1000 && unit < UNITS.en.length - 1) {
    value /= 1000;
    unit += 1;
  }
  const text = unit === 0 ? String(Math.round(value)) : value < 10 ? value.toFixed(1).replace(/\.0$/, "") : String(Math.round(value));
  return `${locale === "fr" ? text.replace(".", ",") : text}${locale === "fr" ? " " : " "}${UNITS[locale][unit]}`;
}

const YES: Record<Locale, string> = { en: "Yes", fr: "Oui" };
const NO: Record<Locale, string> = { en: "No", fr: "Non" };
export const BROWSER_UNKNOWN: Record<Locale, string> = { en: "Unknown", fr: "Inconnu" };

/** What the browser said for one question, in plain words. Unknown stays unknown. */
export function browserAnswerText(locale: Locale, q: BrowserQuestion, r: BrowserReading): string {
  const yn = (v: boolean | null): string => (v === null ? BROWSER_UNKNOWN[locale] : v ? YES[locale] : NO[locale]);
  switch (q) {
    case "language":
      return r.language ?? BROWSER_UNKNOWN[locale];
    case "online":
      return yn(r.online);
    case "contrast":
      return yn(r.contrast);
    case "motion":
      return yn(r.motion);
    case "persisted":
      return yn(r.persisted);
    case "storage":
      if (r.usage === null || r.quota === null) return BROWSER_UNKNOWN[locale];
      return locale === "fr" ? `${browserSize("fr", r.usage)} sur ${browserSize("fr", r.quota)}` : `${browserSize("en", r.usage)} of ${browserSize("en", r.quota)}`;
  }
}

/** One sentence for the whole check: how many of the questions the browser answered. */
export function browserSummary(locale: Locale, answered: number, asked: number = BROWSER_QUESTIONS.length): string {
  if (locale === "fr") return `${answered} ${answered <= 1 ? "réponse" : "réponses"} sur ${asked} ${asked <= 1 ? "question" : "questions"}.`;
  return `${answered} ${answered === 1 ? "answer" : "answers"} to ${asked} ${asked === 1 ? "question" : "questions"}.`;
}

/** What the panel keeps after a check, until the person leaves or asks again. */
export interface BrowserCheckView {
  reading: BrowserReading;
  /** How many of the questions the browser answered */
  answered: number;
  findings: readonly BrowserFinding[];
}

export function browserCheck(reading: BrowserReading): BrowserCheckView {
  return { reading, answered: answeredQuestions(reading).length, findings: checkBrowser(reading) };
}

/** The pieces of the browser the host reads. Typed loosely, because every one of them can be missing or odd. */
export interface BrowserEnv {
  navigator?: {
    language?: unknown;
    onLine?: unknown;
    storage?: { estimate?: () => Promise<{ usage?: unknown; quota?: unknown } | undefined>; persisted?: () => Promise<unknown> };
  };
  matchMedia?: (query: string) => { matches?: unknown } | undefined;
}

const QUERY = { contrast: "(prefers-contrast: more)", motion: "(prefers-reduced-motion: reduce)" } as const;

/** A host over the real browser. It only calls the six things in the list: never `persist`, never a request for permission. */
export function browserHost(env: BrowserEnv = globalThis as unknown as BrowserEnv): BrowserHost {
  const nav = env.navigator;
  return {
    language: () => nav?.language,
    online: () => nav?.onLine,
    prefers: (setting) => (typeof env.matchMedia === "function" ? env.matchMedia(QUERY[setting])?.matches : undefined),
    storage: async () => {
      const s = nav?.storage;
      const out: { usage?: unknown; quota?: unknown; persisted?: unknown } = {};
      if (s !== undefined && typeof s.estimate === "function") {
        try {
          const e = await s.estimate();
          out.usage = e?.usage;
          out.quota = e?.quota;
        } catch {
          // Left unknown.
        }
      }
      if (s !== undefined && typeof s.persisted === "function") {
        try {
          out.persisted = await s.persisted();
        } catch {
          // Left unknown.
        }
      }
      return out;
    },
  };
}
