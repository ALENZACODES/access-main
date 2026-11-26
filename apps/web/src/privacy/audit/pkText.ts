// Rules for the text values of a pack file: what a person reads in the App, and what must never be in it.

import type { PkLeaf } from "./pkWalk";

export type PkTextCode =
  | "pk-text-empty"
  | "pk-text-edge-space"
  | "pk-text-control"
  | "pk-text-invisible"
  | "pk-text-email"
  | "pk-text-phone"
  | "pk-text-id-number"
  | "pk-text-wording"
  | "pk-text-long"
  | "pk-fr-apostrophe"
  | "pk-fr-colon-space"
  | "pk-fr-mark-space"
  | "pk-fr-guillemet-space"
  | "pk-fr-straight-quotes";

export interface PkTextProblem {
  code: PkTextCode;
  detail: string;
}

/** Keys that hold an address, an identifier or a plain label, not a sentence for a person. */
const NOT_COPY = /^(?:id|pack_id|schema_version|category|wheelchair|licence|licence_url|source_url|url|tier|prototype_label|freshness|label|stop_ids|operator_text_language|built_at|retrieved_at|source_date|checked_at|sha256|content_path|contact)$/;

/** Keys that hold sentences or names a person reads. */
export const isCopyKey = (key: string): boolean => !NOT_COPY.test(key);

/** Keys that hold a web address: they have their own rules. */
export const isUrlKey = (key: string): boolean => key === "url" || key.endsWith("_url") || key === "content_path";

export const MAX_TEXT = 600;

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)+/;
// A phone number written with at least ten digits, or a three-three-four group with separators.
const PHONE = /(?:\+?1[\s.-]?)?\(?\b\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}\b/;
// Nine digits in three groups, the shape of a social insurance number.
const NINE = /\b\d{3}[ -]\d{3}[ -]\d{3}\b/;
const hasControl = (t: string): boolean => [...t].some((ch) => { const c = ch.codePointAt(0) ?? 0; return c < 0x20 || (c >= 0x7f && c <= 0x9f); });
const INVISIBLE = /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF\u00AD]/;
// The user-facing wording this App does not use: it never says a record has been checked by anyone.
const WORDING = /\b(?:verified|v[\u00E9e]rifi[\u00E9e]?e?s?|v\u00E9rification|verification)\b/i;
const NBSP = "\u00A0";
const NNBSP = "\u202F";

/** What is wrong with one text. Nothing about an address or a key that is not copy is judged here except privacy. */
export function checkText(leaf: PkLeaf): PkTextProblem[] {
  const t = leaf.text;
  const out: PkTextProblem[] = [];
  const add = (code: PkTextCode, detail: string): void => void out.push({ code, detail });
  if (t === "") add("pk-text-empty", "an empty text; write nothing, or UNKNOWN where a value is unknown");
  if (t !== t.trim() || t.includes("  ")) add("pk-text-edge-space", "a space at an end or two spaces in a row");
  if (hasControl(t)) add("pk-text-control", "a control character");
  if (INVISIBLE.test(t)) add("pk-text-invisible", "a character that cannot be seen");
  if (EMAIL.test(t)) add("pk-text-email", "an email address");
  if (leaf.key !== "contact" && PHONE.test(t)) add("pk-text-phone", "a telephone number outside the contact field");
  if (NINE.test(t)) add("pk-text-id-number", "nine digits in three groups, the shape of an identification number");
  if (t.length > MAX_TEXT) add("pk-text-long", `${t.length} characters`);
  if (isCopyKey(leaf.key) && !isUrlKey(leaf.key)) {
    if (WORDING.test(t)) add("pk-text-wording", "wording about verification");
    if (leaf.lang === "fr") out.push(...frProblems(t));
  }
  return out;
}

/** French typography: the curly apostrophe, a no-break space before a colon and a narrow one before ; ! ?, and inside « ». */
export function frProblems(t: string): PkTextProblem[] {
  const out: PkTextProblem[] = [];
  const add = (code: PkTextCode, detail: string): void => void out.push({ code, detail });
  if (/[A-Za-z\u00C0-\u00FF]'[A-Za-z\u00C0-\u00FF]/.test(t)) add("pk-fr-apostrophe", "a straight apostrophe between letters; write \u2019");
  if (/(?<=\S) ?:(?!\/\/|\d)/.test(t.replace(/\b\d{1,2}:\d{2}\b/g, "")) && !new RegExp(`${NBSP}:`).test(t)) add("pk-fr-colon-space", "a colon without a no-break space before it");
  if (/[^\s\u00A0\u202F][;!?]| [;!?]/.test(t) && !new RegExp(`${NNBSP}[;!?]`).test(t)) add("pk-fr-mark-space", "a ; ! or ? without a narrow no-break space before it");
  if (/\u00AB(?![\u00A0\u202F])|(?<![\u00A0\u202F])\u00BB/.test(t)) add("pk-fr-guillemet-space", "a space is missing inside \u00AB \u00BB");
  if (/["]/.test(t)) add("pk-fr-straight-quotes", "straight double quotes; write \u00AB \u00BB");
  return out;
}
