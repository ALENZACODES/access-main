/**
 * Evidence pack from consented reports: one JSON document, CSV files and Markdown read-me files.
 * The same inputs and options always give the same bytes. Nothing is read from the clock, and
 * the order of the inputs does not matter.
 */
import { isRealDate } from "../dates.ts";
import { t, type Lang, type MessageKey } from "../i18n/index.ts";
import type { LocalisedText } from "../types.ts";
import type { ValidationResult } from "../validate.ts";
import { checkConsent, type ConsentProblem } from "./consent.ts";
import { indexRegions } from "./regions.ts";
import { DEFAULT_MIN_CELL_SIZE, buildProtectedTables, checkMinimumCellSize } from "./tables.ts";
import {
  PERIOD_GRAINS,
  REPORT_PACK_SCHEMA_VERSION,
  TOTAL,
  UNKNOWN,
  type AdvocacyReport,
  type ConsentEntry,
  type InputSet,
  type PeriodGrain,
  type ProtectedTable,
  type ProvenanceEntry,
  type Region,
  type ReportEvidencePack,
  type RequiredPurpose,
} from "./types.ts";
import { validateConsentEntry, validateInputSet, validateRegion, validateReport } from "./validate.ts";

export interface ReportPackInput {
  reports: readonly unknown[];
  inputSets: readonly unknown[];
  regions: readonly unknown[];
  consentLedger: readonly unknown[];
}

export interface ReportPackOptions {
  /** The as-of date, YYYY-MM-DD. Supplied, never read from the clock. */
  asOf: string;
  /** The consent purpose and version every report must be granted for. */
  requiredPurpose: RequiredPurpose;
  minimumCellSize?: number;
  grain?: PeriodGrain;
}

export type RefusalCode =
  | ConsentProblem
  | "no_reports"
  | "invalid_report"
  | "invalid_input_set"
  | "invalid_region"
  | "invalid_consent_entry"
  | "invalid_region_table"
  | "duplicate_report_id"
  | "duplicate_set_id"
  | "unknown_set"
  | "unknown_region";

export interface RefusalReason {
  code: RefusalCode;
  count: number;
  /** Ids or positions of the records concerned. They stay on the device. */
  refs: string[];
}

export interface PackFile {
  name: string;
  mime: string;
  content: string;
}

export type ReportPackResult =
  | { ok: true; pack: ReportEvidencePack; files: PackFile[] }
  | { ok: false; refusal: RefusalReason[] };

const METHOD_KEYS = ["rp.method.1", "rp.method.2", "rp.method.3", "rp.method.4", "rp.method.5"] as const;
const LIMIT_KEYS = ["rp.limit.1", "rp.limit.2", "rp.limit.3", "rp.limit.4", "rp.limit.5", "rp.limit.6"] as const;
const RULE_IDS = [
  "minimum_cell_size",
  "table_withheld",
  "small_region_roll_up",
  "row_roll_up",
  "topic_combining",
  "primary_suppression",
  "complementary_suppression",
  "no_split",
] as const;
const LANGS: readonly Lang[] = ["en", "fr"];

type Vars = Record<string, string | number>;

function both(key: MessageKey, vars: Vars): LocalisedText {
  return { en: t("en", key, vars), fr: t("fr", key, vars) };
}

function validateAll<T>(values: readonly unknown[], validate: (value: unknown) => ValidationResult<T>): { good: T[]; bad: string[] } {
  const good: T[] = [];
  const bad: string[] = [];
  values.forEach((value, position) => {
    const result = validate(value);
    if (result.ok) good.push(result.value);
    else bad.push(`#${position}`);
  });
  return { good, bad };
}

function duplicates(ids: readonly string[]): string[] {
  const seen = new Set<string>();
  const twice = new Set<string>();
  for (const id of ids) (seen.has(id) ? twice : seen).add(id);
  return [...twice].sort();
}

