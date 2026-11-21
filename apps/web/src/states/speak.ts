/**
 * Reading text aloud with the browser's own voice. Nothing leaves the device: the browser speaks
 * the text it is given. Where the browser has no speech, `canSpeak` is false and nothing is done.
 * The speech object is passed in so tests can supply one.
 */
import type { Locale } from "./stateCopy";

export type SpeechRate = "slow" | "normal" | "fast";
export const SPEECH_RATES: Readonly<Record<SpeechRate, number>> = { slow: 0.8, normal: 1, fast: 1.25 };
export const MAX_CHUNK_CHARS = 180;

/** The slice of the browser's speech object that is used. */
export interface SpeechLike {
  speak(utterance: UtteranceLike): void;
  cancel(): void;
  getVoices(): readonly { lang: string; name: string }[];
}
export interface UtteranceLike {
  text: string;
  lang: string;
  rate: number;
  voice: { lang: string; name: string } | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
}
export type MakeUtterance = (text: string) => UtteranceLike;

export function isSpeechRate(v: unknown): v is SpeechRate {
  return v === "slow" || v === "normal" || v === "fast";
}

/** Split into pieces a voice will not drop: whole sentences, joined while they fit, long ones cut at a space. */
export function chunkForSpeech(lines: readonly string[], max = MAX_CHUNK_CHARS): string[] {
  const sentences: string[] = [];
  for (const line of lines) {
    for (const part of line.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/)) {
      if (part === "") continue;
      let rest = part;
      while (rest.length > max) {
        const at = rest.lastIndexOf(" ", max);
        const cut = at > 0 ? at : max;
        sentences.push(rest.slice(0, cut).trim());
        rest = rest.slice(cut).trim();
      }
      if (rest !== "") sentences.push(rest);
    }
  }
  const out: string[] = [];
  for (const s of sentences) {
    const last = out.length - 1;
    if (last >= 0 && out[last]!.length + 1 + s.length <= max) out[last] = `${out[last]} ${s}`;
    else out.push(s);
  }
  return out;
}

/** The first voice for the language, matching "fr" with "fr-CA" and "fr-FR" and preferring an exact regional match. */
export function pickVoice(voices: readonly { lang: string; name: string }[], locale: Locale): { lang: string; name: string } | null {
  const want = locale === "fr" ? "fr-CA" : "en-CA";
  const norm = (l: string) => l.replace("_", "-").toLowerCase();
  const exact = voices.find((v) => norm(v.lang) === want.toLowerCase());
  if (exact) return exact;
  return voices.find((v) => norm(v.lang).split("-")[0] === locale) ?? null;
}

export function canSpeak(speech: SpeechLike | null | undefined): speech is SpeechLike {
  return speech !== null && speech !== undefined && typeof speech.speak === "function" && typeof speech.cancel === "function";
}

export interface Reader {
  /** Stop and start over with these lines. Returns false when there is nothing to say or no speech. */
  start(lines: readonly string[], locale: Locale, rate: SpeechRate, onDone: () => void): boolean;
  stop(): void;
}

/** Reads the chunks one after another so that stopping takes effect at once and a long script is not cut off by the browser. */
export function makeReader(speech: SpeechLike | null | undefined, make: MakeUtterance): Reader {
  let token = 0;
  return {
    start(lines, locale, rate, onDone) {
      if (!canSpeak(speech)) return false;
      const chunks = chunkForSpeech(lines);
      speech.cancel();
      token += 1;
      if (chunks.length === 0) return false;
      const mine = token;
      const voice = pickVoice(speech.getVoices(), locale);
      const next = (i: number): void => {
        if (mine !== token) return;
        if (i >= chunks.length) {
          onDone();
          return;
        }
        const u = make(chunks[i]!);
        u.lang = voice?.lang ?? (locale === "fr" ? "fr-CA" : "en-CA");
        u.voice = voice;
        u.rate = SPEECH_RATES[rate];
        u.onend = () => next(i + 1);
        u.onerror = () => {
          if (mine === token) onDone();
        };
        speech.speak(u);
      };
      next(0);
      return true;
    },
    stop() {
      token += 1;
      if (canSpeak(speech)) speech.cancel();
    },
  };
}
