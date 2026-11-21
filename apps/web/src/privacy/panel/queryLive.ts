// Reads the part of the address of the page after the question mark and says what it carries, against the web
// address register. It reads one string and writes nothing: the address is not changed, kept or sent anywhere. A
// name no row lists is reported as unlisted, never as fine, because what the App does with it is not known here.
// The values themselves are not repeated in what it says: it names a parameter and what kind of thing it holds, so
// a place or typed words are not copied into the panel.

import type { Locale } from "./copyLint";
import { PERSONAL_KINDS, longestAllowed, rowForName, type QueryKind, type QueryRow } from "./queryRegister";

export type AddressCode =
  /** The address holds a place, typed words or picked places */
  | "carries-personal"
  /** A name no row lists */
  | "unlisted"
  /** A value longer than the longest the code allows for it */
  | "over-length";

export interface AddressFinding {
  code: AddressCode;
  name: string;
  /** What the listed row says the name holds. Absent for an unlisted name. */
  kind?: QueryKind;
  /** Plain numbers behind the finding, for the message */
  detail: { allowed?: number; found?: number };
}

export interface AddressCheck {
  /** How many parameters the address has, counting a name that appears more than once each time */
  params: number;
  findings: readonly AddressFinding[];
}

/** The longest query string read. Anything after this many characters is not looked at. */
export const MAX_ADDRESS_READ = 4096;

/** The parameters of a query string, as the browser reads them. A leading question mark and anything from a hash on are left out. */
export function addressParams(search: string): Array<[string, string]> {
  let s = search.length > MAX_ADDRESS_READ ? search.slice(0, MAX_ADDRESS_READ) : search;
  const hash = s.indexOf("#");
  if (hash !== -1) s = s.slice(0, hash);
  if (s.startsWith("?")) s = s.slice(1);
  const out: Array<[string, string]> = [];
  for (const entry of new URLSearchParams(s)) out.push([entry[0], entry[1]]);
  return out;
}

/** What the address carries. Names are checked once each, in the order they first appear. */
export function checkAddress(rows: readonly QueryRow[], search: string): AddressCheck {
  const params = addressParams(search);
  const findings: AddressFinding[] = [];
  const reported = new Set<string>();
  for (const [name, value] of params) {
    const row = rowForName(rows, name);
    if (row === null) {
      if (!reported.has(`unlisted ${name}`)) findings.push({ code: "unlisted", name, detail: {} });
      reported.add(`unlisted ${name}`);
      continue;
    }
    if (PERSONAL_KINDS.has(row.kind) && value !== "" && !reported.has(`personal ${name}`)) {
      findings.push({ code: "carries-personal", name, kind: row.kind, detail: {} });
      reported.add(`personal ${name}`);
    }
    const allowed = longestAllowed(row);
    if (allowed !== null && value.length > allowed) {
      findings.push({ code: "over-length", name, kind: row.kind, detail: { allowed, found: value.length } });
    }
  }
  return { params: params.length, findings };
}

/** The label for a kind, used in a sentence about one parameter. */
const KIND_WORD: Record<Locale, Record<QueryKind, string>> = {
  en: { place: "a place on the map", typed: "words that were typed", ids: "places that were picked", choice: "a choice", layout: "how a list is shown", language: "a language", format: "a kind of download" },
  fr: { place: "un lieu sur la carte", typed: "des mots saisis", ids: "des lieux choisis", choice: "un choix", layout: "la présentation d’une liste", language: "une langue", format: "un type de téléchargement" },
};

export function kindWord(locale: Locale, kind: QueryKind): string {
  return KIND_WORD[locale][kind];
}

const TEXT: Record<Locale, Record<AddressCode, (f: AddressFinding) => string>> = {
  en: {
    "carries-personal": (f) => `The address of this page carries “${f.name}”, which holds ${kindWord("en", f.kind ?? "choice")}. Anyone who is given this address can see it.`,
    unlisted: (f) => `The address of this page has “${f.name}”, which the list does not name. What the App does with it is not known here.`,
    "over-length": (f) => `The value of “${f.name}” is ${f.detail.found ?? 0} characters long, and the code reads at most ${f.detail.allowed ?? 0} of them.`,
  },
  fr: {
    "carries-personal": (f) => `L’adresse de cette page contient «\u202f${f.name}\u202f», qui transmet ${kindWord("fr", f.kind ?? "choice")}. Toute personne qui reçoit cette adresse peut le voir.`,
    unlisted: (f) => `L’adresse de cette page contient «\u202f${f.name}\u202f», que la liste ne nomme pas. Ce que l’App en fait n’est pas connu ici.`,
    "over-length": (f) => `La valeur de «\u202f${f.name}\u202f» compte ${f.detail.found ?? 0} caractères, et le code n’en lit que ${f.detail.allowed ?? 0} au plus.`,
  },
};

export function addressFindingText(locale: Locale, f: AddressFinding): string {
  return TEXT[locale][f.code](f);
}

/** One sentence for the whole check: how many parameters were read and what was found. */
export function addressSummary(locale: Locale, params: number, findings: number): string {
  if (locale === "fr") {
    const read = params === 0 ? "L’adresse de cette page ne contient aucun paramètre." : `${params} ${params === 1 ? "paramètre lu" : "paramètres lus"} dans l’adresse de cette page.`;
    const found = params === 0 ? "" : findings === 0 ? " Rien à signaler." : ` ${findings} ${findings === 1 ? "point à signaler" : "points à signaler"}.`;
    return `${read}${found}`;
  }
  const read = params === 0 ? "The address of this page has no parameters." : `Read ${params} ${params === 1 ? "parameter" : "parameters"} from the address of this page.`;
  const found = params === 0 ? "" : findings === 0 ? " Nothing to report." : ` ${findings} ${findings === 1 ? "thing" : "things"} to report.`;
  return `${read}${found}`;
}
