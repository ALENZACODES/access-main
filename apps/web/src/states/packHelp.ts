/**
 * Help numbers from the offline pack stored on this device (the pack's `help_numbers`).
 *
 * Each record is a saved copy: a name and a short "how" in English and French, the number as the
 * pack writes it, an optional https address, and where it came from. A language the pack does not
 * give stays null, and the view falls back to the other language and says so. A record that cannot
 * be told apart from another (no safe id, a repeated id) is dropped and counted, never repaired. A
 * record with no number is kept: the name and how still help, and the view says no number is saved.
 */
import { cleanText } from "./packPlaces";
import { readHttpsLink } from "./packUrl";
import { isIsoDate } from "./provenance";
import { type RecordTier, readTier } from "./recordTier";

/** Most records read from one pack. */
export const MAX_HELP_RECORDS = 500;

export interface Localised {
  readonly en: string | null;
  readonly fr: string | null;
}

export interface HelpNumber {
  readonly id: string;
  readonly name: Localised;
  readonly how: Localised;
  /** The number exactly as the pack writes it ("9-8-8", "1-866-531-2600"). null when absent. */
  readonly contact: string | null;
  /** An https address, or null. */
  readonly url: string | null;
  readonly sourceName: string | null;
  readonly sourceUrl: string | null;
  readonly licence: string | null;
  /** The day the pack copied it (YYYY-MM-DD); null when missing or not a real date. */
  readonly retrievedOn: string | null;
  readonly tier: RecordTier | null;
}

export interface ParsedHelp {
  readonly items: readonly HelpNumber[];
  readonly dropped: number;
}

const MAX_ID = 200;
const MAX_NAME = 160;
const MAX_HOW = 600;
const MAX_CONTACT = 40;

/** A localised text: an object with en and fr, each cleaned. A plain string is not a localised text. */
export function readLocalised(value: unknown, max: number): Localised {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return { en: null, fr: null };
  const o = value as Record<string, unknown>;
  const own = (k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
  return { en: cleanText(own("en"), max), fr: cleanText(own("fr"), max) };
}

/** A number as written: digits with the usual separators and an optional leading plus. Nothing else is a number. */
export function readContactText(value: unknown): string | null {
  const s = cleanText(value, MAX_CONTACT);
  if (s === null) return null;
  return /^[+(]?[0-9][0-9 ().\-\u2011]*$/.test(s) ? s : null;
}

export function parseHelpNumbers(input: unknown): ParsedHelp {
  if (!Array.isArray(input)) return { items: [], dropped: 0 };
  const items: HelpNumber[] = [];
  const seen = new Set<string>();
  let dropped = 0;
  for (const raw of input.slice(0, MAX_HELP_RECORDS)) {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
      dropped++;
      continue;
    }
    const o = raw as Record<string, unknown>;
    const r = (k: string): unknown => (Object.prototype.hasOwnProperty.call(o, k) ? o[k] : undefined);
    const id = cleanText(r("id"), MAX_ID);
    if (id === null || seen.has(id)) {
      dropped++;
      continue;
    }
    seen.add(id);
    const prov = typeof r("provenance") === "object" && r("provenance") !== null && !Array.isArray(r("provenance")) ? (r("provenance") as Record<string, unknown>) : {};
    const p = (k: string): unknown => (Object.prototype.hasOwnProperty.call(prov, k) ? prov[k] : undefined);
    const retrieved = p("retrieved_at");
    items.push({
      id,
      name: readLocalised(r("name"), MAX_NAME),
      how: readLocalised(r("how"), MAX_HOW),
      contact: readContactText(r("contact")),
      url: readHttpsLink(r("url")),
      sourceName: cleanText(p("source_name"), 200),
      sourceUrl: readHttpsLink(p("source_url")),
      licence: cleanText(p("licence"), 120),
      retrievedOn: isIsoDate(retrieved) ? retrieved : null,
      tier: readTier(p("tier")),
    });
  }
  dropped += Math.max(0, input.length - MAX_HELP_RECORDS);
  return { items, dropped };
}
