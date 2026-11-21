/**
 * Elevator outage notices from the offline pack stored on this device (the pack's `elevator_status`).
 *
 * Each record is a saved copy of an operator's notice: the operator's own words, the time it was
 * last checked, and where it came from. It is not live status. A notice that is missing its words
 * or its time is still kept, with the missing part left as null, because a station name alone is
 * still something the person should check with the operator. A record that cannot be told apart
 * from another (no safe id, a repeated id) is dropped and counted, never repaired.
 */
import { cleanText } from "./packPlaces";
import { type RecordTier, readTier } from "./recordTier";
import { isIsoDate } from "./provenance";

export const MAX_NOTICES = 500;
const MAX_ID = 200;
const MAX_STOP_IDS = 40;
const MAX_STOP_ID = 40;
const MAX_NOTICE_TEXT = 600;

export type NoticeLanguage = "en" | "fr";

export interface ElevatorNotice {
  readonly id: string;
  /** null when the pack gives no station name. */
  readonly station: string | null;
  /** The operator's words as the pack holds them, cleaned of control characters. null when absent. */
  readonly text: string | null;
  /** The language the pack says the words are in. null when it says nothing usable. */
  readonly textLanguage: NoticeLanguage | null;
  /** Stop ids the notice names, as the pack gives them, without repeats. */
  readonly stopIds: readonly string[];
  /** The instant the notice was last checked, as the pack writes it. null when missing or not a real time. */
  readonly checkedAt: string | null;
  /** The calendar day of that instant in UTC (YYYY-MM-DD). null whenever checkedAt is. */
  readonly checkedDay: string | null;
  readonly sourceName: string | null;
  /** An https address, or null. A plain http address or anything else is not kept. */
  readonly sourceUrl: string | null;
  readonly licence: string | null;
  /** The day the pack copied the notice (YYYY-MM-DD). null when missing or not a real date. */
  readonly retrievedOn: string | null;
  /** The tier the record states; null when none is stated or it is not recognised. Never defaulted. */
  readonly tier: RecordTier | null;
}

export interface ParsedNotices {
  readonly notices: readonly ElevatorNotice[];
  /** Records that could not be used at all, plus any past the limit. */
  readonly dropped: number;
}

const INSTANT = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/;

/** The instant and its UTC day when `value` is a real ISO 8601 time with a zone; otherwise null. */
export function readInstant(value: unknown): { instant: string; day: string } | null {
  if (typeof value !== "string") return null;
  const m = INSTANT.exec(value);
  if (!m) return null;
  const [, date, hh, mm, ss, zone] = m as unknown as [string, string, string, string, string, string];
  if (!isIsoDate(date)) return null;
  if (Number(hh) > 23 || Number(mm) > 59 || Number(ss) > 59) return null;
  if (zone !== "Z") {
    const zh = Number(zone.slice(1, 3));
    const zm = Number(zone.slice(4, 6));
    if (zh > 14 || zm > 59) return null;
  }
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return { instant: value, day: new Date(ms).toISOString().slice(0, 10) };
}

/** An https address with a host and no spaces; anything else is null. */
export function readHttpsUrl(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (s.length > 500 || !/^https:\/\/[^\s/?#]+[^\s]*$/.test(s)) return null;
  try {
    return new URL(s).protocol === "https:" ? s : null;
  } catch {
    return null;
  }
}

function readLanguage(value: unknown): NoticeLanguage | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  if (v === "en" || v.startsWith("en-")) return "en";
  if (v === "fr" || v.startsWith("fr-")) return "fr";
  return null;
}

function readStopIds(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const id = typeof item === "number" && Number.isSafeInteger(item) && item >= 0 ? String(item) : typeof item === "string" ? item.trim() : "";
    if (id === "" || id.length > MAX_STOP_ID || !/^[\w.:-]+$/.test(id)) continue;
    if (!out.includes(id)) out.push(id);
    if (out.length >= MAX_STOP_IDS) break;
  }
  return out;
}

/** The pack's elevator records, read without trusting them. */
export function parseElevatorNotices(input: unknown): ParsedNotices {
  if (!Array.isArray(input)) return { notices: [], dropped: 0 };
  const notices: ElevatorNotice[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of input.slice(0, MAX_NOTICES)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      dropped++;
      continue;
    }
    const o = raw as Record<string, unknown>;
    /** Only a record's own keys count, so nothing is read from a prototype. */
    const r = (k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
    const id = cleanText(r("id"), MAX_ID);
    if (id === null || seen.has(id)) {
      dropped++;
      continue;
    }
    seen.add(id);
    const checked = readInstant(r("checked_at"));
    const retrieved = r("retrieved_at");
    notices.push({
      id,
      station: cleanText(r("station"), 120),
      text: cleanText(r("operator_text"), MAX_NOTICE_TEXT),
      textLanguage: readLanguage(r("operator_text_language")),
      stopIds: readStopIds(r("stop_ids")),
      checkedAt: checked?.instant ?? null,
      checkedDay: checked?.day ?? null,
      sourceName: cleanText(r("source_name"), 200),
      sourceUrl: readHttpsUrl(r("source_url")),
      licence: cleanText(r("licence"), 120),
      retrievedOn: isIsoDate(retrieved) ? retrieved : null,
      tier: readTier(r("tier")),
    });
  }
  dropped += Math.max(0, input.length - MAX_NOTICES);
  return { notices, dropped };
}
