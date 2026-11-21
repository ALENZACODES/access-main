// What the part of a web address after the question mark can carry in this App. Some pages read their choices from
// it (a place on the map, a search, a filter) and some pages build it into a link so a choice can be shared,
// bookmarked or opened again. A web address is copied, shared and kept by the browser outside the App, so a place or
// words a person typed that end up in one travel with the link. The list says which names the App reads or builds,
// in which file, how many places in that file do it, and the limit on length where the code sets one.
// audit/queryScan.ts reads the source and fails CI when the list and the source disagree.
//
// A row says what was read in the code. It says nothing about who sees a web address once it leaves the App, or
// what a browser keeps: that is outside the App and is not known here. A name that is built at run time (from a
// variable or a template) cannot be read by the scan, so it is listed as one row of its own, with the names it can
// take where the code names them in a list, and the places that build it are counted like any other.

import { isIsoDate, type Bilingual } from "./inventory";
import type { ConstRef } from "./retentionRegister";

/** What a name holds, in the order a person would worry about it: a place, typed words, picked places, then the rest. */
export type QueryKind = "place" | "typed" | "ids" | "choice" | "layout" | "language" | "format";

export const QUERY_KINDS: readonly QueryKind[] = ["place", "typed", "ids", "choice", "layout", "language", "format"];

/** The kinds that hold something a person chose or typed about themselves or the places they look at. */
export const PERSONAL_KINDS: ReadonlySet<QueryKind> = new Set<QueryKind>(["place", "typed", "ids"]);

/** The name given to a row for names the scan cannot read because the code builds them. */
export const RUN_TIME_NAME = "(built at run time)";

/** One file and how many places in it read or build the name. */
export interface QueryPlace {
  path: string;
  /** Places that read the name from a link the person opened */
  reads: number;
  /** Places that put the name into a link the App builds */
  builds: number;
}

/** A limit on how long a value can be, with the constant in the source that sets it. */
export interface QueryLimit {
  max: number;
  /** The file the limit applies in */
  appliesTo: string;
  from: ConstRef;
}

/** The names a run-time row can take, where the code lists them. */
export interface QueryNames {
  /** The text each name starts with, when the code adds one */
  prefix?: string;
  names: readonly string[];
  /** The list in the source that the names come from. Absent when the code has no such list: then the audits build the names with the App's own functions and compare. */
  from?: ConstRef;
}

