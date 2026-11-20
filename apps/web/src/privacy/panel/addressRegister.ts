// The web addresses and network calls in the App's own source code, written down so a new one cannot
// appear unseen. Two lists. The address list names each host the source mentions and what the mention
// is: a page a person can open, a name used inside a data format that is never contacted, or a stand-in
// that cannot be reached. The call list names every file that makes a network request and says where the
// request goes. audit/addressScan.ts reads the source and fails CI when either list drifts from it.
// Where a request's destination is chosen by data and not by the code, the row says UNKNOWN.

import type { Bilingual } from "./inventory";

export type AddressKind = "link" | "identifier";

export interface AddressRow {
  /** The host only, in lower case */
  host: string;
  kind: AddressKind;
  /** Repo-relative path of a file that names it */
  path: string;
  /** What the address is, in plain words */
  holds: Bilingual;
  /** Where the statement came from */
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

export type CallDestination = "same-site" | "UNKNOWN";

export interface CallRow {
  /** Repo-relative path of the file that makes the request */
  path: string;
  /** How many places in that file make a request */
  calls: number;
  /** Where the requests go. UNKNOWN when the address comes from data the code does not fix. */
  destination: CallDestination;
  /** What the requests are for, in plain words */
  holds: Bilingual;
  source: string;
  recordedOn: string;
}

const REVIEWED = "2026-11-20";
const SOURCE = "Read from the source file named in the row";

const address = (host: string, kind: AddressKind, path: string, en: string, fr: string): AddressRow => ({ host, kind, path, holds: { en, fr }, source: SOURCE, recordedOn: REVIEWED });
const call = (path: string, calls: number, destination: CallDestination, en: string, fr: string): CallRow => ({ path, calls, destination, holds: { en, fr }, source: SOURCE, recordedOn: REVIEWED });

export const ADDRESS_REGISTER: readonly AddressRow[] = [
  address("creativecommons.org", "link", "apps/web/src/data-status/licences.ts", "Licence pages a person can open from the data credits", "Des pages de licence qu’on peut ouvrir depuis les crédits des données"),
  address("opendatacommons.org", "link", "apps/web/src/data-status/licences.ts", "Licence pages a person can open from the data credits", "Des pages de licence qu’on peut ouvrir depuis les crédits des données"),
  address("open.canada.ca", "link", "apps/web/src/data-status/licences.ts", "A licence page a person can open from the data credits", "Une page de licence qu’on peut ouvrir depuis les crédits des données"),
  address("www.ontario.ca", "link", "apps/web/src/data-status/licences.ts", "A licence page a person can open from the data credits", "Une page de licence qu’on peut ouvrir depuis les crédits des données"),
  address("www.openstreetmap.org", "link", "apps/web/src/map/MapPage.tsx", "The map’s credit page, opened only when a person follows the link", "La page des crédits de la carte, ouverte seulement quand on suit le lien"),
  address("json-schema.org", "identifier", "apps/web/src/data-status/listedJsonSchema.ts", "A name that says which data format a file follows. It is not contacted.", "Un nom qui indique le format de données d’un fichier. Il n’est pas contacté."),
  address("purl.org", "identifier", "apps/web/src/data-status/catalogue.ts", "A name used inside a data catalogue. It is not contacted.", "Un nom utilisé dans un catalogue de données. Il n’est pas contacté."),
];

export const CALL_REGISTER: readonly CallRow[] = [
  call("apps/web/src/data-status/standalone/main.ts", 1, "UNKNOWN", "Loads the data status files the page was told to open", "Charge les fichiers sur l’état des données que la page a reçu l’ordre d’ouvrir"),
  call("apps/web/src/data-status/standalone/sw.ts", 1, "same-site", "Repeats a request the page made, so a copy can be kept for offline use", "Répète une requête faite par la page, pour garder une copie pour l’usage hors ligne"),
  call("apps/web/src/states/serviceWorker.ts", 2, "same-site", "Repeats a request the page made, so a copy can be kept for offline use", "Répète une requête faite par la page, pour garder une copie pour l’usage hors ligne"),
  call("apps/web/src/map/tileCache.ts", 3, "UNKNOWN", "Loads the offline map pack’s list and its files", "Charge la liste du lot de cartes hors ligne et ses fichiers"),
];

export const callTotal = (calls: readonly CallRow[]): number => calls.reduce((n, c) => n + c.calls, 0);

/** Problems that do not depend on the source: repeats, bad hosts or paths, bad counts, bad dates, blank text. */
export function checkAddressRegisters(addresses: readonly AddressRow[], calls: readonly CallRow[]): string[] {
  const problems: string[] = [];
  const hosts = new Set<string>();
  for (const a of addresses) {
    if (hosts.has(a.host)) problems.push(`${a.host}: listed twice`);
    hosts.add(a.host);
    if (!/^[a-z0-9]([a-z0-9.-]*[a-z0-9])?$/.test(a.host) || !a.host.includes(".")) problems.push(`${a.host}: not a plain lower-case host`);
    if (a.path.trim() === "") problems.push(`${a.host}: path is empty`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(a.recordedOn)) problems.push(`${a.host}: recordedOn is not YYYY-MM-DD`);
    if (a.holds.en.trim() === "" || a.holds.fr.trim() === "") problems.push(`${a.host}: holds is empty in one language`);
    if (a.source.trim() === "") problems.push(`${a.host}: source is empty`);
  }
  const paths = new Set<string>();
  for (const c of calls) {
    if (paths.has(c.path)) problems.push(`${c.path}: listed twice`);
    paths.add(c.path);
    if (!Number.isInteger(c.calls) || c.calls < 1) problems.push(`${c.path}: calls must be a whole number of at least 1`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(c.recordedOn)) problems.push(`${c.path}: recordedOn is not YYYY-MM-DD`);
    if (c.holds.en.trim() === "" || c.holds.fr.trim() === "") problems.push(`${c.path}: holds is empty in one language`);
    if (c.source.trim() === "") problems.push(`${c.path}: source is empty`);
  }
  return problems;
}
