/**
 * Reads the street out of an address line exactly as the pack gives it. It only splits and tidies the
 * text it is given. It never looks anything up, never guesses a missing part, and when a line cannot be
 * read as one street it says so (kind "none", "po-box" or "intersection") instead of inventing a street.
 * English and French forms are both read: "100 King St E", "100 rue Sainte-Catherine Ouest".
 */

export type AddressKind = "street" | "po-box" | "intersection" | "none";
export type Direction = "N" | "E" | "S" | "W";

export interface ParsedAddress {
  readonly kind: AddressKind;
  /** The civic number as written ("100", "100A", "100-104"), or null. */
  readonly number: string | null;
  /** The first number as an integer, or null. A range "100-104" gives 100. */
  readonly numberValue: number | null;
  /** The street as shown to a reader (title case, full street type), or null. */
  readonly street: string | null;
  /** The street as compared: no accents, no case, no punctuation, full street type, with the direction. Null when there is no street. */
  readonly key: string | null;
  readonly direction: Direction | null;
  /** A unit or suite written in the line, as written, or null. */
  readonly unit: string | null;
}

const NONE: ParsedAddress = { kind: "none", number: null, numberValue: null, street: null, key: null, direction: null, unit: null };

/** Words that mean the pack has no address, in either language and as the pack writes it. */
const NO_ADDRESS = new Set(["unknown", "inconnu", "n/a", "na", "none", "null", "-", "--", "tbd", "?", "unspecified"]);

/** Short forms of street types, written out in full so "St" and "Street" are one street. */
const TYPE_WORDS: Readonly<Record<string, string>> = {
  st: "street",
  str: "street",
  ave: "avenue",
  av: "avenue",
  aven: "avenue",
  blvd: "boulevard",
  boul: "boulevard",
  bd: "boulevard",
  rd: "road",
  dr: "drive",
  ln: "lane",
  ct: "court",
  crt: "court",
  cres: "crescent",
  cresc: "crescent",
  pkwy: "parkway",
  hwy: "highway",
  pl: "place",
  sq: "square",
  terr: "terrace",
  ter: "terrace",
  cir: "circle",
  crcl: "circle",
  trl: "trail",
  gdns: "gardens",
  gdn: "gardens",
  grv: "grove",
  hts: "heights",
  pt: "point",
  rte: "route",
  ch: "chemin",
  imp: "impasse",
  prom: "promenade",
  allee: "allee",
};

/** Words that make a name a street type. A line that has one is read as a street even with no number. */
const STREET_TYPES = new Set([
  "street",
  "avenue",
  "boulevard",
  "road",
  "drive",
  "lane",
  "court",
  "crescent",
  "parkway",
  "highway",
  "place",
  "square",
  "terrace",
  "circle",
  "trail",
  "gardens",
  "grove",
  "heights",
  "point",
  "way",
  "walk",
  "path",
  "line",
  "concession",
  "route",
  "rue",
  "chemin",
  "impasse",
  "promenade",
  "allee",
  "montee",
  "rang",
  "cote",
  "carre",
  "croissant",
  "voie",
]);

const DIRECTIONS: Readonly<Record<string, Direction>> = {
  n: "N",
  north: "N",
  nord: "N",
  e: "E",
  east: "E",
  est: "E",
  s: "S",
  south: "S",
  sud: "S",
  w: "W",
  west: "W",
  ouest: "W",
  o: "W",
};

const DIRECTION_WORD: Readonly<Record<Direction, { en: string; fr: string }>> = {
  N: { en: "North", fr: "Nord" },
  E: { en: "East", fr: "Est" },
  S: { en: "South", fr: "Sud" },
  W: { en: "West", fr: "Ouest" },
};

/** Small words kept lower case inside a street name ("Rue de la Gauchetière"). */
const SMALL = new Set(["de", "du", "des", "la", "le", "les", "d", "l", "of", "the", "et", "and", "au", "aux", "sur"]);

const UNIT_WORDS = "unit|suite|ste|apt|apartment|app|appt|bureau|local|room|rm|floor|fl|etage|level|lvl";
const UNIT_ONLY = new RegExp(`^(?:${UNIT_WORDS}|#)\\.?\\s*#?\\s*[\\w-]+$`, "i");
const UNIT_TAIL = new RegExp(`\\s+(?:(?:${UNIT_WORDS})\\.?\\s*#?\\s*[\\w-]+|#\\s*[\\w-]+)$`, "i");
const PO_BOX = /^(?:p\.?\s?o\.?\s*box|c\.?\s?p\.?|case postale|post office box)\b/i;
const NUMBER_LEAD = /^(\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?)\s+(.+)$/;
const NUMBER_ONLY = /^\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?$/;

/** Lower case, no accents, no dots or commas, single spaces. The apostrophe is kept apart so "l’Église" and "l'Eglise" match. */
export function foldAddressText(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[\u2019\u2018`\u00b4]/g, "'")
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

interface Word {
  /** Lower case with accents, the way it is shown. */
  readonly shown: string;
  /** Lower case with no accents, the way it is compared. */
  readonly folded: string;
}

/** Splits text into words, keeping an apostrophe with the word before it ("l'eglise" is "l'" and "eglise"). */
function wordsOf(text: string): Word[] {
  const lowered = text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\u2019\u2018`\u00b4]/g, "'")
    .replace(/[.,]/g, " ")
    .replace(/'/g, "' ")
    .replace(/\s+/g, " ")
    .trim();
  if (lowered === "") return [];
  return lowered.split(" ").map((w) => ({ shown: w, folded: foldAddressText(w) }));
}

/** Every street type word the reader would recognise, for deciding whether a part of a line is a street. */
function hasType(words: readonly string[]): boolean {
  return words.some((w) => STREET_TYPES.has(TYPE_WORDS[w] ?? w));
}

