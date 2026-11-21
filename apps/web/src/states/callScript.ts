/**
 * Builds the script for a phone call to one place, from what the pack holds about it. It reads the
 * address out in words, can spell the name, and asks the visit questions. It never looks anything
 * up and never fills a gap: where the pack is silent the script says so and tells the caller to ask.
 */
import { numberWords, digitWords } from "./numberWords";
import type { PackPlaceRecord } from "./packPlaces";
import { MAX_SPELL_CHARS, spellLine, spellUnits, worthSpelling } from "./spellOut";
import { parseAddress, type ParsedAddress } from "./streetAddress";
import type { Locale } from "./stateCopy";
import { scriptCopy as c } from "./callScriptCopy";
import { questionsFor } from "./visitQuestions";

export interface ScriptOptions {
  readonly spellName: boolean;
  readonly readAddress: boolean;
  readonly includeQuestions: boolean;
}

export const DEFAULT_SCRIPT_OPTIONS: ScriptOptions = { spellName: true, readAddress: true, includeQuestions: true };

export type LineKind = "say" | "ask" | "note" | "field";

export interface ScriptLine {
  readonly kind: LineKind;
  readonly text: string;
  /** What the pack says that makes a question worth asking. Present on questions only. */
  readonly basis?: string;
  /** Blank lines to leave for writing an answer, 0 for none. */
  readonly writeLines: number;
}

export interface ScriptSection {
  readonly id: "opening" | "place" | "address" | "questions" | "closing";
  readonly heading: string;
  readonly lines: readonly ScriptLine[];
}

export interface CallScript {
  readonly placeId: string;
  readonly title: string;
  readonly sections: readonly ScriptSection[];
  readonly footer: string;
  /** Everything the caller says or asks, in order, as plain sentences for reading aloud. */
  readonly spoken: readonly string[];
}

/** The civic number said the way people say it: "2650", "12A", "100 to 104". Null when there is none. */
export function spokenNumber(raw: string | null, locale: Locale): string | null {
  if (raw === null) return null;
  const m = /^(\d+)([A-Za-z]?)(?:\s*[-–]\s*(\d+)([A-Za-z]?))?$/.exec(raw.trim());
  if (!m) return digitWords(raw, locale) || null;
  const one = (digits: string, suffix: string): string => {
    const n = Number(digits);
    // A number with a leading zero or too long for words is read digit by digit.
    const words = digits.startsWith("0") && digits.length > 1 ? null : numberWords(n, locale);
    const body = words ?? digitWords(digits, locale);
    return suffix ? `${body} ${suffix.toUpperCase()}` : body;
  };
  const first = one(m[1]!, m[2]!);
  if (m[3] === undefined) return first;
  return `${first} ${locale === "fr" ? "à" : "to"} ${one(m[3], m[4] ?? "")}`;
}

/** The whole address as it would be said, or null when the pack holds no street to say. */
export function spokenAddress(address: ParsedAddress, locale: Locale): string | null {
  if (address.kind !== "street" || address.street === null) return null;
  const number = spokenNumber(address.number, locale);
  return `${number === null ? "" : `${number} `}${address.street}${address.unit ? `, ${address.unit}` : ""}`;
}

function addressSection(place: PackPlaceRecord, locale: Locale, readOut: boolean): ScriptSection {
  const parsed = parseAddress(place.address);
  const lines: ScriptLine[] = [];
  const say = readOut ? spokenAddress(parsed, locale) : null;
  if (say !== null) {
    lines.push({ kind: "say", text: c.addressSay(say, locale), writeLines: 0 });
    lines.push({ kind: "ask", text: c.addressAsk(locale), writeLines: 1 });
  } else if (parsed.kind === "street" && !readOut) {
    lines.push({ kind: "say", text: place.address ?? "", writeLines: 0 });
    lines.push({ kind: "ask", text: c.addressAsk(locale), writeLines: 1 });
  } else if (parsed.kind === "po-box") {
    lines.push({ kind: "note", text: c.addressPoBox(locale), writeLines: 1 });
  } else if (parsed.kind === "intersection") {
    lines.push({ kind: "note", text: c.addressIntersection(locale), writeLines: 1 });
  } else {
    lines.push({ kind: "note", text: c.addressNone(locale), writeLines: 1 });
  }
  return { id: "address", heading: c.addressHeading(locale), lines };
}

function placeSection(place: PackPlaceRecord, locale: Locale, spell: boolean): ScriptSection {
  const lines: ScriptLine[] = [];
  if (place.name === null) {
    lines.push({ kind: "note", text: c.placeNoName(locale), writeLines: 0 });
  } else {
    lines.push({ kind: "say", text: c.placeSay(place.name, locale), writeLines: 0 });
    // Only words a listener could mishear are spelled, and only when asked for.
    const hard = place.name.split(/\s+/).filter(worthSpelling);
    if (spell && hard.length > 0) {
      const target = hard.join(" ");
      const { cut } = spellUnits(target, locale);
      lines.push({ kind: "say", text: `${c.spellSay(locale)} ${spellLine(target, locale)}.`, writeLines: 0 });
      if (cut) lines.push({ kind: "note", text: c.spellCut(MAX_SPELL_CHARS, locale), writeLines: 0 });
    }
  }
  return { id: "place", heading: c.placeHeading(locale), lines };
}

/** Build the script. `today` is the device's day as YYYY-MM-DD and decides which gap questions are asked. */
export function buildCallScript(place: PackPlaceRecord, locale: Locale, today: string, options: ScriptOptions = DEFAULT_SCRIPT_OPTIONS): CallScript {
  const sections: ScriptSection[] = [
    { id: "opening", heading: c.openingHeading(locale), lines: [{ kind: "say", text: c.opening(locale), writeLines: 0 }] },
    placeSection(place, locale, options.spellName),
    addressSection(place, locale, options.readAddress),
  ];
  if (options.includeQuestions) {
    const questions = questionsFor(place, locale, today);
    sections.push({
      id: "questions",
      heading: c.questionsHeading(locale),
      lines: questions.map((q) => ({ kind: "ask", text: q.text, basis: q.basis, writeLines: 2 })),
    });
  }
  sections.push({
    id: "closing",
    heading: c.closingHeading(locale),
    lines: [
      { kind: "say", text: c.closing(locale), writeLines: 0 },
      { kind: "field", text: c.notePerson(locale), writeLines: 1 },
      { kind: "field", text: c.noteDate(locale), writeLines: 1 },
      { kind: "field", text: c.noteTime(locale), writeLines: 1 },
      { kind: "field", text: c.noteBack(locale), writeLines: 1 },
    ],
  });
  const spoken = sections.flatMap((s) => s.lines.filter((l) => l.kind === "say" || l.kind === "ask").map((l) => l.text));
  return { placeId: place.id, title: c.title(place.name, locale), sections, footer: c.footer(today, locale), spoken };
}

/** How many questions the script asks. */
export function questionCount(script: CallScript): number {
  return script.sections.find((s) => s.id === "questions")?.lines.length ?? 0;
}
