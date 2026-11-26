// What the shipped packs may link to, where their data comes from, and which findings are accepted as they stand.
// The hosts and sources were written from the files as they are; the reasons say only what was read.

import type { PkCode } from "./pkRules";

export interface PkSourceRow {
  name: string;
  licence: string;
}

export interface PkPackRow {
  /** The folder name under public/packs. */
  id: string;
  /** The hosts the pack links to, exactly as written. */
  hosts: readonly string[];
  /** The sources named in the manifest, with the licence it gives. */
  sources: readonly PkSourceRow[];
}

export interface PkAcceptRow {
  pack: string;
  code: PkCode;
  count: number;
  reason: string;
}

export const PK_REGISTER: readonly PkPackRow[] = [
  {
    id: "toronto",
    hosts: ["211ontario.ca", "988.ca", "connexontario.ca", "health811.ontario.ca", "opendatacommons.org", "www.openstreetmap.org"],
    sources: [
      { name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0" },
      { name: "TTC GTFS-Realtime accessibility alerts", licence: "OGL-Toronto-1.0" },
      { name: "Official help pages, desk check", licence: "UNKNOWN" },
    ],
  },
];

/** Codes that may be accepted. A leak, an address that is not https or a licence that was guessed never may. */
export const PK_ACCEPTABLE: readonly PkCode[] = ["pk-fr-apostrophe", "pk-source-not-listed", "pk-source-unused"];

export const PK_ACCEPTED: readonly PkAcceptRow[] = [
  {
    pack: "toronto",
    code: "pk-fr-apostrophe",
    count: 7,
    reason: "Seven French texts of the help numbers (names and how-to-call lines) are written with a straight apostrophe, not ’. The pack build writes them; this lane does not edit the pack.",
  },
  {
    pack: "toronto",
    code: "pk-source-not-listed",
    count: 6,
    reason: "Six help numbers name a source (\"Ontario emergency number, desk check\" and \"Official page, desk check\") that the manifest's source_dates does not list.",
  },
  {
    pack: "toronto",
    code: "pk-source-unused",
    count: 1,
    reason: "The manifest lists \"Official help pages, desk check\", which no record uses by that name; the records use two other names for what looks like the same kind of source.",
  },
];

export interface PkRegisterProblem {
  message: string;
}

/** Checks the register itself. Returns the problems, none when it is well formed. */
export function validatePkRegister(register: readonly PkPackRow[] = PK_REGISTER, accepted: readonly PkAcceptRow[] = PK_ACCEPTED): PkRegisterProblem[] {
  const out: PkRegisterProblem[] = [];
  const add = (message: string): void => void out.push({ message });
  const ids = register.map((r) => r.id);
  if (new Set(ids).size !== ids.length) add("a pack is listed twice");
  if (ids.join("|") !== [...ids].sort().join("|")) add("the packs are not in sorted order");
  for (const r of register) {
    if (r.hosts.length === 0) add(`${r.id} lists no hosts`);
    if (r.hosts.join("|") !== [...r.hosts].sort().join("|")) add(`${r.id}: the hosts are not in sorted order`);
    if (new Set(r.hosts).size !== r.hosts.length) add(`${r.id}: a host is listed twice`);
    for (const h of r.hosts) if (!/^[a-z0-9.-]+$/.test(h) || h.startsWith(".") || h.endsWith(".")) add(`${r.id}: ${h} is not a host name`);
    const names = r.sources.map((s) => s.name);
    if (new Set(names).size !== names.length) add(`${r.id}: a source is listed twice`);
    for (const s of r.sources) if (s.name === "" || s.licence === "") add(`${r.id}: a source has no name or no licence`);
  }
  const seen = new Set<string>();
  for (const a of accepted) {
    const key = `${a.pack}/${a.code}`;
    if (seen.has(key)) add(`${a.pack} accepts ${a.code} twice`);
    seen.add(key);
    if (!PK_ACCEPTABLE.includes(a.code)) add(`${a.code} may not be accepted (${a.pack})`);
    if (!ids.includes(a.pack)) add(`${a.pack} is not a pack in the register`);
    if (!Number.isInteger(a.count) || a.count < 1) add(`${a.pack} ${a.code} has a count of ${a.count}`);
    if (a.reason.trim().length < 40) add(`${a.pack} ${a.code} has no real reason`);
  }
  return out;
}

export function assertPkRegister(): void {
  const p = validatePkRegister();
  if (p.length > 0) throw new Error(`The pack register is not well formed:\n${p.map((x) => `  ${x.message}`).join("\n")}`);
}
