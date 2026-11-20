import type { Language } from "./regionDownload";
import {
  serializeContingencyPlan, summaryContingency, type ContingencyPlan, type ContingencyStep,
} from "./contingencyPlan";
import {
  CONTINGENCY_COPY, contingencyFollowupText, contingencyKindText, contingencySignalText,
} from "./contingencyCopy";

export type ContingencyFormat = "json" | "txt";
/** A source date is only a publication note, never proof about a physical site. */
export interface ContingencyReport {
  readonly schema: "offline-contingency-report-v1";
  readonly regionId: string;
  readonly exportedAt: string;
  readonly status: "UNKNOWN";
  readonly counts: ReturnType<typeof summaryContingency>;
  readonly steps: readonly ContingencyStep[];
}
function escapeControl(text: string): string {
  return [...text].map((char) => {
    const value = char.charCodeAt(0);
    if (value < 32 && char !== "\n" && char !== "\t") return " ";
    if (value === 127 || value >= 0x202a && value <= 0x202e || value >= 0x2066 && value <= 0x2069) return " ";
    return char;
  }).join("").replace(/[ \t]+/gu, " ").replace(/\n[ \t]+/gu, "\n");
}
function clean(text: string): string {
  return escapeControl(text).replace(/\r/gu, " ").trim();
}
export function contingencyFilename(regionId: string, format: ContingencyFormat): string {
  const slug = regionId.normalize("NFKD").toLocaleLowerCase()
    .replace(/[^a-z0-9]+/gu, "-").replace(/^-+|-+$/gu, "").slice(0, 50) || "region";
  return `offline-contingency-${slug}.${format}`;
}
export function createContingencyReport(plan: ContingencyPlan, at: string): ContingencyReport {
  // Use the same schema check as import/export to reject malformed history.
  serializeContingencyPlan(plan);
  if (Number.isNaN(Date.parse(at)) || new Date(at).toISOString() !== at) throw new TypeError("Invalid date");
  return { schema: "offline-contingency-report-v1", regionId: plan.regionId, exportedAt: at,
    status: "UNKNOWN", counts: summaryContingency(plan), steps: plan.steps.map((step) => ({ ...step })) };
}
export function contingencyReportText(plan: ContingencyPlan, language: Language, at: string): string {
  const c = CONTINGENCY_COPY[language];
  const fr = language === "fr";
  const colon = fr ? "\u00a0:" : ":";
  const report = createContingencyReport(plan, at);
  const lines: string[] = [c.title, c.caution, "", `${fr ? "Région" : "Region"}${colon} ${clean(report.regionId)}`,
    `${fr ? "Date du rapport" : "Report date"}${colon} ${report.exportedAt}`,
    `${fr ? "État physique" : "Physical condition"}${colon} UNKNOWN`,
    `${c.count}${colon} ${report.counts.listed}`, `${c.openCount}${colon} ${report.counts.open}`,
    `${c.unknownCount}${colon} ${report.counts.unknownSignals}`,
    `${c.issueCount}${colon} ${report.counts.issues}`, ""];
  for (const [index, step] of report.steps.entries()) {
    lines.push(`${index + 1}. ${clean(step.title)} (${contingencyKindText(step.kind, language)})`);
    lines.push(`${c.question}${colon} ${clean(step.question)}`);
    lines.push(`${c.alternative}${colon} ${clean(step.alternative) || "UNKNOWN"}`);
    lines.push(`${c.note}${colon} ${clean(step.note) || "UNKNOWN"}`);
    lines.push(`${c.signal}${colon} ${contingencySignalText(step.signal, language)}`);
    lines.push(`${c.followUp}${colon} ${contingencyFollowupText(step.followUp, language)}`);
    lines.push(`${c.evidence}${colon} ${step.source.state}`);
    lines.push(`${c.sourceName}${colon} ${clean(step.source.source)}`);
    lines.push(`${c.licence}${colon} ${clean(step.source.licence)}`);
    lines.push(`${c.date}${colon} ${clean(step.source.date)}`);
    lines.push(`${c.bytes}${colon} ${step.source.expectedBytes ?? "UNKNOWN"}`);
    lines.push("");
  }
  lines.push(c.privacy);
  return lines.join("\n") + "\n";
}
export function contingencyReportJson(plan: ContingencyPlan, at: string): string {
  const report = createContingencyReport(plan, at);
  const text = JSON.stringify(report, null, 2) + "\n";
  if (new TextEncoder().encode(text).length > 262144) throw new RangeError("Report too large");
  return text;
}
/** Only an explicit button press should reach this helper. */
export function saveContingencyFile(plan: ContingencyPlan, language: Language,
  format: ContingencyFormat, doc: Document, at: string): void {
  const content = format === "json" ? serializeContingencyPlan(plan) : contingencyReportText(plan, language, at);
  const blob = new Blob([content], { type: format === "json" ? "application/json;charset=utf-8" : "text/plain;charset=utf-8" });
  const uri = URL.createObjectURL(blob);
  const link = doc.createElement("a");
  link.href = uri;
  link.download = contingencyFilename(plan.regionId, format);
  doc.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    URL.revokeObjectURL(uri);
  }
}
