// The links in the App that open another app on a person's device: an email draft, a place in a maps app, a
// phone number in a dialler. Each one starts only when the person taps a link, and each one passes the other app
// some text the App chose. The list says which file makes each kind of link, how many places in that file make
// one, what the link carries and which app opens. audit/handoffScan.ts reads the source and fails CI when the
// list and the source disagree, so a new kind of link cannot appear unseen.
//
// A row says what was read in the code. It says nothing about what the other app does with the text: that is
// outside the App. Opening another app through code the scan cannot follow (a run-time address passed to
// location.assign, window.open or a href assignment) is a kind of its own, "navigation", and must have no row
// unless someone has read it and written down where it goes.

import { isIsoDate, type Bilingual } from "./inventory";

export type SchemeId = "mailto" | "tel" | "sms" | "geo" | "webcal" | "maps" | "intent" | "whatsapp" | "facetime" | "navigation";

export interface HandoffRow {
  scheme: SchemeId;
  /** Repo-relative path of the file that makes the link */
  path: string;
  /** How many places in that file make one */
  uses: number;
  /** The app the link opens, in plain words */
  opens: Bilingual;
  /** What the App puts in the link, in plain words */
  carries: Bilingual;
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-20";
const SOURCE = "Read from the source file named in the row";

const row = (scheme: SchemeId, path: string, uses: number, opens: [string, string], carries: [string, string]): HandoffRow => ({
  scheme,
  path,
  uses,
  opens: { en: opens[0], fr: opens[1] },
  carries: { en: carries[0], fr: carries[1] },
  source: SOURCE,
  recordedOn: REVIEWED,
});

export const HANDOFF_REGISTER: readonly HandoffRow[] = [
  row(
    "mailto",
    "apps/web/src/states/visitMessage.ts",
    1,
    ["Your email app", "Votre application de courriel"],
    ["A draft with a subject and the questions you chose, and no address to send it to", "Un brouillon avec un objet et les questions que vous avez choisies, sans adresse de destinataire"],
  ),
  row(
    "geo",
    "apps/web/src/states/geo.ts",
    1,
    ["Your maps app", "Votre application de cartes"],
    ["The latitude and longitude of a place you chose, to five decimal places", "La latitude et la longitude d’un lieu que vous avez choisi, à cinq décimales"],
  ),
  row(
    "tel",
    "apps/web/src/pages/OfflinePackPage.tsx",
    1,
    ["Your phone or calling app", "Votre téléphone ou votre application d’appel"],
    ["The digits of a help line’s number, from the offline pack", "Les chiffres du numéro d’une ligne d’aide, tirés du pack hors ligne"],
  ),
];

export type HandoffProblemCode =
  | "bad-scheme"
  | "bad-path"
  | "bad-count"
  | "empty-text"
  | "empty-source"
  | "bad-date"
  | "duplicate-row";

export interface HandoffProblem {
  code: HandoffProblemCode;
  scheme: string;
  path: string;
  detail?: string;
}

const SCHEMES: ReadonlySet<string> = new Set(["mailto", "tel", "sms", "geo", "webcal", "maps", "intent", "whatsapp", "facetime", "navigation"]);
const PATH_RE = /^(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_./-]+\.[cm]?[jt]sx?$/;

/** Problems in a list of rows. Empty means every row is well formed and no scheme and file appear twice. */
export function validateHandoffs(rows: readonly HandoffRow[]): HandoffProblem[] {
  const out: HandoffProblem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    const at = { scheme: r.scheme, path: r.path };
    if (!SCHEMES.has(r.scheme)) out.push({ code: "bad-scheme", ...at });
    if (!PATH_RE.test(r.path)) out.push({ code: "bad-path", ...at });
    if (!Number.isInteger(r.uses) || r.uses < 1) out.push({ code: "bad-count", ...at, detail: String(r.uses) });
    if (r.opens.en.trim() === "" || r.opens.fr.trim() === "" || r.carries.en.trim() === "" || r.carries.fr.trim() === "") out.push({ code: "empty-text", ...at });
    if (r.source.trim() === "") out.push({ code: "empty-source", ...at });
    if (!isIsoDate(r.recordedOn)) out.push({ code: "bad-date", ...at, detail: r.recordedOn });
    const id = `${r.scheme} ${r.path}`;
    if (seen.has(id)) out.push({ code: "duplicate-row", ...at });
    seen.add(id);
  }
  return out.sort((a, b) => `${a.scheme} ${a.path} ${a.code}`.localeCompare(`${b.scheme} ${b.path} ${b.code}`));
}

/** Throws at start-up when the rows are wrong, like the other registers. */
export function assertHandoffs(rows: readonly HandoffRow[]): void {
  const p = validateHandoffs(rows);
  if (p.length > 0) throw new Error(`Hand-off register is wrong: ${p.map((x) => `${x.code} ${x.scheme} ${x.path}${x.detail === undefined ? "" : ` (${x.detail})`}`).join("; ")}`);
}

export interface HandoffCounts {
  /** Rows */
  total: number;
  /** Places in the source that make a link, over all rows */
  uses: number;
  /** Different kinds of link */
  schemes: number;
  /** Different files */
  files: number;
}

export function handoffCounts(rows: readonly HandoffRow[]): HandoffCounts {
  return {
    total: rows.length,
    uses: rows.reduce((n, r) => n + r.uses, 0),
    schemes: new Set(rows.map((r) => r.scheme)).size,
    files: new Set(rows.map((r) => r.path)).size,
  };
}

/** The rows for one kind of link. */
export function rowsFor(rows: readonly HandoffRow[], scheme: SchemeId): HandoffRow[] {
  return rows.filter((r) => r.scheme === scheme);
}
