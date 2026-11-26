import type { PackRecord, PackSourceEntry } from "@access/shared";
import { say, type CopyKey, type Locale } from "./copy.ts";

/** One known fact for the summary: a label, a value in plain words, and the source it came from. */
export interface SummaryFact {
  key: string;
  label: string;
  value: string;
  /** Set when the value is source text in a language other than the screen's. */
  lang?: Locale;
  href?: string;
  sourceId: string;
}

export interface SummarySection {
  facts: SummaryFact[];
  sources: Array<{ sourceId: string; name: string; licence: string; date: string; tier: string }>;
}

const UNKNOWN = "UNKNOWN";

/** A field's value, or null when it is missing, empty or UNKNOWN. */
export function known(record: PackRecord, key: string): string | null {
  const field = record.fields[key];
  if (!field) return null;
  const value = field.value;
  if (value === null || value === undefined) return null;
  const text = typeof value === "string" ? value.trim() : typeof value === "number" || typeof value === "boolean" ? String(value) : "";
  return text && text.toUpperCase() !== UNKNOWN ? text : null;
}

const PLAIN: Record<string, CopyKey> = {
  yes: "yes",
  true: "yes",
  no: "no",
  false: "no",
  limited: "limited",
  designated: "designated",
  some_vehicles_accessible: "someVehicles",
  boarding_not_possible: "notPossible",
};

/** Yes/no style values in plain words; anything else as the source wrote it, with underscores read as spaces. */
function plain(locale: Locale, value: string): { text: string; fromSource: boolean } {
  const word = PLAIN[value.toLowerCase()];
  if (word) return { text: say(locale, word), fromSource: false };
  const spaced = value.replace(/_/g, " ");
  return { text: spaced.charAt(0).toUpperCase() + spaced.slice(1), fromSource: true };
}

function addressOf(record: PackRecord): string | null {
  const street = [known(record, "addr_housenumber"), known(record, "addr_street")].filter(Boolean).join(" ");
  const unit = known(record, "addr_unit");
  const parts = [unit && street ? `${unit}-${street}` : street, known(record, "addr_city"), known(record, "addr_postcode")].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(", ") : known(record, "address");
}

function websiteHref(value: string): string | null {
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}

type Spec = { key: string; label: CopyKey; kind?: "plain" | "text" | "metres" | "count" };

const GLANCE: Spec[] = [
  { key: "category", label: "kind", kind: "plain" },
  { key: "facility_type", label: "kind", kind: "plain" },
  { key: "level", label: "level", kind: "text" },
  { key: "opening_hours", label: "hours", kind: "text" },
  { key: "operator", label: "operator", kind: "text" },
  { key: "brand", label: "brand", kind: "text" },
  { key: "access", label: "access", kind: "plain" },
  { key: "fee", label: "fee", kind: "plain" },
  { key: "stop_code", label: "stopCode", kind: "text" },
  { key: "platform_code", label: "platform", kind: "text" },
  { key: "location", label: "location", kind: "text" },
  { key: "description", label: "description", kind: "text" },
];

const GETTING_IN: Spec[] = [
  { key: "wheelchair", label: "wheelchair", kind: "plain" },
  { key: "wheelchair_boarding", label: "boarding", kind: "plain" },
  { key: "wheelchair_description", label: "wheelchairNote", kind: "text" },
  { key: "entrance", label: "entrance", kind: "plain" },
  { key: "automatic_door", label: "automaticDoor", kind: "plain" },
  { key: "door", label: "door", kind: "plain" },
  { key: "door_width", label: "doorWidth", kind: "metres" },
  { key: "ramp", label: "ramp", kind: "plain" },
  { key: "ramp_wheelchair", label: "rampWheelchair", kind: "plain" },
  { key: "step_count", label: "stepCount", kind: "count" },
  { key: "kerb", label: "kerb", kind: "plain" },
  { key: "kerb_height", label: "kerbHeight", kind: "metres" },
  { key: "incline", label: "incline", kind: "text" },
  { key: "handrail", label: "handrail", kind: "plain" },
  { key: "tactile_paving", label: "tactilePaving", kind: "plain" },
  { key: "elevator", label: "elevator", kind: "plain" },
  { key: "surface", label: "surface", kind: "plain" },
  { key: "lit", label: "lit", kind: "plain" },
  { key: "capacity_disabled", label: "capacityDisabled", kind: "count" },
];

const INSIDE: Spec[] = [
  { key: "braille", label: "braille", kind: "plain" },
  { key: "hearing_loop", label: "hearingLoop", kind: "plain" },
  { key: "speech_output", label: "speechOutput", kind: "plain" },
  { key: "changing_table", label: "changingTable", kind: "plain" },
  { key: "adult_changing_table", label: "adultChangingTable", kind: "plain" },
  { key: "unisex", label: "unisex", kind: "plain" },
  { key: "locked", label: "locked", kind: "plain" },
  { key: "drinking_water", label: "drinkingWater", kind: "plain" },
  { key: "shower", label: "shower", kind: "plain" },
  { key: "indoor", label: "indoor", kind: "plain" },
  { key: "seasonal", label: "seasonal", kind: "plain" },
];