/** FNV-1a over UTF-16 code units, run twice with different offsets. A fingerprint, not a security hash. */
export function fingerprintOf(text: string): string {
  const run = (seed: number): string => {
    let hash = seed;
    for (let i = 0; i < text.length; i += 1) {
      hash ^= text.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return (hash >>> 0).toString(16).padStart(8, "0");
  };
  return `fnv1a-${run(0x811c9dc5)}${run(0x9747b28c)}`;
}

function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * Check every input, check consent, build the protected tables and assemble the pack. Any
 * problem with the inputs or with consent stops the build; no partial pack is returned.
 */
export function buildReportEvidencePack(input: ReportPackInput, options: ReportPackOptions): ReportPackResult {
  if (!isRealDate(options.asOf)) throw new RangeError("asOf must be a real date written YYYY-MM-DD");
  const minimum = checkMinimumCellSize(options.minimumCellSize ?? DEFAULT_MIN_CELL_SIZE);
  const grain = options.grain ?? "month";
  if (!PERIOD_GRAINS.includes(grain)) throw new RangeError("grain must be month, quarter or year");
  const purpose = options.requiredPurpose;
  if (!/^[a-z0-9][a-z0-9_.-]{1,63}$/.test(purpose.purpose_id) || !Number.isInteger(purpose.purpose_version) || purpose.purpose_version < 1) {
    throw new RangeError("requiredPurpose must name a purpose id and a version of at least 1");
  }

  const refusal: RefusalReason[] = [];
  const refuse = (code: RefusalCode, refs: readonly string[]) => {
    if (refs.length > 0) refusal.push({ code, count: refs.length, refs: [...refs] });
  };

  const reports = validateAll<AdvocacyReport>(input.reports, validateReport);
  const sets = validateAll<InputSet>(input.inputSets, validateInputSet);
  const regions = validateAll<Region>(input.regions, validateRegion);
  const ledger = validateAll<ConsentEntry>(input.consentLedger, validateConsentEntry);
  refuse("invalid_report", reports.bad);
  refuse("invalid_input_set", sets.bad);
  refuse("invalid_region", regions.bad);
  refuse("invalid_consent_entry", ledger.bad);
  if (input.reports.length === 0) refusal.push({ code: "no_reports", count: 0, refs: [] });
  refuse("duplicate_report_id", duplicates(reports.good.map((r) => r.id)));
  refuse("duplicate_set_id", duplicates(sets.good.map((s) => s.id)));

  const regionIndex = indexRegions(regions.good);
  if (!regionIndex.ok) refuse("invalid_region_table", regionIndex.codes);
  const setById = new Map(sets.good.map((set) => [set.id, set]));
  refuse("unknown_set", reports.good.filter((r) => !setById.has(r.set_id)).map((r) => r.id).sort());
  if (regionIndex.ok) {
    refuse("unknown_region", reports.good.filter((r) => r.region_code !== UNKNOWN && !regionIndex.index.has(r.region_code)).map((r) => r.id).sort());
  }
  for (const finding of checkConsent(reports.good, ledger.good, purpose)) refuse(finding.code, finding.report_ids);
  if (refusal.length > 0 || !regionIndex.ok) return { ok: false, refusal };

  const { tables } = buildProtectedTables(reports.good, regionIndex.index, { minimumCellSize: minimum, grain });
  const usedSets = [...new Set(reports.good.map((r) => r.set_id))].sort(compare);
  const provenance: ProvenanceEntry[] = usedSets.flatMap((id) => {
    const set = setById.get(id);
    if (!set) return [];
    return [{ set_id: set.id, source_name: set.source_name, source_url: set.source_url, licence: set.licence, source_date: set.source_date, tier: set.tier, label: set.label, example: set.example }];
  });

  const published = tables.flatMap((table) => (table.state === "published" ? [table] : []));
  const cells = published.flatMap((table) => table.rows.flatMap((row) => row.cells));
  const vars: Vars = { k: minimum, kMinusOne: minimum - 1 };
  const body: Omit<ReportEvidencePack, "fingerprint"> = {
    record_type: "advocacy_report_evidence_pack",
    schema_version: REPORT_PACK_SCHEMA_VERSION,
    publication_context: "prototype",
    as_of: options.asOf,
    demonstration: reports.good.some((r) => r.example) || provenance.some((p) => p.example) || regions.good.some((r) => r.example),
    period_grain: grain,
    methodology: { en: METHOD_KEYS.map((key) => t("en", key, vars)), fr: METHOD_KEYS.map((key) => t("fr", key, vars)) },
    limits: { en: LIMIT_KEYS.map((key) => t("en", key, vars)), fr: LIMIT_KEYS.map((key) => t("fr", key, vars)) },
    suppression: {
      minimum_cell_size: minimum,
      rules: RULE_IDS.map((id) => ({ id, ...both(`rp.rule.${id}`, vars) })),
      counts: {
        tables_published: published.length,
        tables_withheld: tables.length - published.length,
        cells_published: cells.filter((cell) => cell.state === "published").length,
        cells_suppressed: cells.filter((cell) => cell.state === "suppressed").length,
        rows_rolled_up: published.reduce((sum, table) => sum + table.rolled_up_rows.length, 0),
        topics_combined: published.reduce((sum, table) => sum + table.combined_topics.length, 0),
      },
    },
    consent: { required_purpose: { purpose_id: purpose.purpose_id, purpose_version: purpose.purpose_version }, all_reports_granted: true },
    provenance,
    reports_in_published_tables: published.reduce((sum, table) => sum + table.total, 0),
    tables,
  };
  const pack: ReportEvidencePack = { ...body, fingerprint: fingerprintOf(JSON.stringify(body)) };
  return { ok: true, pack, files: packFiles(pack) };
}

function csvField(value: string | number): string {
  const text = String(value);
  // A leading =, +, - or @ could be run as a formula by a spreadsheet.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function csv(rows: ReadonlyArray<ReadonlyArray<string | number>>): string {
  return rows.map((row) => row.map(csvField).join(",")).join("\r\n") + "\r\n";
}

/** One line per cell and per total. A suppressed cell or a withheld table has an empty count. */
export function tablesCsv(pack: ReportEvidencePack): string {
  const rows: Array<Array<string | number>> = [["table_id", "kind", "period", "region_code", "topic", "state", "count"]];
  for (const table of pack.tables) {
    const lead = [table.id, table.kind, table.period];
    if (table.state === "withheld") {
      rows.push([...lead, "", "", "withheld", ""]);
      continue;
    }
    for (const row of table.rows) {
      row.cells.forEach((cell, c) => {
        rows.push([...lead, row.region_code, table.topics[c] ?? "", cell.state, cell.state === "published" ? cell.count : ""]);
      });
      rows.push([...lead, row.region_code, TOTAL, "published", row.total]);
    }
    table.column_totals.forEach((total, c) => rows.push([...lead, TOTAL, table.topics[c] ?? "", "published", total]));
    rows.push([...lead, TOTAL, TOTAL, "published", table.total]);
  }
  return csv(rows);
}

export function provenanceCsv(pack: ReportEvidencePack): string {
  const rows: Array<Array<string | number>> = [["set_id", "source_name", "source_url", "licence", "source_date", "tier", "label", "example"]];
  for (const p of pack.provenance) {
    rows.push([p.set_id, p.source_name, p.source_url ?? "", p.licence, p.source_date, String(p.tier), p.label ?? "", String(p.example)]);
  }
  return csv(rows);
}

function md(text: string | number): string {
  return String(text).replace(/([\\|*_`<>[\]])/g, "\\$1").replace(/\s+/g, " ");
}

function mdTable(header: readonly string[], rows: ReadonlyArray<readonly string[]>): string[] {
  return [`| ${header.join(" | ")} |`, `| ${header.map(() => "---").join(" | ")} |`, ...rows.map((row) => `| ${row.join(" | ")} |`)];
}

export function regionLabel(lang: Lang, code: string): string {
  return code === "ALL" || code === UNKNOWN ? t(lang, `rp.region.${code}`) : code;
}

export function periodLabel(lang: Lang, period: string): string {
  return period === UNKNOWN ? t(lang, "rp.unknown") : period;
}

export function topicLabel(lang: Lang, topic: string): string {
  return t(lang, `rp.topic.${topic}` as MessageKey);
}

function markdownTable(lang: Lang, table: ProtectedTable, minimum: number): string[] {
  const tr = (key: MessageKey, vars: Vars = {}) => t(lang, key, vars);
  const title = `### ${md(tr("rp.table.caption", { kind: tr(`rp.kind.${table.kind}`), period: periodLabel(lang, table.period) }))}`;
  if (table.state === "withheld") return [title, "", md(tr("rp.table.withheld", { k: minimum })), ""];
  const header = [tr("rp.table.region"), ...table.topics.map((topic) => topicLabel(lang, topic)), tr("rp.table.total")].map(md);
  const rows = table.rows.map((row) => [
    md(regionLabel(lang, row.region_code)),
    ...row.cells.map((cell) => (cell.state === "published" ? String(cell.count) : md(tr("rp.table.suppressed")))),
    String(row.total),
  ]);
  rows.push([md(tr("rp.table.total")), ...table.column_totals.map(String), String(table.total)]);
  const notes: string[] = [];
  if (table.rolled_up_rows.length > 0) {
    notes.push(md(tr("rp.table.rolledUp", { rows: table.rolled_up_rows.map((code) => regionLabel(lang, code)).join(", ") })), "");
  }
  if (table.combined_topics.length > 0) {
    notes.push(md(tr("rp.table.combined", { topics: table.combined_topics.map((topic) => topicLabel(lang, topic)).join(", ") })), "");
  }
  return [title, "", ...mdTable(header, rows), "", ...notes];
}

/** The read-me that travels with the numbers, in one language. */
export function packMarkdown(pack: ReportEvidencePack, lang: Lang): string {
  const tr = (key: MessageKey, vars: Vars = {}) => t(lang, key, vars);
  const k = pack.suppression.minimum_cell_size;
  const counts = pack.suppression.counts;
  const bullets = (lines: readonly string[]) => lines.map((line) => `- ${md(line)}`);
  const lines: string[] = [`# ${md(tr("rp.title"))}`, ""];
  if (pack.demonstration) lines.push(`**${md(tr("rp.demo"))}**`, "");
  lines.push(
    `- ${md(tr("rp.asOf", { date: pack.as_of }))}`,
    `- ${md(tr("rp.grain", { grain: tr(`rp.grain.${pack.period_grain}`) }))}`,
    `- ${md(tr("rp.fingerprint", { value: pack.fingerprint }))}`,
    "",
    `## ${md(tr("rp.heading.limits"))}`,
    "",
    ...bullets(pack.limits[lang]),
    "",
    `## ${md(tr("rp.heading.method"))}`,
    "",
    ...bullets(pack.methodology[lang]),
    "",
    `## ${md(tr("rp.heading.consent"))}`,
    "",
    md(tr("rp.consent.line", { purpose: pack.consent.required_purpose.purpose_id, version: pack.consent.required_purpose.purpose_version })),
    "",
    `## ${md(tr("rp.heading.rules"))}`,
    "",
    ...bullets(pack.suppression.rules.map((rule) => rule[lang])),
    "",
    `## ${md(tr("rp.heading.counts"))}`,
    "",
    ...bullets([
      tr("rp.count.tablesPublished", { n: counts.tables_published }),
      tr("rp.count.tablesWithheld", { n: counts.tables_withheld }),
      tr("rp.count.cellsPublished", { n: counts.cells_published }),
      tr("rp.count.cellsSuppressed", { n: counts.cells_suppressed }),
      tr("rp.count.rowsRolledUp", { n: counts.rows_rolled_up }),
      tr("rp.count.topicsCombined", { n: counts.topics_combined }),
      tr("rp.count.reports", { n: pack.reports_in_published_tables }),
    ]),
    "",
    `## ${md(tr("rp.heading.provenance"))}`,
    "",
    ...mdTable(
      ["rp.prov.set", "rp.prov.source", "rp.prov.link", "rp.prov.licence", "rp.prov.date", "rp.prov.tier", "rp.prov.label", "rp.prov.example"].map((key) => md(tr(key as MessageKey))),
      pack.provenance.map((p) => [
        md(p.set_id),
        md(p.source_name),
        p.source_url === null ? md(tr("rp.prov.none")) : md(p.source_url),
        md(p.licence),
        p.source_date === UNKNOWN ? md(tr("rp.unknown")) : p.source_date,
        md(tr(`rp.tier.${p.tier}`)),
        p.label === null ? md(tr("rp.prov.none")) : md(tr(`rp.label.${p.label}`)),
        md(tr(p.example ? "rp.yes" : "rp.no")),
      ]),
    ),
    "",
    `## ${md(tr("rp.heading.tables"))}`,
    "",
    ...pack.tables.flatMap((table) => markdownTable(lang, table, k)),
  );
  return `${lines.join("\n").replace(/\n+$/, "")}\n`;
}

export function serialiseReportPack(pack: ReportEvidencePack): string {
  return `${JSON.stringify(pack, null, 2)}\n`;
}

/** The files of a pack, in a fixed order, named after the as-of date. */
export function packFiles(pack: ReportEvidencePack): PackFile[] {
  const stem = `advocacy-report-pack-${pack.as_of}`;
  return [
    { name: `${stem}.json`, mime: "application/json", content: serialiseReportPack(pack) },
    { name: `${stem}-tables.csv`, mime: "text/csv", content: tablesCsv(pack) },
    { name: `${stem}-provenance.csv`, mime: "text/csv", content: provenanceCsv(pack) },
    ...LANGS.map((lang) => ({ name: `${stem}.${lang}.md`, mime: "text/markdown", content: packMarkdown(pack, lang) })),
  ];
}

