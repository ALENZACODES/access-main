/**
 * Read-only quality contracts for accessibility evidence rendered by the shell.
 * Nothing here infers that a place, route or facility is accessible.
 */
export type Locale = "en" | "fr";
export type Knowledge = "KNOWN" | "UNKNOWN";
export type EvidenceField = "source" | "licence" | "date" | "tier";

export interface EvidenceCell {
  readonly term: string;
  readonly value: string;
}

export interface EvidenceCard {
  readonly location: string;
  readonly name: string;
  readonly descriptionLists: readonly (readonly EvidenceCell[])[];
  readonly visible: boolean;
}

export interface EvidenceFinding {
  readonly location: string;
  readonly code: string;
  readonly detail: string;
}

export interface EvidenceAudit {
  readonly location: string;
  readonly total: number;
  readonly known: number;
  readonly unknown: number;
  readonly findings: readonly EvidenceFinding[];
}

const UNKNOWN_VALUES = new Set([
  "unknown", "inconnu", "inconnue", "non connu", "non connue", "non fourni", "non fournie", "not provided",
  "not known", "not available", "non disponible", "—", "–", "-", "n/a", "s.o.",
]);

const OPEN_LICENCES = [
  /\bcc0(?:-1\.0)?\b/i,
  /\bcc[- ]by(?:-4\.0)?\b/i,
  /\bodb[lL](?:-1\.0)?\b/i,
  /\bopen government licence\b/i,
  /\blicence du gouvernement ouvert\b/i,
  /\bopen data commons\b/i,
  /\bogl[- ](?:canada|ontario|toronto)\b/i,
] as const;

const TOKEN = /[\p{L}\p{N}]+/gu;
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function normalize(value: string): string {
  return value.normalize("NFC").trim().replace(/\s+/g, " ").toLocaleLowerCase();
}

/** The word UNKNOWN is a data state, not an invitation to fill missing values. */
export function isUnknown(value: string | null | undefined): boolean {
  if (value == null) return true;
  const normalized = normalize(value);
  return normalized.length === 0 || UNKNOWN_VALUES.has(normalized);
}

export function parseCalendarDate(value: string): boolean {
  const trimmed = value.trim();
  if (!DATE.test(trimmed)) return false;
  const [year, month, day] = trimmed.split("-").map(Number);
  if (year === undefined || month === undefined || day === undefined || year < 1 || month < 1 || month > 12) return false;
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return day > 0 && day <= (days[month - 1] ?? 0);
}

export function isOpenLicence(value: string): boolean {
  return OPEN_LICENCES.some((pattern) => pattern.test(value));
}

export function fieldLabels(locale: Locale): Readonly<Record<EvidenceField, readonly string[]>> {
  return locale === "en"
    ? { source: ["source"], licence: ["licence", "license"], date: ["date", "retrieved", "last checked"], tier: ["tier", "evidence tier"] }
    : { source: ["source"], licence: ["licence"], date: ["date", "récupéré", "récupérée"], tier: ["niveau", "palier", "tier"] };
}

function tokens(value: string): readonly string[] {
  return (normalize(value).match(TOKEN) ?? []).map((part) => part.toLocaleLowerCase());
}

export function matchesFieldLabel(value: string, field: EvidenceField, locale: Locale): boolean {
  const words = tokens(value);
  return fieldLabels(locale)[field].some((candidate) => {
    const part = tokens(candidate);
    return part.length > 0 && part.every((token) => words.includes(token));
  });
}

export type EvidenceValues = Readonly<Record<EvidenceField, string>>;

export function readEvidenceValues(
  list: readonly EvidenceCell[],
  locale: Locale,
): { values: Partial<Record<EvidenceField, string>>; duplicated: readonly EvidenceField[] } {
  const values: Partial<Record<EvidenceField, string>> = {};
  const duplicated: EvidenceField[] = [];
  for (const cell of list) {
    for (const field of ["source", "licence", "date", "tier"] as const) {
      if (!matchesFieldLabel(cell.term, field, locale)) continue;
      if (values[field] !== undefined) duplicated.push(field);
      else values[field] = cell.value.trim();
    }
  }
  return { values, duplicated };
}

function finding(location: string, code: string, detail: string): EvidenceFinding {
  return { location, code, detail };
}

export function auditEvidenceCard(card: EvidenceCard, locale: Locale): {
  readonly knowledge: Knowledge;
  readonly findings: readonly EvidenceFinding[];
} {
  const findings: EvidenceFinding[] = [];
  if (!card.visible) return { knowledge: "UNKNOWN", findings };
  if (!card.name.trim()) findings.push(finding(card.location, "record-name", "The visible record has no label"));
  // Some results (such as unsourced games) deliberately do not represent an
  // accessibility claim. No description list means no positive evidence claim.
  if (card.descriptionLists.length === 0) return { knowledge: "UNKNOWN", findings };
  if (card.descriptionLists.length !== 1) {
    findings.push(finding(card.location, "evidence-lists", `Expected one metadata list, got ${card.descriptionLists.length}`));
  }
  const { values, duplicated } = readEvidenceValues(card.descriptionLists[0] ?? [], locale);
  for (const field of duplicated) findings.push(finding(card.location, "duplicate-field", field));
  for (const field of ["source", "licence", "date", "tier"] as const) {
    if (values[field] === undefined) findings.push(finding(card.location, "missing-field", field));
  }
  const supplied = [values.source, values.licence, values.date, values.tier];
  if (supplied.some((value) => isUnknown(value))) return { knowledge: "UNKNOWN", findings };
  if (!parseCalendarDate(values.date!)) findings.push(finding(card.location, "invalid-date", values.date!));
  if (!isOpenLicence(values.licence!)) findings.push(finding(card.location, "non-open-licence", values.licence!));
  return { knowledge: findings.length ? "UNKNOWN" : "KNOWN", findings };
}

export function auditEvidenceCards(cards: readonly EvidenceCard[], locale: Locale, location: string): EvidenceAudit {
  const visible = cards.filter((card) => card.visible);
  let known = 0;
  let unknown = 0;
  const findings: EvidenceFinding[] = [];
  for (const card of visible) {
    const result = auditEvidenceCard(card, locale);
    if (result.knowledge === "KNOWN") known += 1;
    else unknown += 1;
    findings.push(...result.findings);
  }
  return { location, total: visible.length, known, unknown, findings };
}

/** Checks that a set of routes is usable as a test inventory. No magic count. */
export function routeInventoryFindings(routes: readonly string[], required: readonly string[]): EvidenceFinding[] {
  const findings: EvidenceFinding[] = [];
  if (routes.length === 0) findings.push(finding("/", "empty-inventory", "No routes discovered"));
  const seen = new Set<string>();
  for (const route of routes) {
    if (!route.startsWith("/") || route.startsWith("//") || route.includes("?") || route.includes("#") || route.includes(":")) {
      findings.push(finding(route, "invalid-route", route));
    }
    if (seen.has(route)) findings.push(finding(route, "duplicate-route", route));
    seen.add(route);
  }
  for (const path of required) {
    if (!seen.has(path)) findings.push(finding(path, "required-route-absent", path));
  }
  return findings;
}

/** A dated copy may age, but may never be described as a current observation. */
export function evidenceAge(date: string | null, asOf: string): Knowledge {
  if (!date || isUnknown(date) || !parseCalendarDate(date) || !parseCalendarDate(asOf) || date > asOf) return "UNKNOWN";
  return "KNOWN";
}

export function formatFindings(findings: readonly EvidenceFinding[]): string {
  return findings.map((issue) => `${issue.code} @ ${issue.location}: ${issue.detail}`).join("\n");
}
