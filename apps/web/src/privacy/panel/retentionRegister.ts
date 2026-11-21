// How long each thing the App keeps on a device is kept, and how much of it. One row for each name in the storage
// register, one for each name the privacy panel keeps itself, and one for the store the scan cannot see.
//
// A row says only what the code was found to do. A time limit, a count limit and a size limit each name the constant
// in the source that sets it, and audit/retentionScan.ts reads that constant and fails CI when the number here is not
// the number there. A row with no limits says that none was found in the files that name the key, which is a
// statement about what was read and not a promise: it stays that way until someone changes the code and the row.
// A store that could not be read is UNKNOWN. Nothing here is read from a person's device.

import { ACTIVITY_KEY_SUFFIX, ACTIVITY_TTL_DAYS, MAX_ACTIVITY_ENTRIES } from "./activityLog";
import { SEEN_KEY_SUFFIX, SEEN_TTL_DAYS } from "./changes";
import { CONSENT_KEY_SUFFIX } from "./consent";
import { EGRESS_KEY_SUFFIX, EGRESS_TTL_DAYS, MAX_EGRESS_HOSTS } from "./egressLog";
import { MAX_TTL_DAYS } from "./expiry";
import { isIsoDate, type Bilingual } from "./inventory";
import { PRIVACY_STORAGE_PREFIX } from "./live";
import { PREFS_KEY_SUFFIX } from "./preferences";
import type { RegisterRow, UnscannedRow } from "./storageRegister";

/** The constant in the source that sets a limit. The scan reads it and compares the number. */
export interface ConstRef {
  /** Repo-relative path of the file that declares the constant */
  path: string;
  name: string;
}

/** What happens to a new item when a count or size limit is reached. */
export type WhenFull = "oldest-removed" | "new-refused";

export type Limit =
  /** The value ends this many days after it was last saved. */
  | { kind: "days"; days: number; from: ConstRef }
  /** At most this many items. `unit` is the plural noun for them. */
  | { kind: "count"; max: number; unit: Bilingual; whenFull: WhenFull; from: ConstRef }
  /** At most this many bytes of `about`. */
  | { kind: "bytes"; max: number; about: Bilingual; whenFull: WhenFull; from: ConstRef };