const wordsFolded = (text: string): string[] => wordsOf(text).map((w) => w.folded);

function looksLikeIntersection(folded: string): boolean {
  if (/(?:&|@|\bcorner\b|\bcoin\b|\bintersection\b)/.test(folded)) return true;
  const m = / (?:and|et|at) /.exec(folded);
  if (m === null) return false;
  const left = wordsFolded(folded.slice(0, m.index));
  const right = wordsFolded(folded.slice(m.index + m[0].length));
  return hasType(left) && hasType(right);
}

function titleCase(words: readonly string[]): string {
  const out = words.map((w, i) => {
    const bare = w.endsWith("'") ? w.slice(0, -1) : w;
    if (i > 0 && SMALL.has(bare)) return w;
    return w
      .split("-")
      .map((part) => (part === "" ? part : part[0]!.toUpperCase() + part.slice(1)))
      .join("-");
  });
  return out.join(" ").replace(/' /g, "'");
}

/** Control characters (tabs, line breaks, and the like) become spaces. */
function stripControls(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.codePointAt(0)!;
    out += c < 0x20 || c === 0x7f ? " " : ch;
  }
  return out;
}

/** Reads one address line. `null`, empty and "UNKNOWN" all read as no address. */
export function parseAddress(raw: string | null | undefined): ParsedAddress {
  if (raw === null || raw === undefined) return NONE;
  const text = stripControls(raw).replace(/\s+/g, " ").trim();
  if (text === "" || NO_ADDRESS.has(foldAddressText(text))) return NONE;

  const parts = text
    .split(/[;,]/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
  let unit: string | null = null;
  // "Unit 5, 100 King St": the first part is only a unit, so the street is in the next one.
  while (parts.length > 1 && UNIT_ONLY.test(parts[0]!)) {
    const first = parts.shift()!;
    unit = unit ?? first;
  }
  let line = parts[0] ?? "";
  if (line === "") return NONE;
  // "100 King St, Unit 4": a later part that is only a unit is the unit of this address.
  if (unit === null) unit = parts.slice(1).find((p) => UNIT_ONLY.test(p)) ?? null;
  if (PO_BOX.test(line)) return { ...NONE, kind: "po-box" };
  if (looksLikeIntersection(foldAddressText(line))) return { ...NONE, kind: "intersection" };

  // A unit written at the end of the street part ("100 King St Unit 5", "100 King St #5").
  for (;;) {
    const m = UNIT_TAIL.exec(line);
    if (m === null) break;
    unit = unit ?? m[0].trim();
    line = line.slice(0, m.index).trim();
  }
  // "5-100 King St": a unit, a hyphen and the number is the usual way to write it; a range such as "100-104" has two numbers close together.
  let number: string | null = null;
  const lead = NUMBER_LEAD.exec(line);
  let rest = line;
  if (lead !== null) {
    number = lead[1]!.replace(/\s*[-–]\s*/, "-");
    rest = lead[2]!.trim();
  } else if (NUMBER_ONLY.test(line)) {
    return NONE;
  }

  const all = wordsOf(rest);
  if (all.length === 0) return NONE;
  // A trailing direction belongs to the street only when a name and a street type stand before it.
  let direction: Direction | null = null;
  let core = all;
  const last = all[all.length - 1]!.folded;
  const dir = DIRECTIONS[last];
  if (all.length >= 3 && dir !== undefined && (last !== "o" || FRENCH_TYPES.has(all[0]!.folded)) && hasType(all.slice(0, -1).map((w) => w.folded))) {
    direction = dir;
    core = all.slice(0, -1);
  }
  // A street written with its type first ("boulevard Saint-Laurent") is read as French; "Avenue Road" ends in a type, so it is not.
  const isType = (w: Word) => STREET_TYPES.has(TYPE_WORDS[w.folded] ?? w.folded);
  const french = (FRENCH_TYPES.has(all[0]!.folded) || TYPE_FIRST.has(TYPE_WORDS[all[0]!.folded] ?? all[0]!.folded)) && !isType(core[core.length - 1]!);
  const expanded = core.map((w) => {
    const full = TYPE_WORDS[w.folded];
    if (full === undefined) return { shown: w.shown, folded: w.folded };
    return { shown: full === "allee" ? "all\u00e9e" : full, folded: full };
  });
  const base = expanded.map((w) => w.folded).join(" ");
  const key = direction === null ? base : `${base} ${direction}`;
  const shown = titleCase(expanded.map((w) => w.shown));
  const street = direction === null ? shown : `${shown} ${DIRECTION_WORD[direction][french ? "fr" : "en"]}`;

  const first = number === null ? null : Number.parseInt(number, 10);
  return {
    kind: "street",
    number,
    numberValue: first !== null && Number.isFinite(first) ? first : null,
    street,
    key,
    direction,
    unit,
  };
}

/** Types that begin a French street name but end an English one, so they only mean French when a name follows them. */
const TYPE_FIRST = new Set(["boulevard", "avenue", "place"]);

const FRENCH_TYPES = new Set(["rue", "chemin", "impasse", "promenade", "allee", "montee", "rang", "cote", "carre", "croissant", "voie"]);

/** One typed word as the key would write it: a short street type in full ("st" is "street"), a direction as its letter. */
export function keyWord(word: string): string {
  const w = foldAddressText(word);
  const full = TYPE_WORDS[w];
  if (full !== undefined) return full;
  const dir = DIRECTIONS[w];
  return dir === undefined ? w : dir.toLowerCase();
}

/** "odd", "even", or null when there is no number. */
export function parityOf(numberValue: number | null): "odd" | "even" | null {
  if (numberValue === null) return null;
  return numberValue % 2 === 0 ? "even" : "odd";
}
