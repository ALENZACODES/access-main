/**
 * P20W: controls whether route-level evidence can be described as known.
 * These policies do not describe the availability, suitability or accessibility
 * of a physical place. Unreadable or absent data is always UNKNOWN.
 */
export type Locale = "en" | "fr";
export type Knowledge = "KNOWN" | "UNKNOWN";
export type EvidenceField = "source" | "licence" | "date" | "tier";
export type EvidenceTier = "0" | "1" | "2" | "3" | "4" | "E" | "UNKNOWN";

export interface EvidenceValue {
  readonly text: string | null;
  readonly sourceLanguage: string | null;
  readonly markedLanguage: string | null;
}

export interface EvidenceRow {
  readonly id: string;
  readonly label: string;
  readonly description: string | null;
  readonly fields: Readonly<Partial<Record<EvidenceField, EvidenceValue>>>;
  readonly visible: boolean;
  readonly route: string;
  readonly locale: Locale;
  readonly localOnly: boolean;
}

export interface EvidenceFinding {
  readonly code: string;
  readonly route: string;
  readonly id: string;
  readonly field: EvidenceField | null;
  readonly detail: string;
}

export interface EvidenceResult {
  readonly id: string;
  readonly status: Knowledge;
  readonly findings: readonly EvidenceFinding[];
  readonly unknownFields: readonly EvidenceField[];
  readonly knownFields: readonly EvidenceField[];
}

export interface EvidenceTotals {
  readonly total: number;
  readonly known: number;
  readonly unknown: number;
  readonly findings: readonly EvidenceFinding[];
}

export interface EvidenceTransition {
  readonly before: EvidenceRow;
  readonly after: EvidenceRow;
  readonly offline: boolean;
  readonly languageChanged: boolean;
}

export interface TransitionFinding {
  readonly code: string;
  readonly id: string;
  readonly route: string;
  readonly detail: string;
}

const FIELDS: readonly EvidenceField[] = ["source", "licence", "date", "tier"];
const TIER_VALUES: ReadonlySet<string> = new Set(["0", "1", "2", "3", "4", "E"]);
const ABSENT: ReadonlySet<string> = new Set([
  "", "unknown", "not known", "not available", "not provided", "inconnu", "inconnue",
  "non fourni", "non fournie", "non disponible", "n/a", "s.o.", "—", "–", "-",
]);
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function fields(): readonly EvidenceField[] { return FIELDS; }

export function compact(value: string | null | undefined): string {
  return (value ?? "").normalize("NFC").replace(/\s+/g, " ").trim();
}

export function unknownText(text: string | null | undefined): boolean {
  return ABSENT.has(compact(text).toLocaleLowerCase());
}

export function dateParts(input: string): { year: number; month: number; day: number } | null {
  const match = DATE.exec(input.trim());
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (year < 1 || month < 1 || month > 12 || day < 1) return null;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const maxDays = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  if (maxDays === undefined || day > maxDays) return null;
  return { year, month, day };
}

export function dateKey(parts: { year: number; month: number; day: number }): number {
  return parts.year * 10000 + parts.month * 100 + parts.day;
}

export function isFutureEvidence(date: string, referenceDate: string): boolean | null {
  const supplied = dateParts(date);
  const reference = dateParts(referenceDate);
  if (!supplied || !reference) return null;
  return dateKey(supplied) > dateKey(reference);
}

export function evidenceTier(value: string | null): EvidenceTier {
  const normalized = compact(value).toUpperCase();
  return TIER_VALUES.has(normalized) ? normalized as EvidenceTier : "UNKNOWN";
}

export function effectiveLanguage(value: EvidenceValue, documentLanguage: Locale): string {
  const marked = compact(value.markedLanguage);
  if (marked) return marked;
  const inherited = compact(value.sourceLanguage);
  return inherited || documentLanguage;
}

export function isLanguageTag(value: string): boolean {
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})*$/i.test(value);
}

/** The first subtag is enough to compare regional English and French. */
export function primaryLanguage(tag: string): Locale | null {
  const normalized = tag.trim();
  if (!isLanguageTag(normalized)) return null;
  const base = normalized.split("-")[0]?.toLowerCase();
  return base === "en" || base === "fr" ? base : null;
}

