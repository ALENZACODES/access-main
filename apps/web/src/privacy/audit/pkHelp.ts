// Rules for the help numbers of a pack: a number is a short code or a toll-free number, each has its name and its
// instructions in both languages, and a link that is given is also given where it came from.

import { isRecord } from "./pkWalk";

export type PkHelpCode = "pk-help-contact" | "pk-help-not-bilingual" | "pk-help-same-language" | "pk-help-url-no-source";

export interface PkHelpProblem {
  code: PkHelpCode;
  detail: string;
}

/** A short code (911, 811, 211) or its dashed form (9-8-8), or a toll-free number written 1-8xx-xxx-xxxx. */
export const CONTACT_SHAPES: readonly RegExp[] = [/^\d{3}$/, /^\d-\d-\d$/, /^1-8(?:00|33|44|55|66|77|88)-\d{3}-\d{4}$/];

export const isContact = (s: string): boolean => CONTACT_SHAPES.some((r) => r.test(s));

const text = (v: unknown): string | null => (typeof v === "string" && v.trim() !== "" ? v : null);

/** Whether two texts are the same once case is ignored. Instructions that copy the English are not a French text; a name such as Health811 may be the same. */
const sameText = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/** What is wrong with one help number record. */
export function checkHelpNumber(record: unknown): PkHelpProblem[] {
  if (!isRecord(record)) return [];
  const out: PkHelpProblem[] = [];
  const contact = record["contact"];
  if (typeof contact !== "string" || !isContact(contact)) out.push({ code: "pk-help-contact", detail: `contact ${JSON.stringify(contact)} is not a short code or a toll-free number` });
  for (const field of ["name", "how"] as const) {
    const v = record[field];
    const en = isRecord(v) ? text(v["en"]) : null;
    const fr = isRecord(v) ? text(v["fr"]) : null;
    if (en === null || fr === null) out.push({ code: "pk-help-not-bilingual", detail: `${field} is not given in both English and French` });
    else if (field === "how" && sameText(en, fr)) out.push({ code: "pk-help-same-language", detail: `${field} is the same in both languages` });
  }
  const url = text(record["url"]);
  const prov = isRecord(record["provenance"]) ? record["provenance"] : {};
  if (url !== null && text(prov["source_name"]) === null) out.push({ code: "pk-help-url-no-source", detail: "a link is given and the record names no source" });
  return out;
}
