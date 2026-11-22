/**
 * Ways a place's name or address may be written differently from what a reader expects: all capitals, all
 * lower case, a web address or phone number in the name, an address in the name field, a postal code or province
 * inside the address line, a repeated word. Each rule looks at the text as the pack gives it and says what it saw.
 * None says the text is wrong: a pack may write names this way on purpose, and the rules never change the text.
 */
import { foldAddressText, parseAddress } from "./streetAddress";

export type WritingField = "name" | "address";

export type WritingRule =
  | "name-all-capitals"
  | "name-all-lower"
  | "name-contact"
  | "name-is-address"
  | "name-edge-punctuation"
  | "name-repeated-word"
  | "name-same-as-address"
  | "name-very-long"
  | "address-all-capitals"
  | "address-all-lower"
  | "address-postal-code"
  | "address-province"
  | "address-no-number"
  | "address-contact";

export const WRITING_RULES: readonly WritingRule[] = [
  "name-all-capitals", "name-all-lower", "name-contact", "name-is-address", "name-edge-punctuation", "name-repeated-word", "name-same-as-address", "name-very-long",
  "address-all-capitals", "address-all-lower", "address-postal-code", "address-province", "address-no-number", "address-contact",
];

export const isWritingRule = (v: unknown): v is WritingRule => typeof v === "string" && (WRITING_RULES as readonly string[]).includes(v);
export const fieldOfRule = (r: WritingRule): WritingField => (r.startsWith("name-") ? "name" : "address");

export interface RuleHit {
  readonly rule: WritingRule;
  /** The part of the text the rule reacted to, as written, or null when the rule reacts to the whole text. */
  readonly seen: string | null;
}

const LETTER = /\p{L}/gu;
const UPPER = /\p{Lu}/gu;
const LOWER = /\p{Ll}/gu;
const count = (s: string, re: RegExp): number => (s.match(re) ?? []).length;

/** Letters of any alphabet, and whether every cased letter is upper case. Scripts with no case never count. */
export function caseShape(s: string): { letters: number; upper: number; lower: number } {
  return { letters: count(s, LETTER), upper: count(s, UPPER), lower: count(s, LOWER) };
}

const POSTAL = /\b[ABCEGHJ-NPRSTVXY]\d[ABCEGHJ-NPRSTV-Z][ -]?\d[ABCEGHJ-NPRSTV-Z]\d\b/i;
const PROVINCE = /(?:,|\s)\s*(?:ontario|ont|on|québec|quebec|qc|canada)\s*(?:[,.]|$)/i;
const URL_LIKE = /(?:\bwww\.[\w.-]+|\S+:\/\/\S*|\b[\w-]+(?:\.[\w-]+)*\.(?:com|ca|org|net)\b)/i;
const EMAIL_LIKE = /[\w.+-]+@[\w-]+\.[\w.-]+/;
const PHONE_LIKE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;

/** A web address, an e-mail address or a phone number. Returns the piece found, or null. */
export function findContact(text: string): string | null {
  for (const re of [EMAIL_LIKE, URL_LIKE, PHONE_LIKE]) {
    const m = re.exec(text);
    if (m) return m[0];
  }
  return null;
}

/** Edge punctuation: leading or trailing characters that are not part of a name (not a closing dot of an abbreviation). */
export function edgePunctuation(name: string): string | null {
  const lead = /^[\s\-–—,;:|/\\*#_~]+/.exec(name);
  if (lead && lead[0].trim() !== "") return lead[0].trim();
  const tail = /[\s\-–—,;:|/\\*#_~]+$/.exec(name);
  if (tail && tail[0].trim() !== "") return tail[0].trim();
  return null;
}

/** The first word written twice in a row ("Cafe Cafe"), compared without case or accents, or null. Numbers are ignored. */
export function repeatedWord(name: string): string | null {
  const words = foldAddressText(name).split(" ").filter(Boolean);
  for (let i = 1; i < words.length; i += 1) {
    const w = words[i]!;
    if (w === words[i - 1] && /\p{L}/u.test(w) && w.length > 1) return w;
  }
  return null;
}

/** Words that make a line with a leading number a street address and not a name such as "7 Eleven" or "Studio 54". */
const STREET_WORDS = new Set([
  "street", "st", "avenue", "ave", "road", "rd", "boulevard", "blvd", "drive", "dr", "crescent", "cres", "court", "ct", "place", "pl", "lane", "ln", "highway", "hwy",
  "parkway", "pkwy", "way", "trail", "terrace", "circle", "square", "rue", "chemin", "boul", "promenade", "route", "montee", "côte", "cote", "allee",
]);

/** A leading civic number followed, somewhere in the line, by a street word ("100 King Street West", "12 rue Saint-Denis"). */
export function looksLikeStreetAddress(text: string): boolean {
  if (!/^\d+[A-Za-z]?(?:\s*[-–]\s*\d+[A-Za-z]?)?\s/.test(text.trim())) return false;
  return foldAddressText(text).split(" ").some((w) => STREET_WORDS.has(w));
}

/** Longest name, in characters, before a name is pointed out for its length. */
export const LONG_NAME = 80;

/** Rules about a name. `address` is the same place's address line, used by the two rules that compare them. */
export function nameHits(name: string | null, address: string | null): RuleHit[] {
  if (name === null) return [];
  const out: RuleHit[] = [];
  const { letters, upper, lower } = caseShape(name);
  if (letters >= 5 && lower === 0 && upper >= 5) out.push({ rule: "name-all-capitals", seen: null });
  if (letters >= 4 && upper === 0 && lower >= 4) out.push({ rule: "name-all-lower", seen: null });
  const contact = findContact(name);
  if (contact !== null) out.push({ rule: "name-contact", seen: contact });
  if (looksLikeStreetAddress(name)) out.push({ rule: "name-is-address", seen: null });
  const edge = edgePunctuation(name);
  if (edge !== null) out.push({ rule: "name-edge-punctuation", seen: edge });
  const twice = repeatedWord(name);
  if (twice !== null) out.push({ rule: "name-repeated-word", seen: twice });
  if (address !== null && foldAddressText(name) === foldAddressText(address) && foldAddressText(name) !== "") out.push({ rule: "name-same-as-address", seen: null });
  if ([...name].length > LONG_NAME) out.push({ rule: "name-very-long", seen: null });
  return out;
}

/** Rules about an address line. */
export function addressHits(address: string | null): RuleHit[] {
  if (address === null) return [];
  const out: RuleHit[] = [];
  const { letters, upper, lower } = caseShape(address);
  if (letters >= 5 && lower === 0 && upper >= 5) out.push({ rule: "address-all-capitals", seen: null });
  if (letters >= 5 && upper === 0 && lower >= 5) out.push({ rule: "address-all-lower", seen: null });
  const postal = POSTAL.exec(address);
  if (postal) out.push({ rule: "address-postal-code", seen: postal[0] });
  const province = PROVINCE.exec(address);
  if (province) out.push({ rule: "address-province", seen: province[0].replace(/^[,\s]+|[,.\s]+$/g, "") });
  const parsed = parseAddress(address);
  if (parsed.kind === "street" && parsed.number === null) out.push({ rule: "address-no-number", seen: null });
  const contact = findContact(address);
  if (contact !== null) out.push({ rule: "address-contact", seen: contact });
  return out;
}
