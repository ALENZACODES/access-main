import { UNKNOWN, valueOrUnknown, provenanceIdentity, evidenceKnown, type EvidenceInventory, type Evidence, type Finding, type Locale, type Provenance } from "./p20an-evidence.ts";
import { type Sequence } from "./p20an-interactions.ts";
/** Portable, explicitly bounded reports; no personal data or claims are introduced. */
export type ReportFormat = "text" | "csv" | "json";
export type ReportLanguageKey = "title" | "route" | "language" | "source" | "licence" | "retrievedOn" | "tier" | "value" | "unknown" | "name" | "findings" | "date" | "step" | "status" | "footer";
export const REPORT_COPY: Readonly<Record<Locale, Readonly<Record<ReportLanguageKey, string>>>> = {
  en: {
    title: "Accessibility evidence review", route: "Page", language: "Language",
    source: "Source", licence: "Licence", retrievedOn: "Retrieved on", tier: "Evidence tier",
    value: "Recorded value", unknown: UNKNOWN, name: "Item", findings: "Audit findings",
    date: "Observation date", step: "Action", status: "Status",
    footer: "Missing information remains UNKNOWN. This report does not establish conditions at a place.",
  },
  fr: {
    title: "Examen des renseignements sur l’accessibilité", route: "Page", language: "Langue",
    source: "Source", licence: "Licence", retrievedOn: "Date de consultation", tier: "Niveau de preuve",
    value: "Valeur consignée", unknown: UNKNOWN, name: "Élément", findings: "Constats de l’examen",
    date: "Date d’observation", step: "Action", status: "État",
    footer: "Les renseignements manquants restent UNKNOWN. Ce rapport ne décrit pas les conditions actuelles d’un lieu.",
  },
};
export interface ReportEntry {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly source: string;
  readonly licence: string;
  readonly retrievedOn: string;
  readonly tier: string;
  readonly sourceIdentity: string;
  readonly complete: boolean;
}
export interface EvidenceReport {
  readonly schema: "p20an-evidence-1";
  readonly route: string;
  readonly locale: Locale;
  readonly observedAt: string;
  readonly entries: readonly ReportEntry[];
  readonly findings: readonly Finding[];
  readonly warning: string;
}
export function reportEntry(record: Evidence): ReportEntry {
  return {
    id: record.id,
    label: valueOrUnknown(record.label),
    value: valueOrUnknown(record.value),
    source: valueOrUnknown(record.provenance.source),
    licence: valueOrUnknown(record.provenance.licence),
    retrievedOn: valueOrUnknown(record.provenance.retrievedOn),
    tier: record.provenance.tier,
    sourceIdentity: provenanceIdentity(record),
    complete: evidenceKnown(record),
  };
}
export function evidenceReport(inventory: EvidenceInventory, findings: readonly Finding[]): EvidenceReport {
  return {
    schema: "p20an-evidence-1",
    route: inventory.route,
    locale: inventory.locale,
    observedAt: valueOrUnknown(inventory.observedAt),
    entries: inventory.records.map(reportEntry),
    findings: [...findings],
    warning: REPORT_COPY[inventory.locale].footer,
  };
}
export function csvEscape(value: string): string {
  // Block formulas in spreadsheet viewers without changing the underlying evidence model.
  const guarded = /^[\s]*[=+@-]/.test(value) ? `'${value}` : value;
  return `"${guarded.replaceAll('"', '""')}"`;
}
export function reportCsv(report: EvidenceReport): string {
  const c = REPORT_COPY[report.locale];
  const columns = [c.name, c.value, c.source, c.licence, c.retrievedOn, c.tier];
  const rows = report.entries.map((entry) => [entry.label, entry.value, entry.source, entry.licence, entry.retrievedOn, entry.tier]);
  const body = [columns, ...rows].map((row) => row.map(csvEscape).join(",")).join("\r\n");
  return `\uFEFF${body}\r\n`;
}
export function reportText(report: EvidenceReport): string {
  const c = REPORT_COPY[report.locale];
  const sep = report.locale === "fr" ? "\u00A0: " : ": ";
  const lines = [c.title, `${c.route}${sep}${report.route}`, `${c.language}${sep}${report.locale}`,
    `${c.date}${sep}${report.observedAt}`, ""];
  for (const entry of report.entries) {
    lines.push(entry.label, `  ${c.value}${sep}${entry.value}`, `  ${c.source}${sep}${entry.source}`,
      `  ${c.licence}${sep}${entry.licence}`, `  ${c.retrievedOn}${sep}${entry.retrievedOn}`, `  ${c.tier}${sep}${entry.tier}`, "");
  }
  if (report.findings.length) {
    lines.push(c.findings);
    for (const finding of report.findings) lines.push(`${finding.code}${sep}${finding.detail}`);
  }
  lines.push(report.warning);
  return lines.join("\n");
}
export function reportJson(report: EvidenceReport): string {
  return JSON.stringify(report, null, 2) + "\n";
}
export function serializeReport(report: EvidenceReport, format: ReportFormat): string {
  switch (format) {
    case "text": return reportText(report);
    case "csv": return reportCsv(report);
    case "json": return reportJson(report);
  }
}
export function recordFromReport(entry: ReportEntry): Evidence {
  const provenance: Provenance = {
    source: entry.source === UNKNOWN ? null : entry.source,
    licence: entry.licence === UNKNOWN ? null : entry.licence,
    retrievedOn: entry.retrievedOn === UNKNOWN ? null : entry.retrievedOn,
    tier: (entry.tier === UNKNOWN ? UNKNOWN : entry.tier) as Provenance["tier"],
  };
  return { id: entry.id, label: entry.label, value: entry.value === UNKNOWN ? null : entry.value,
    provenance, unknownReason: entry.value === UNKNOWN ? "UNKNOWN" : null };
}
export function reportRoundTripProblems(original: EvidenceInventory, report: EvidenceReport): string[] {
  const problems: string[] = [];
  if (original.route !== report.route) problems.push("roundtrip-route");
  if (original.locale !== report.locale) problems.push("roundtrip-locale");
  const entries = new Map(report.entries.map((entry) => [entry.id, entry]));
  for (const record of original.records) {
    const entry = entries.get(record.id);
    if (!entry) { problems.push(`roundtrip-missing:${record.id}`); continue; }
    if (entry.sourceIdentity !== provenanceIdentity(record)) problems.push(`roundtrip-provenance:${record.id}`);
    if (entry.value !== valueOrUnknown(record.value)) problems.push(`roundtrip-value:${record.id}`);
    if (entry.complete !== evidenceKnown(record)) problems.push(`roundtrip-status:${record.id}`);
  }
  return problems;
}
export function frenchTypographyProblems(text: string): string[] {
  const issues: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const character = text[i];
    if (character === "'") issues.push(`apostrophe:${i}`);
    if (character === ":" && i > 0 && text[i - 1] !== "\u00A0") issues.push(`colon:${i}`);
    if ([";", "!", "?"].includes(character ?? "") && i > 0 && text[i - 1] !== "\u202F") issues.push(`thin-space:${i}`);
    if (character === "«" && text[i + 1] !== "\u202F") issues.push(`guillemet-open:${i}`);
    if (character === "»" && text[i - 1] !== "\u202F") issues.push(`guillemet-close:${i}`);
  }
  return issues;
}
export function reportCopyProblems(): string[] {
  const issues: string[] = [];
  const english = Object.keys(REPORT_COPY.en);
  const french = Object.keys(REPORT_COPY.fr);
  for (const key of english) if (!french.includes(key)) issues.push(`missing-fr:${key}`);
  for (const key of french) if (!english.includes(key)) issues.push(`missing-en:${key}`);
  for (const [key, value] of Object.entries(REPORT_COPY.fr)) {
    if (!value.trim()) issues.push(`blank-fr:${key}`);
    issues.push(...frenchTypographyProblems(value).map((v) => `${key}:${v}`));
  }
  for (const [key, value] of Object.entries(REPORT_COPY.en)) if (!value.trim()) issues.push(`blank-en:${key}`);
  return issues;
}
export function sequenceText(sequence: Sequence): string {
  const c = REPORT_COPY[sequence.initial.locale];
  const sep = sequence.initial.locale === "fr" ? "\u00A0: " : ": ";
  const lines = [c.title, `${c.route}${sep}${sequence.initial.route}`];
  for (const [index, step] of sequence.steps.entries()) {
    lines.push(`${c.step} ${index + 1}${sep}${step.kind}`, `${c.status}${sep}${step.after.phase}`,
      `${c.route}${sep}${step.after.route}`);
  }
  lines.push(c.footer);
  return lines.join("\n");
}
export function reportLimit(findings: readonly Finding[], maximum = 100): Finding[] {
  if (!Number.isInteger(maximum) || maximum < 1) throw new RangeError("maximum must be positive");
  const unique = new Set<string>();
  const result: Finding[] = [];
  for (const item of findings) {
    const key = JSON.stringify(item);
    if (unique.has(key)) continue;
    unique.add(key);
    result.push(item);
    if (result.length === maximum) break;
  }
  return result;
}