function factFor(record: PackRecord, spec: Spec, locale: Locale): SummaryFact | null {
  const value = known(record, spec.key);
  const sourceId = record.fields[spec.key]?.source_id;
  if (value === null || !sourceId) return null;
  const label = say(locale, spec.label);
  if (spec.kind === "plain") {
    const words = plain(locale, value);
    return { key: spec.key, label, value: words.text, sourceId, ...(words.fromSource && locale === "fr" ? { lang: "en" as const } : {}) };
  }
  if (spec.kind === "metres" && /^\d+(\.\d+)?$/.test(value)) {
    return { key: spec.key, label, value: `${locale === "fr" ? value.replace(".", ",") : value}\u00a0m`, sourceId };
  }
  if (spec.kind === "count" && /^\d+$/.test(value)) return { key: spec.key, label, value, sourceId };
  return { key: spec.key, label, value, sourceId, ...(locale === "fr" ? { lang: "en" as const } : {}) };
}

function section(record: PackRecord, sources: readonly PackSourceEntry[], facts: SummaryFact[]): SummarySection {
  const used = [...new Set(facts.map((fact) => fact.sourceId))];
  return {
    facts,
    sources: used.flatMap((sourceId) => {
      const entry = sources.find((source) => source.sourceId === sourceId);
      const field = Object.values(record.fields).find((item) => item?.source_id === sourceId);
      if (!entry || !field) return [];
      return [{ sourceId, name: entry.name, licence: field.licence, date: field.retrieved_at.slice(0, 10), tier: String(field.tier) }];
    }),
  };
}

/** What a place is, where, when it is open, and who runs it. Only known facts are listed. */
export function glanceFacts(record: PackRecord, sources: readonly PackSourceEntry[], locale: Locale): SummarySection {
  const facts: SummaryFact[] = [];
  const add = (fact: SummaryFact | null) => {
    if (fact && !facts.some((item) => item.label === fact.label)) facts.push(fact);
  };
  for (const spec of GLANCE.filter((item) => item.label === "kind")) add(factFor(record, spec, locale));
  const address = addressOf(record);
  const addressKey = ["addr_street", "addr_housenumber", "addr_city", "addr_postcode", "address"].find((key) => known(record, key) !== null);
  const addressSource = addressKey ? record.fields[addressKey]?.source_id : undefined;
  if (address && addressSource) add({ key: "address", label: say(locale, "address"), value: address, sourceId: addressSource });
  for (const spec of GLANCE.filter((item) => item.label !== "kind")) add(factFor(record, spec, locale));
  const websiteKey = ["website", "url"].find((key) => known(record, key) !== null);
  const website = websiteKey ? known(record, websiteKey) : null;
  const href = website ? websiteHref(website) : null;
  const websiteSource = websiteKey ? record.fields[websiteKey]?.source_id : undefined;
  if (website && href && websiteSource) add({ key: "website", label: say(locale, "website"), value: website.replace(/^https?:\/\//i, "").replace(/\/$/, ""), href, sourceId: websiteSource });
  const point = pointOf(record);
  const pointSource = record.fields.lat?.source_id;
  if (point && pointSource) add({ key: "point", label: say(locale, "point"), value: say(locale, "coordinates", { lat: point.lat.toFixed(5), lon: point.lon.toFixed(5) }), sourceId: pointSource });
  return section(record, sources, facts);
}

/** Wheelchair access, entrance, doors, ramps, steps, curbs and slopes. Only known facts are listed. */
export function gettingInFacts(record: PackRecord, sources: readonly PackSourceEntry[], locale: Locale): SummarySection {
  return section(record, sources, GETTING_IN.flatMap((spec) => factFor(record, spec, locale) ?? []));
}

/** Communication aids and facilities: braille, hearing loop, changing tables, water. Only known facts are listed. */
export function insideFacts(record: PackRecord, sources: readonly PackSourceEntry[], locale: Locale): SummarySection {
  return section(record, sources, INSIDE.flatMap((spec) => factFor(record, spec, locale) ?? []));
}

/** The record's point, when it has a known latitude and longitude. */
export function pointOf(record: PackRecord): { lat: number; lon: number } | null {
  const lat = Number(known(record, "lat"));
  const lon = Number(known(record, "lon"));
  return known(record, "lat") !== null && known(record, "lon") !== null && Number.isFinite(lat) && Number.isFinite(lon) ? { lat, lon } : null;
}
