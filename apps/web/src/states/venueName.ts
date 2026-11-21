/**
 * Reads a place name the way a person would to see which names belong to one venue: "Sankofa Square",
 * "Sankofa Square Entrance" and "Entrance from Sankofa Square (via PATH)" share the base name
 * "sankofa square". It only reads the words in the name. It never decides that an entrance leads to a
 * place, and a name with no part word is simply the main place.
 */
export const PART_KINDS = ["main", "entrance", "elevator", "parking", "washroom", "ramp"] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** Part words, in either language, with accents removed. The first rule that matches a name sets its kind. */
const PART_RULES: ReadonlyArray<readonly [Exclude<PartKind, "main">, readonly string[]]> = [
  ["entrance", ["entrance", "entrances", "entry", "door", "doors", "gate", "entree", "entrees", "porte", "portes", "acces"]],
  ["elevator", ["elevator", "elevators", "lift", "lifts", "ascenseur", "ascenseurs"]],
  ["parking", ["parking", "garage", "stationnement"]],
  ["washroom", ["washroom", "washrooms", "restroom", "restrooms", "toilet", "toilets", "toilette", "toilettes"]],
  ["ramp", ["ramp", "ramps", "rampe", "rampes"]],
];

/** Words that join a part to its venue ("Entrance from X", "Parking at X") and are dropped from the base name. */
const LINKS = new Set(["from", "via", "at", "to", "of", "de", "du", "des", "a", "au", "aux", "depuis", "par"]);
/** Words that describe the way in without naming the venue. */
const QUALIFIERS = new Set(["underground", "main", "north", "south", "east", "west", "nord", "sud", "est", "ouest", "souterrain", "souterraine", "accessible", "public"]);

/** Articles at the start of a name, in either language. A lone article is kept: it may be the whole name. */
const ARTICLES = new Set(["the", "le", "la", "les", "l'"]);

const PART_WORDS: ReadonlyMap<string, Exclude<PartKind, "main">> = new Map(PART_RULES.flatMap(([kind, words]) => words.map((w) => [w, kind] as const)));

export function foldVenueName(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[\u2019\u2018\u0060\u00b4]/g, "'")
    .replace(/&/g, " and ")
    .replace(/\b([ld])'(?=[a-z0-9])/g, "$1' ")
    .replace(/[^a-z0-9' ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface ReadName {
  /** The words that name the venue, folded, or null when nothing is left (the name was only a part word). */
  readonly base: string | null;
  readonly kind: PartKind;
  /** The part word or words found, folded, in the order written. */
  readonly partWords: readonly string[];
}

/** Text inside brackets is a note about the way in, not part of the venue name. */
function withoutBrackets(s: string): string {
  return s.replace(/\([^)]*\)/g, " ").replace(/\[[^\]]*\]/g, " ");
}

export function readName(name: string | null | undefined): ReadName {
  if (name === null || name === undefined) return { base: null, kind: "main", partWords: [] };
  const words = foldVenueName(withoutBrackets(name)).split(" ").filter((w) => w !== "");
  if (words.length === 0) return { base: null, kind: "main", partWords: [] };
  const found: string[] = [];
  let kind: PartKind = "main";
  const kept: string[] = [];
  for (const w of words) {
    const k = PART_WORDS.get(w);
    if (k === undefined) {
      kept.push(w);
      continue;
    }
    found.push(w);
    if (kind === "main") kind = k;
  }
  // Drop link words and qualifiers at the start and the end, where a part is joined to its venue.
  const isEdge = (w: string) => LINKS.has(w) || (found.length > 0 && QUALIFIERS.has(w));
  while (kept.length > 0 && isEdge(kept[0]!)) kept.shift();
  while (kept.length > 0 && isEdge(kept[kept.length - 1]!)) kept.pop();
  // A leading article does not change which venue it is: "the tenor" and "tenor", "la place" and "place".
  while (kept.length > 1 && ARTICLES.has(kept[0]!)) kept.shift();
  return { base: kept.length === 0 ? null : kept.join(" "), kind, partWords: found };
}

/**
 * The base name as a reader would write it: the words of the name that make up its base, with their own case
 * and accents. "Entrée du Musée" gives "Musée". Null when the name has no base.
 */
export function venueDisplayBase(name: string | null | undefined): string | null {
  const base = readName(name).base;
  if (base === null || name === null || name === undefined) return null;
  const want = base.split(" ");
  const tokens = name.replace(/\([^)]*\)|\[[^\]]*\]/g, " ").split(/\s+/).filter((w) => w !== "");
  const out: string[] = [];
  let p = 0;
  for (const raw of tokens) {
    const words = foldVenueName(raw).split(" ").filter((w) => w !== "");
    if (words.length === 0) continue;
    if (words.every((w, i) => want[p + i] === w)) {
      out.push(raw);
      p += words.length;
    } else if (ARTICLES.has(words[0]!) && words.length > 1 && words.slice(1).every((w, i) => want[p + i] === w)) {
      // An elided article was dropped from the base, so its word is shown without it.
      out.push(raw.replace(/^[^\s'\u2019]+['\u2019]/, ""));
      p += words.length - 1;
    }
    if (p >= want.length) break;
  }
  return p === want.length && out.length > 0 ? out.join(" ") : null;
}

/** The base name alone, for matching. */
export function venueBase(name: string | null | undefined): string | null {
  return readName(name).base;
}

/** The kind of part a name describes. "main" when it has no part word. */
export function venuePartKind(name: string | null | undefined): PartKind {
  return readName(name).kind;
}

const LABELS: Readonly<Record<PartKind, { en: string; fr: string }>> = {
  main: { en: "Main place", fr: "Lieu principal" },
  entrance: { en: "Entrance", fr: "Entrée" },
  elevator: { en: "Elevator", fr: "Ascenseur" },
  parking: { en: "Parking", fr: "Stationnement" },
  washroom: { en: "Washroom", fr: "Toilettes" },
  ramp: { en: "Ramp", fr: "Rampe" },
};

export function venuePartLabel(kind: PartKind, locale: "en" | "fr"): string {
  return LABELS[kind][locale];
}