export interface QueryRow {
  /** The name in the address, or RUN_TIME_NAME */
  name: string;
  kind: QueryKind;
  holds: Bilingual;
  places: readonly QueryPlace[];
  limits: readonly QueryLimit[];
  names?: QueryNames;
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

/** A call that looks like a query name but is not part of a web address a person sees. */
export interface NotQuery {
  path: string;
  name: string;
  why: string;
}

const REVIEWED = "2026-11-21";
const SOURCE = "Read from the source files named in the row";

type Extra = { limits?: QueryLimit[]; names?: QueryNames };

const row = (name: string, kind: QueryKind, holds: [string, string], places: Array<[string, number, number]>, extra: Extra = {}): QueryRow => ({
  name,
  kind,
  holds: { en: holds[0], fr: holds[1] },
  places: places.map(([path, reads, builds]) => ({ path, reads, builds })),
  limits: extra.limits ?? [],
  ...(extra.names === undefined ? {} : { names: extra.names }),
  source: SOURCE,
  recordedOn: REVIEWED,
});

export const QUERY_REGISTER: readonly QueryRow[] = [
  row("near", "place", ["A point on the map, as latitude and longitude in one value", "Un point sur la carte, en latitude et longitude dans une seule valeur"], [["apps/web/src/states/geo.ts", 1, 0]]),
  row("lat", "place", ["The latitude of a point on the map", "La latitude d’un point sur la carte"], [["apps/web/src/states/geo.ts", 1, 0]]),
  row("lon", "place", ["The longitude of a point on the map", "La longitude d’un point sur la carte"], [["apps/web/src/states/geo.ts", 1, 0]]),
  row("q", "typed", ["Words you typed to search for a place", "Des mots que vous avez saisis pour chercher un lieu"], [["apps/web/src/states/urlState.ts", 1, 1], ["apps/web/src/data-status/filters.ts", 1, 1]], {limits: [{ max: 100, appliesTo: "apps/web/src/states/urlState.ts", from: { path: "apps/web/src/states/urlState.ts", name: "MAX_QUERY_LENGTH" } }, { max: 100, appliesTo: "apps/web/src/data-status/filters.ts", from: { path: "apps/web/src/data-status/filters.ts", name: "MAX_QUERY_LENGTH" } }]}),
  row("need", "choice", ["Which accessibility features a place must have", "Les caractéristiques d’accessibilité qu’un lieu doit avoir"], [["apps/web/src/states/urlState.ts", 1, 1]]),
  row("unk", "choice", ["Whether places with unknown features are kept in the results", "Si les lieux dont les caractéristiques sont inconnues restent dans les résultats"], [["apps/web/src/states/urlState.ts", 1, 1]]),
  row("format", "format", ["The kind of file to download from the saved places page", "Le type de fichier à télécharger depuis la page des lieux enregistrés"], [["apps/web/src/states/app.ts", 2, 0]]),
  row("ids", "ids", ["The places you picked to compare, by their identifiers", "Les lieux que vous avez choisis de comparer, par leurs identifiants"], [["apps/web/src/states/app.ts", 1, 0]]),
  row("place", "ids", ["The place a route report is about, by its identifier", "Le lieu visé par un signalement de parcours, par son identifiant"], [["apps/web/src/hub/RouteReportsPage.tsx", 1, 0]]),
  row("lang", "language", ["The language of the data page", "La langue de la page des données"], [["apps/web/src/data-status/standalone/bootstrap.ts", 1, 0]]),
  row("state", "choice", ["Which freshness state the data page shows", "L’état de fraîcheur affiché par la page des données"], [["apps/web/src/data-status/filters.ts", 1, 1]]),
  row("kind", "choice", ["Which kind of dataset the data page shows", "Le type de jeu de données affiché par la page des données"], [["apps/web/src/data-status/filters.ts", 1, 1]]),
  row("tier", "choice", ["Which tier of source the data page shows", "Le niveau de source affiché par la page des données"], [["apps/web/src/data-status/filters.ts", 1, 1]]),
  row("lic", "choice", ["Which kind of licence the data page shows", "Le type de licence affiché par la page des données"], [["apps/web/src/data-status/filters.ts", 1, 1]]),
  row("ds", "choice", ["Which dataset the data page shows", "Le jeu de données affiché par la page des données"], [["apps/web/src/data-status/filters.ts", 1, 1]]),
  row("gap", "choice", ["Which missing field the data page shows", "Le champ manquant affiché par la page des données"], [["apps/web/src/data-status/filters.ts", 1, 1]]),
  row("age", "choice", ["How old the sources shown on the data page are", "L’ancienneté des sources affichées par la page des données"], [["apps/web/src/data-status/filters.ts", 1, 1]]),
  row("due", "choice", ["How soon a review is due for the sources shown on the data page", "L’échéance de révision des sources affichées par la page des données"], [["apps/web/src/data-status/filters.ts", 1, 1]]),
  row("issues", "choice", ["Whether the data page shows only sources with issues", "Si la page des données n’affiche que les sources avec des problèmes"], [["apps/web/src/data-status/filters.ts", 1, 1]]),
  row("group", "layout", ["How the list on the data page is grouped", "Le regroupement de la liste de la page des données"], [["apps/web/src/data-status/groupedList.ts", 1, 0], ["apps/web/src/data-status/panel.ts", 0, 1]]),
  row("page", "layout", ["Which page of the list on the data page is shown", "La page de la liste affichée par la page des données"], [["apps/web/src/data-status/paging.ts", 1, 0]]),
  row("size", "layout", ["How many rows each page of the data page holds", "Le nombre de lignes de chaque page de la page des données"], [["apps/web/src/data-status/paging.ts", 1, 0]]),
  row("pv", "layout", ["The fact the data page counts down its rows", "Le fait que la page des données compte en lignes"], [["apps/web/src/data-status/pivot.ts", 1, 0]]),
  row("pvby", "layout", ["The fact the data page counts across its columns", "Le fait que la page des données compte en colonnes"], [["apps/web/src/data-status/pivot.ts", 1, 0]]),
  row("batch", "layout", ["How many sources each review session holds", "Le nombre de sources de chaque séance de révision"], [["apps/web/src/data-status/reviewBatches.ts", 1, 0]]),
  row("sort", "layout", ["What the list on the data page is ordered by", "Le critère de tri de la liste de la page des données"], [["apps/web/src/data-status/sorting.ts", 1, 0]]),
  row("dir", "layout", ["Whether the order is rising or falling", "Si l’ordre est croissant ou décroissant"], [["apps/web/src/data-status/sorting.ts", 1, 0]]),
  row("cols", "layout", ["Which extra columns the data page shows", "Les colonnes supplémentaires affichées par la page des données"], [["apps/web/src/data-status/columns.ts", 1, 0]]),
  row("details", "layout", ["Whether row details are open on the data page", "Si les détails des lignes sont ouverts sur la page des données"], [["apps/web/src/data-status/tableView.ts", 1, 0]]),
  row("(built at run time)", "choice", ["The facets of the offline pack list, one name for each facet", "Les facettes de la liste du pack hors ligne, un nom pour chaque facette"], [["apps/web/src/states/packFacets.ts", 1, 1]], {limits: [{ max: 200, appliesTo: "apps/web/src/states/packFacets.ts", from: { path: "apps/web/src/states/packFacets.ts", name: "MAX_SOURCE_LENGTH" } }], names: { names: ["source", "licence", "tier", "age"], from: { path: "apps/web/src/states/packFacets.ts", name: "FACET_IDS" } }}),
  row("(built at run time)", "layout", ["How many days before a kind of dataset counts as out of date, one name for each kind", "Le nombre de jours avant qu’un type de jeu de données soit périmé, un nom pour chaque type"], [["apps/web/src/data-status/thresholds.ts", 1, 1]], {names: { prefix: "stale_", names: ["places", "routes", "transit", "boundaries", "reference"], from: { path: "apps/web/src/data-status/freshnessPolicy.ts", name: "DATASET_KINDS" } }}),
  row("(built at run time)", "layout", ["The order, columns, pivot, batch and paging of the data page, with names set by their own functions", "L’ordre, les colonnes, le tableau croisé, le lot et la pagination de la page des données, avec des noms fixés par leurs propres fonctions"], [["apps/web/src/data-status/panel.ts", 0, 6], ["apps/web/src/data-status/tableView.ts", 0, 1]], {names: { names: ["sort", "dir", "cols", "pv", "pvby", "batch", "size", "page", "group", "details"] }}),
];

/** Calls on the query that the scan finds and that are not a name in a web address a person sees. */
export const NOT_QUERY: readonly NotQuery[] = [
  { path: "apps/web/src/map/tileCache.ts", name: "__sha256", why: "Added to the key of a stored map file so a changed file is stored again. It is never shown or shared." },
];

export type QueryProblemCode =
  | "bad-name"
  | "bad-kind"
  | "bad-path"
  | "no-places"
  | "bad-count"
  | "duplicate-place"
  | "duplicate-name"
  | "empty-text"
  | "empty-source"
  | "bad-date"
  | "bad-limit"
  | "limit-outside-places"
  | "names-on-named-row"
  | "run-time-without-names-or-text"
  | "bad-listed-name"
  | "duplicate-listed-name";

export interface QueryProblem {
  code: QueryProblemCode;
  name: string;
  detail?: string;
}

const PATH_RE = /^(?!.*(?:^|\/)\.{1,2}(?:\/|$))[A-Za-z0-9_./-]+\.[cm]?[jt]sx?$/;
const NAME_RE = /^[A-Za-z_][A-Za-z0-9_.-]{0,63}$/;
const CONST_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;

/** Problems in a list of rows. Empty means every row is well formed and no name is listed twice. */
export function validateQueries(rows: readonly QueryRow[], notQuery: readonly NotQuery[] = NOT_QUERY): QueryProblem[] {
  const out: QueryProblem[] = [];
  const seenNames = new Set<string>();
  const seenPlaces = new Set<string>();
  for (const r of rows) {
    const at = { name: r.name };
    const runTime = r.name === RUN_TIME_NAME;
    if (!runTime && !NAME_RE.test(r.name)) out.push({ code: "bad-name", ...at });
    if (!QUERY_KINDS.includes(r.kind)) out.push({ code: "bad-kind", ...at, detail: String(r.kind) });
    if (r.holds.en.trim() === "" || r.holds.fr.trim() === "") out.push({ code: "empty-text", ...at });
    if (r.source.trim() === "") out.push({ code: "empty-source", ...at });
    if (!isIsoDate(r.recordedOn)) out.push({ code: "bad-date", ...at, detail: r.recordedOn });
    if (r.places.length === 0) out.push({ code: "no-places", ...at });
    const paths = new Set<string>();
    for (const p of r.places) {
      if (!PATH_RE.test(p.path)) out.push({ code: "bad-path", ...at, detail: p.path });
      if (!Number.isInteger(p.reads) || !Number.isInteger(p.builds) || p.reads < 0 || p.builds < 0 || p.reads + p.builds === 0) {
        out.push({ code: "bad-count", ...at, detail: `${p.path} ${p.reads}/${p.builds}` });
      }
      if (paths.has(p.path)) out.push({ code: "duplicate-place", ...at, detail: p.path });
      paths.add(p.path);
      if (!runTime) {
        const id = `${r.name} ${p.path}`;
        if (seenPlaces.has(id)) out.push({ code: "duplicate-place", ...at, detail: p.path });
        seenPlaces.add(id);
      } else {
        const id = `${RUN_TIME_NAME} ${p.path}`;
        if (seenPlaces.has(id)) out.push({ code: "duplicate-place", ...at, detail: p.path });
        seenPlaces.add(id);
      }
    }
    if (!runTime) {
      if (seenNames.has(r.name)) out.push({ code: "duplicate-name", ...at });
      seenNames.add(r.name);
    }
    for (const l of r.limits) {
      if (!Number.isInteger(l.max) || l.max < 1 || !PATH_RE.test(l.from.path) || !CONST_RE.test(l.from.name)) out.push({ code: "bad-limit", ...at, detail: l.from.name });
      if (!paths.has(l.appliesTo)) out.push({ code: "limit-outside-places", ...at, detail: l.appliesTo });
    }
    if (r.names !== undefined) {
      if (!runTime) out.push({ code: "names-on-named-row", ...at });
      if (r.names.from !== undefined && (!PATH_RE.test(r.names.from.path) || !CONST_RE.test(r.names.from.name))) out.push({ code: "bad-limit", ...at, detail: r.names.from.name });
      const listed = new Set<string>();
      for (const n of r.names.names) {
        if (!NAME_RE.test(`${r.names.prefix ?? ""}${n}`)) out.push({ code: "bad-listed-name", ...at, detail: n });
        if (listed.has(n)) out.push({ code: "duplicate-listed-name", ...at, detail: n });
        listed.add(n);
      }
    }
  }
  for (const n of notQuery) {
    if (!PATH_RE.test(n.path) || n.name.trim() === "" || n.why.trim() === "") out.push({ code: "bad-path", name: n.name, detail: n.path });
  }
  return out.sort((a, b) => `${a.name} ${a.code} ${a.detail ?? ""}`.localeCompare(`${b.name} ${b.code} ${b.detail ?? ""}`));
}

/** Throws at start-up when the rows are wrong, like the other registers. */
export function assertQueries(rows: readonly QueryRow[]): void {
  const p = validateQueries(rows);
  if (p.length > 0) throw new Error(`Web address register is wrong: ${p.map((x) => `${x.code} ${x.name}${x.detail === undefined ? "" : ` (${x.detail})`}`).join("; ")}`);
}

export interface QueryCounts {
  /** Names written out in the code, one per named row */
  names: number;
  /** Rows for names built at run time */
  runTime: number;
  /** Places in the source that read or build a name, over all rows */
  places: number;
  /** Different files */
  files: number;
  /** Named rows with at least one place that puts the name into a link */
  built: number;
  /** Named rows that hold a place, typed words or picked places */
  personal: number;
  /** Named rows with a place that puts a personal name into a link */
  personalBuilt: number;
}

/** True when a place in the row puts the name into a link, or a run-time row that lists the name does. */
export function isBuilt(rows: readonly QueryRow[], row: QueryRow): boolean {
  if (row.places.some((p) => p.builds > 0)) return true;
  if (row.name === RUN_TIME_NAME) return false;
  return rows.some((r) => r.name === RUN_TIME_NAME && r.places.some((p) => p.builds > 0) && namesOf(r).includes(row.name));
}

export function queryCounts(rows: readonly QueryRow[]): QueryCounts {
  const named = rows.filter((r) => r.name !== RUN_TIME_NAME);
  const builds = (r: QueryRow): boolean => isBuilt(rows, r);
  return {
    names: named.length,
    runTime: rows.length - named.length,
    places: rows.reduce((n, r) => n + r.places.reduce((m, p) => m + p.reads + p.builds, 0), 0),
    files: new Set(rows.flatMap((r) => r.places.map((p) => p.path))).size,
    built: named.filter(builds).length,
    personal: named.filter((r) => PERSONAL_KINDS.has(r.kind)).length,
    personalBuilt: named.filter((r) => PERSONAL_KINDS.has(r.kind) && builds(r)).length,
  };
}

/** The row for a name: the row that names it, or the run-time row whose list of names (with its prefix) holds it. */
export function rowForName(rows: readonly QueryRow[], name: string): QueryRow | null {
  const own = rows.find((r) => r.name === name);
  if (own !== undefined) return own;
  for (const r of rows) {
    if (r.name !== RUN_TIME_NAME || r.names === undefined) continue;
    const prefix = r.names.prefix ?? "";
    if (name.startsWith(prefix) && r.names.names.includes(name.slice(prefix.length))) return r;
  }
  return null;
}

/** The names a row can take: its own, or the full names of a run-time row. Empty for a run-time row with no list. */
export function namesOf(row: QueryRow): string[] {
  if (row.name !== RUN_TIME_NAME) return [row.name];
  return row.names === undefined ? [] : row.names.names.map((n) => `${row.names?.prefix ?? ""}${n}`);
}

/** The longest value the code allows for a name, over the files that read or build it, or null when no limit is listed. */
export function longestAllowed(row: QueryRow): number | null {
  return row.limits.length === 0 ? null : Math.max(...row.limits.map((l) => l.max));
}