/** No source fact may be inferred from a displayed label or heading. */
export function knowledgeOfValue(value: EvidenceValue | undefined): Knowledge {
  if (!value || unknownText(value.text)) return "UNKNOWN";
  return "KNOWN";
}

function finding(row: EvidenceRow, code: string, field: EvidenceField | null, detail: string): EvidenceFinding {
  return { code, route: row.route, id: row.id, field, detail };
}

export function auditEvidenceRow(row: EvidenceRow, referenceDate: string): EvidenceResult {
  const findings: EvidenceFinding[] = [];
  const unknownFields: EvidenceField[] = [];
  const knownFields: EvidenceField[] = [];
  if (!row.visible) {
    return { id: row.id, status: "UNKNOWN", findings, unknownFields: [...FIELDS], knownFields };
  }
  if (unknownText(row.id)) findings.push(finding(row, "record-id", null, "Visible record has no stable id"));
  if (unknownText(row.label)) findings.push(finding(row, "record-label", null, "Visible record has no accessible title"));
  for (const field of FIELDS) {
    const value = row.fields[field];
    if (knowledgeOfValue(value) === "UNKNOWN") {
      unknownFields.push(field);
      continue;
    }
    knownFields.push(field);
    const marked = compact(value?.markedLanguage);
    if (marked && !isLanguageTag(marked)) {
      findings.push(finding(row, "metadata-language-invalid", field, marked));
    }
  }
  const date = row.fields.date?.text;
  if (!dateParts(referenceDate)) {
    findings.push(finding(row, "reference-date-unknown", "date", "Observation date cannot be compared to an unknown reference"));
  }
  if (!unknownText(date)) {
    if (!dateParts(date ?? "")) {
      findings.push(finding(row, "metadata-date-invalid", "date", compact(date)));
    } else if (isFutureEvidence(date ?? "", referenceDate) === true) {
      findings.push(finding(row, "metadata-date-future", "date", compact(date)));
    }
  }
  const tier = row.fields.tier?.text ?? null;
  if (!unknownText(tier) && evidenceTier(tier) === "UNKNOWN") {
    findings.push(finding(row, "metadata-tier-invalid", "tier", compact(tier)));
  }
  const licence = row.fields.licence?.text;
  if (!unknownText(licence) && compact(licence).length < 3) {
    findings.push(finding(row, "metadata-licence-short", "licence", "Licence is not a descriptive identifier"));
  }
  const source = row.fields.source?.text;
  if (!unknownText(source) && compact(source).length < 3) {
    findings.push(finding(row, "metadata-source-short", "source", "Source is not a descriptive identifier"));
  }
  return {
    id: row.id,
    status: findings.length === 0 && unknownFields.length === 0 ? "KNOWN" : "UNKNOWN",
    findings,
    unknownFields,
    knownFields,
  };
}

export function auditEvidenceList(rows: readonly EvidenceRow[], referenceDate: string): EvidenceTotals {
  const visible = rows.filter((row) => row.visible);
  const ids = new Set<string>();
  const findings: EvidenceFinding[] = [];
  let known = 0;
  for (const row of visible) {
    const record = auditEvidenceRow(row, referenceDate);
    findings.push(...record.findings);
    if (ids.has(row.id)) findings.push(finding(row, "record-duplicate", null, "Duplicate visible record id"));
    ids.add(row.id);
    if (record.status === "KNOWN") known += 1;
  }
  // Duplicate IDs invalidate list uniqueness even when the field values appear complete.
  if (findings.some((item) => item.code === "record-duplicate")) known = 0;
  return { total: visible.length, known, unknown: visible.length - known, findings };
}

export function metadataSignature(row: EvidenceRow): Record<EvidenceField, string | null> {
  return {
    source: unknownText(row.fields.source?.text) ? null : compact(row.fields.source?.text),
    licence: unknownText(row.fields.licence?.text) ? null : compact(row.fields.licence?.text),
    date: unknownText(row.fields.date?.text) ? null : compact(row.fields.date?.text),
    tier: unknownText(row.fields.tier?.text) ? null : compact(row.fields.tier?.text),
  };
}