export interface RetentionRow {
  /** The storage name, or UNKNOWN when the scan cannot see it */
  key: string;
  holds: Bilingual;
  /** Every file that names the key when the row was written. A new file that names it is a change to review. */
  files: readonly string[];
  /** The limits found, or UNKNOWN. An empty list means none was found in those files. */
  limits: readonly Limit[] | "UNKNOWN";
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

/** A constant in a file that names a key whose name looks like a limit but is not a retention limit. */
export interface NotRetention {
  path: string;
  name: string;
  why: string;
}

const REVIEWED = "2026-11-20";
const SOURCE = "Read from the source files named in the row";
const SRC = "apps/web/src";
const PANEL = `${SRC}/privacy/panel`;

const items = (en: string, fr: string): Bilingual => ({ en, fr });

/** The limits of the stores that keep a list or a cache, from the files that write them. */
export const RETENTION_REGISTER: readonly RetentionRow[] = [
  {
    key: "__map_tile_list",
    holds: items("The list of map tiles kept for offline use", "La liste des tuiles de carte gardées pour l’usage hors ligne"),
    files: [`${SRC}/map/tileCache.ts`],
    limits: [{ kind: "bytes", max: 50 * 1024 * 1024, about: items("map tiles", "tuiles de carte"), whenFull: "oldest-removed", from: { path: `${SRC}/map/tileCache.ts`, name: "MAX_BYTES" } }],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "access.language",
    holds: items("The language you chose", "La langue que vous avez choisie"),
    files: [`${SRC}/i18n/index.ts`],
    limits: [],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "access.language.set",
    holds: items("A note that you chose the language yourself", "Une note indiquant que vous avez choisi la langue vous-même"),
    files: [`${SRC}/i18n/index.ts`],
    limits: [],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "access.routeReports.v1",
    holds: items("Route reports you wrote on this device", "Les signalements de parcours que vous avez rédigés sur cet appareil"),
    files: [`${SRC}/hub/RouteReportsPage.tsx`, `${PANEL}/live.ts`],
    limits: [],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "app.corrections.v1",
    holds: items("Corrections you wrote and have not sent", "Les corrections que vous avez rédigées et pas encore envoyées"),
    files: [`${SRC}/states/submissionQueue.ts`],
    limits: [{ kind: "count", max: 50, unit: items("corrections", "corrections"), whenFull: "new-refused", from: { path: `${SRC}/states/submissionQueue.ts`, name: "MAX_QUEUE" } }],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "app.pack-shortlist.v1",
    holds: items("The places you added to your list of saved places", "Les lieux que vous avez ajoutés à votre liste de lieux enregistrés"),
    files: [`${SRC}/states/shortlist.ts`],
    limits: [{ kind: "count", max: 12, unit: items("places", "lieux"), whenFull: "new-refused", from: { path: `${SRC}/states/shortlist.ts`, name: "MAX_SHORTLIST" } }],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "app.preferences.v1",
    holds: items("Your display preferences", "Vos préférences d’affichage"),
    files: [`${SRC}/states/preferences.ts`],
    limits: [],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "data-status:history:v1",
    holds: items("A history of data status checks", "Un historique des contrôles de l’état des données"),
    files: [`${SRC}/data-status/history.ts`],
    limits: [{ kind: "count", max: 30, unit: items("checks", "contrôles"), whenFull: "oldest-removed", from: { path: `${SRC}/data-status/history.ts`, name: "MAX_HISTORY" } }],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "data-status:saved-views:v1",
    holds: items("Views of the data status page you saved", "Les vues de la page sur l’état des données que vous avez enregistrées"),
    files: [`${SRC}/data-status/savedViews.ts`],
    limits: [{ kind: "count", max: 8, unit: items("views", "vues"), whenFull: "new-refused", from: { path: `${SRC}/data-status/savedViews.ts`, name: "MAX_SAVED_VIEWS" } }],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "data-status:snapshot:v1",
    holds: items("The last data status snapshot", "Le dernier aperçu de l’état des données"),
    files: [`${SRC}/data-status/snapshot.ts`],
    limits: [],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: `${PRIVACY_STORAGE_PREFIX}${PREFS_KEY_SUFFIX}`,
    holds: items("Your language choice on the privacy page", "Votre choix de langue sur la page de confidentialité"),
    files: [`${PANEL}/preferences.ts`],
    limits: [],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: `${PRIVACY_STORAGE_PREFIX}${CONSENT_KEY_SUFFIX}`,
    holds: items("Your choices about optional features", "Vos choix sur les fonctions facultatives"),
    files: [`${PANEL}/consent.ts`],
    limits: [],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: `${PRIVACY_STORAGE_PREFIX}${ACTIVITY_KEY_SUFFIX}`,
    holds: items("Recent privacy actions", "Actions récentes de confidentialité"),
    files: [`${PANEL}/activityLog.ts`],
    limits: [
      { kind: "days", days: ACTIVITY_TTL_DAYS, from: { path: `${PANEL}/activityLog.ts`, name: "ACTIVITY_TTL_DAYS" } },
      { kind: "count", max: MAX_ACTIVITY_ENTRIES, unit: items("actions", "actions"), whenFull: "oldest-removed", from: { path: `${PANEL}/activityLog.ts`, name: "MAX_ACTIVITY_ENTRIES" } },
    ],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: `${PRIVACY_STORAGE_PREFIX}${SEEN_KEY_SUFFIX}`,
    holds: items("The last data list you saw", "La dernière liste de données que vous avez vue"),
    files: [`${PANEL}/changes.ts`],
    limits: [{ kind: "days", days: SEEN_TTL_DAYS, from: { path: `${PANEL}/changes.ts`, name: "SEEN_TTL_DAYS" } }],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: `${PRIVACY_STORAGE_PREFIX}${EGRESS_KEY_SUFFIX}`,
    holds: items("Requests the App stopped", "Demandes que l’App a arrêtées"),
    files: [`${PANEL}/egressLog.ts`],
    limits: [
      { kind: "days", days: EGRESS_TTL_DAYS, from: { path: `${PANEL}/egressLog.ts`, name: "EGRESS_TTL_DAYS" } },
      { kind: "count", max: MAX_EGRESS_HOSTS, unit: items("addresses", "adresses"), whenFull: "oldest-removed", from: { path: `${PANEL}/egressLog.ts`, name: "MAX_EGRESS_HOSTS" } },
    ],
    source: SOURCE,
    recordedOn: REVIEWED,
  },
  {
    key: "UNKNOWN",
    holds: items("Connection requests you made", "Les demandes de connexion que vous avez faites"),
    files: [`${SRC}/hub/PeerRequestPage.tsx`],
    limits: "UNKNOWN",
    source: SOURCE,
    recordedOn: REVIEWED,
  },
];

/**
 * Constants in those files whose names look like limits but are not about how long or how much is kept.
 * Each needs a reason, so a new limit is never waved through by a name that happens to look the same.
 */
export const NOT_RETENTION: readonly NotRetention[] = [
  { path: `${SRC}/states/submissionQueue.ts`, name: "BACKOFF_MAX_MS", why: "The longest wait before a send is tried again. It is not how long anything is kept." },
  { path: `${SRC}/states/shortlist.ts`, name: "MAX_ID_LENGTH", why: "The longest place name accepted. It limits one value, not how many are kept." },
  { path: `${SRC}/data-status/savedViews.ts`, name: "MAX_VIEW_NAME_LENGTH", why: "The longest name for a saved view. It limits one value, not how many are kept." },
  { path: `${PANEL}/expiry.ts`, name: "MAX_TTL_DAYS", why: "The longest lifetime the code accepts for a value. No value is kept for that long by default." },
];

/** The longest lifetime the code accepts, so a row cannot claim a time limit the code would refuse to set. */
export const LONGEST_LIFETIME_DAYS = MAX_TTL_DAYS;

export type RetentionProblemCode =
  | "empty-key"
  | "duplicate-key"
  | "bad-key"
  | "no-files"
  | "bad-path"
  | "bad-number"
  | "bad-unit"
  | "repeated-limit"
  | "bad-date"
  | "empty-text"
  | "empty-source"
  | "unknown-with-key"
  | "missing-row"
  | "extra-row"
  | "path-not-listed";

export interface RetentionProblem {
  code: RetentionProblemCode;
  key: string;
  detail?: string;
}

const KEY_CHARS = /^[A-Za-z0-9_.:-]+$/;
const PATH_RE = /^[A-Za-z0-9_./-]+\.[cm]?[jt]sx?$/;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

function limitProblems(row: RetentionRow): RetentionProblem[] {
  const out: RetentionProblem[] = [];
  if (row.limits === "UNKNOWN") return out;
  const seen = new Set<string>();
  for (const l of row.limits) {
    if (seen.has(l.kind)) out.push({ code: "repeated-limit", key: row.key, detail: l.kind });
    seen.add(l.kind);
    if (!PATH_RE.test(l.from.path)) out.push({ code: "bad-path", key: row.key, detail: l.from.path });
    if (!NAME_RE.test(l.from.name)) out.push({ code: "bad-path", key: row.key, detail: l.from.name });
    if (l.kind === "days") {
      if (!Number.isInteger(l.days) || l.days < 1 || l.days > LONGEST_LIFETIME_DAYS) out.push({ code: "bad-number", key: row.key, detail: `days ${l.days}` });
    } else if (l.kind === "count") {
      if (!Number.isInteger(l.max) || l.max < 2) out.push({ code: "bad-number", key: row.key, detail: `count ${l.max}` });
      if (l.unit.en.trim() === "" || l.unit.fr.trim() === "") out.push({ code: "bad-unit", key: row.key });
    } else {
      if (!Number.isInteger(l.max) || l.max < 1024) out.push({ code: "bad-number", key: row.key, detail: `bytes ${l.max}` });
      if (l.about.en.trim() === "" || l.about.fr.trim() === "") out.push({ code: "bad-unit", key: row.key });
    }
  }
  return out;
}

export interface RetentionContext {
  /** The storage register. Every row in it needs a retention row with the same key, and the other way round. */
  register?: readonly RegisterRow[];
  unscanned?: readonly UnscannedRow[];
  /** The names the panel keeps itself. Each needs a row. */
  ownKeys?: readonly string[];
}

/** Problems in a list of rows. Empty means the list is well formed and covers what it was given. */
export function validateRetention(rows: readonly RetentionRow[], ctx: RetentionContext = {}): RetentionProblem[] {
  const out: RetentionProblem[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (r.key.trim() === "") out.push({ code: "empty-key", key: r.key });
    else if (r.key !== "UNKNOWN" && !KEY_CHARS.test(r.key)) out.push({ code: "bad-key", key: r.key });
    if (r.key !== "UNKNOWN" && seen.has(r.key)) out.push({ code: "duplicate-key", key: r.key });
    seen.add(r.key);
    if (r.key !== "UNKNOWN" && r.limits === "UNKNOWN") out.push({ code: "unknown-with-key", key: r.key });
    if (r.files.length === 0) out.push({ code: "no-files", key: r.key });
    for (const f of r.files) if (!PATH_RE.test(f)) out.push({ code: "bad-path", key: r.key, detail: f });
    if (r.holds.en.trim() === "" || r.holds.fr.trim() === "") out.push({ code: "empty-text", key: r.key });
    if (r.source.trim() === "") out.push({ code: "empty-source", key: r.key });
    if (!isIsoDate(r.recordedOn)) out.push({ code: "bad-date", key: r.key, detail: r.recordedOn });
    out.push(...limitProblems(r));
  }
  const wanted = new Set<string>([...(ctx.register ?? []).map((x) => x.key), ...(ctx.ownKeys ?? [])]);
  if (ctx.unscanned !== undefined && ctx.unscanned.length > 0) wanted.add("UNKNOWN");
  if (ctx.register !== undefined || ctx.ownKeys !== undefined || ctx.unscanned !== undefined) {
    for (const k of wanted) if (!seen.has(k)) out.push({ code: "missing-row", key: k });
    for (const k of seen) if (!wanted.has(k)) out.push({ code: "extra-row", key: k });
  }
  for (const reg of ctx.register ?? []) {
    const row = rows.find((r) => r.key === reg.key);
    if (row !== undefined && !row.files.includes(reg.path)) out.push({ code: "path-not-listed", key: reg.key, detail: reg.path });
  }
  return out.sort((a, b) => (a.key + a.code).localeCompare(b.key + b.code));
}

/** Throws at start-up when the rows are wrong, like the other registers. */
export function assertRetention(rows: readonly RetentionRow[], ctx: RetentionContext = {}): void {
  const p = validateRetention(rows, ctx);
  if (p.length > 0) throw new Error(`Retention register is wrong: ${p.map((x) => `${x.code} ${x.key}${x.detail === undefined ? "" : ` (${x.detail})`}`).join("; ")}`);
}

export interface RetentionCounts {
  total: number;
  /** Rows with a time limit */
  timed: number;
  /** Rows with a count or size limit */
  capped: number;
  /** Rows where no limit of either kind was found in the files that name the key */
  none: number;
  /** Rows that could not be read */
  unknown: number;
}

export function retentionCounts(rows: readonly RetentionRow[]): RetentionCounts {
  let timed = 0;
  let capped = 0;
  let none = 0;
  let unknown = 0;
  for (const r of rows) {
    if (r.limits === "UNKNOWN") {
      unknown += 1;
      continue;
    }
    const hasTime = r.limits.some((l) => l.kind === "days");
    const hasCap = r.limits.some((l) => l.kind !== "days");
    if (hasTime) timed += 1;
    if (hasCap) capped += 1;
    if (!hasTime && !hasCap) none += 1;
  }
  return { total: rows.length, timed, capped, none, unknown };
}

/** The limit of one kind, or undefined when the row has none of that kind. */
export function limitOf<K extends Limit["kind"]>(row: RetentionRow, kind: K): Extract<Limit, { kind: K }> | undefined {
  if (row.limits === "UNKNOWN") return undefined;
  return row.limits.find((l): l is Extract<Limit, { kind: K }> => l.kind === kind);
}