export function transitionEvidenceFindings(transition: EvidenceTransition): TransitionFinding[] {
  const problems: TransitionFinding[] = [];
  const { before, after } = transition;
  const push = (code: string, detail: string) => problems.push({ code, detail, id: before.id, route: before.route });
  if (before.id !== after.id) push("record-replaced", "Evidence identifier changed between observations");
  if (before.route !== after.route) push("record-route", "Evidence route changed between observations");
  if (transition.languageChanged && before.locale === after.locale) push("locale-stale", "Locale did not change");
  if (!transition.languageChanged && before.locale !== after.locale) push("locale-unexpected", "Locale changed without a user transition");
  const a = metadataSignature(before);
  const b = metadataSignature(after);
  for (const field of FIELDS) {
    const prior = a[field];
    const later = b[field];
    if (prior === null || later === null) continue;
    // Localized source labels may differ, but licence codes and dates/tiers
    // cannot silently change. Changing language does not create new evidence.
    if (prior !== later && (field !== "source" || !transition.languageChanged)) {
      push("record-metadata-changed", `${field}: conflicting displayed values`);
    }
  }
  if (transition.offline && before.localOnly && !after.localOnly) {
    push("record-storage-claim", "Local-only status changed after connectivity loss");
  }
  return problems;
}

export function mergeEvidenceConservatively(a: EvidenceRow, b: EvidenceRow): EvidenceRow | null {
  if (a.id !== b.id || a.route !== b.route) return null;
  const result: Partial<Record<EvidenceField, EvidenceValue>> = {};
  for (const field of FIELDS) {
    const left = a.fields[field];
    const right = b.fields[field];
    if (knowledgeOfValue(left) === "UNKNOWN" || knowledgeOfValue(right) === "UNKNOWN") {
      result[field] = { text: "UNKNOWN", sourceLanguage: null, markedLanguage: null };
      continue;
    }
    if (compact(left?.text) !== compact(right?.text)) {
      result[field] = { text: "UNKNOWN", sourceLanguage: null, markedLanguage: null };
      continue;
    }
    result[field] = left;
  }
  return {
    ...a,
    fields: result,
    visible: a.visible && b.visible,
    localOnly: a.localOnly && b.localOnly,
  };
}

export function evidenceDigest(rows: readonly EvidenceRow[]): string {
  const counts = { all: rows.length, visible: rows.filter((row) => row.visible).length };
  const uncertain = rows.filter((row) => FIELDS.some((field) => unknownText(row.fields[field]?.text))).length;
  return `records=${counts.all}; visible=${counts.visible}; uncertain=${uncertain}`;
}

export function formatEvidenceFindings(findings: readonly EvidenceFinding[], limit = 20): string {
  if (!Number.isInteger(limit) || limit < 1) throw new RangeError("limit must be positive");
  const unique = [...new Set(findings.map((item) => `${item.code} ${item.route} ${item.id} ${item.field ?? "record"}: ${item.detail}`))];
  return [...unique.slice(0, limit), ...(unique.length > limit ? [`${unique.length - limit} more`] : [])].join("\n");
}

export function countUnknownByField(rows: readonly EvidenceRow[]): Record<EvidenceField, number> {
  const count: Record<EvidenceField, number> = { source: 0, licence: 0, date: 0, tier: 0 };
  for (const row of rows) {
    if (!row.visible) continue;
    for (const field of FIELDS) if (unknownText(row.fields[field]?.text)) count[field] += 1;
  }
  return count;
}

export function hasEvidenceForAllFields(row: EvidenceRow): boolean {
  return FIELDS.every((field) => knowledgeOfValue(row.fields[field]) === "KNOWN");
}

export function conservativeLocaleComparison(a: EvidenceRow, b: EvidenceRow): Knowledge {
  if (a.id !== b.id || a.route !== b.route) return "UNKNOWN";
  const first = metadataSignature(a);
  const second = metadataSignature(b);
  for (const field of FIELDS) {
    if (first[field] === null || second[field] === null) return "UNKNOWN";
    if (field !== "source" && first[field] !== second[field]) return "UNKNOWN";
  }
  return "KNOWN";
}
