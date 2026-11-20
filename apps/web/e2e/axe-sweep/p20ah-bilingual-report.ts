/** Accessible, deterministic EN/FR descriptions for offline audit results. */
import {
  canonical, dateIsValid, evidenceDiagnostics, handoffDiagnostics, valueKnown,
  type Diagnostic, type EvidenceItem, type Handoff, type Locale,
} from "./p20ah-handoff-policy.ts";
export type HeadingKey = "handoff" | "source" | "licence" | "retrieved" | "tier" | "value" |
  "unknown" | "warnings" | "items" | "connection" | "review" | "reason" | "none" | "status" | "continue";
export const HEADINGS: Readonly<Record<Locale, Readonly<Record<HeadingKey, string>>>> = {
  en: {
    handoff: "Take-along evidence", source: "Source", licence: "Licence", retrieved: "Retrieved on",
    tier: "Evidence tier", value: "Value", unknown: "UNKNOWN", warnings: "Issues to review",
    items: "Records", connection: "Connection", review: "Review before using", reason: "Reason",
    none: "No records", status: "Status", continue: "Continue offline",
  },
  fr: {
    handoff: "Dossier à emporter", source: "Source", licence: "Licence", retrieved: "Date de consultation",
    tier: "Niveau de preuve", value: "Valeur", unknown: "UNKNOWN", warnings: "Points à examiner",
    items: "Fiches", connection: "Connexion", review: "À examiner avant utilisation", reason: "Motif",
    none: "Aucune fiche", status: "État", continue: "Continuer hors ligne",
  },
};
export const DIAGNOSTIC_COPY: Readonly<Record<Locale, Readonly<Record<string, string>>>> = {
  en: {
    "evidence-id-empty": "Record identifier missing", "evidence-label-unknown": "Record label UNKNOWN",
    "evidence-known-without-value": "Value UNKNOWN; do not describe it as known",
    "evidence-known-without-provenance": "Source details incomplete",
    "evidence-source-unknown": "Source UNKNOWN", "evidence-licence-unknown": "Licence UNKNOWN",
    "evidence-date-unknown": "Retrieval date UNKNOWN", "evidence-tier-unknown": "Evidence tier UNKNOWN",
    "handoff-id-empty": "Packet identifier missing", "handoff-schema": "Unsupported packet format",
    "handoff-route": "Origin path is unsafe", "handoff-created-unknown": "Creation date UNKNOWN",
    "handoff-origin-unknown": "Origin UNKNOWN", "handoff-purpose-unknown": "Purpose UNKNOWN",
    "handoff-redaction-unconfirmed": "Review information before sharing",
    "handoff-empty": "No records in this packet", "handoff-duplicate-record": "Repeated record identifier",
    "screen-route-unsafe": "Screen path is unsafe", "screen-heading-missing": "Screen heading missing",
    "screen-loading-offline": "Loading while offline", "screen-ready-without-records": "Ready state has no records",
    "screen-duplicate-evidence": "Repeated evidence identifier",
    "locale-did-not-change": "Language was not changed", "locale-lost-route": "Language change lost the route",
    "locale-changed-unexpectedly": "Language changed unexpectedly",
    "route-changed-unexpectedly": "Route changed unexpectedly", "disconnect-not-observed": "Offline state was not observed",
    "reconnect-not-observed": "Online state was not observed", "retry-without-error": "Retry had no error state",
    "focus-not-preserved": "Keyboard focus changed", "record-lost": "A record was lost",
    "record-source-drift": "Evidence source details changed", "record-value-drift": "Evidence value changed",
    "export-missing-packet": "No export packet", "export-locale-mismatch": "Export language mismatch",
    "export-route-mismatch": "Export route mismatch", "trace-disconnected": "Journey trace is disconnected",
  },
  fr: {
    "evidence-id-empty": "Identifiant de fiche absent", "evidence-label-unknown": "Libellé de fiche UNKNOWN",
    "evidence-known-without-value": "Valeur UNKNOWN ; ne pas la présenter comme connue",
    "evidence-known-without-provenance": "Renseignements sur la source incomplets",
    "evidence-source-unknown": "Source UNKNOWN", "evidence-licence-unknown": "Licence UNKNOWN",
    "evidence-date-unknown": "Date de consultation UNKNOWN", "evidence-tier-unknown": "Niveau de preuve UNKNOWN",
    "handoff-id-empty": "Identifiant de dossier absent", "handoff-schema": "Format de dossier non pris en charge",
    "handoff-route": "Adresse d’origine non sûre", "handoff-created-unknown": "Date de création UNKNOWN",
    "handoff-origin-unknown": "Origine UNKNOWN", "handoff-purpose-unknown": "Objet UNKNOWN",
    "handoff-redaction-unconfirmed": "Examiner les renseignements avant le partage",
    "handoff-empty": "Aucune fiche dans ce dossier", "handoff-duplicate-record": "Identifiant de fiche répété",
    "screen-route-unsafe": "Adresse de page non sûre", "screen-heading-missing": "Titre de page absent",
    "screen-loading-offline": "Chargement pendant la déconnexion", "screen-ready-without-records": "État prêt sans fiche",
    "screen-duplicate-evidence": "Identifiant de preuve répété",
    "locale-did-not-change": "La langue n’a pas changé", "locale-lost-route": "Le changement de langue a perdu la page",
    "locale-changed-unexpectedly": "La langue a changé sans demande",
    "route-changed-unexpectedly": "La page a changé sans demande", "disconnect-not-observed": "État hors ligne non observé",
    "reconnect-not-observed": "Connexion non observée", "retry-without-error": "Réessai sans état d’erreur",
    "focus-not-preserved": "Le focus du clavier a changé", "record-lost": "Une fiche a disparu",
    "record-source-drift": "Les détails de la source ont changé", "record-value-drift": "La valeur de preuve a changé",
    "export-missing-packet": "Dossier d’export absent", "export-locale-mismatch": "Langue d’export différente",
    "export-route-mismatch": "Page d’export différente", "trace-disconnected": "Séquence du parcours interrompue",
  },
};
export function heading(locale: Locale, key: HeadingKey): string { return HEADINGS[locale][key]; }
export function diagnosticLabel(locale: Locale, diagnostic: Diagnostic): string {
  return DIAGNOSTIC_COPY[locale][diagnostic.code] ?? "UNKNOWN";
}
export function frenchPunctuationIssues(text: string): string[] {
  const issues: string[] = [];
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (c === "'") issues.push(`apostrophe@${i}`);
    if (c === ":" && i > 0 && text[i - 1] !== "\u00a0") issues.push(`colon@${i}`);
    if ([";", "!", "?"].includes(c ?? "") && i > 0 && text[i - 1] !== "\u202f") issues.push(`thin-space@${i}`);
    if (c === "«" && text[i + 1] !== "\u202f") issues.push(`open-quote@${i}`);
    if (c === "»" && text[i - 1] !== "\u202f") issues.push(`close-quote@${i}`);
  }
  return issues;
}
export function completeCopyIssues(): string[] {
  const issues: string[] = [];
  const en = Object.keys(HEADINGS.en).sort();
  const fr = Object.keys(HEADINGS.fr).sort();
  if (JSON.stringify(en) !== JSON.stringify(fr)) issues.push("heading-key-mismatch");
  const diagnosticKeys = Object.keys(DIAGNOSTIC_COPY.en).sort();
  if (JSON.stringify(diagnosticKeys) !== JSON.stringify(Object.keys(DIAGNOSTIC_COPY.fr).sort())) {
    issues.push("diagnostic-key-mismatch");
  }
  for (const [key, value] of Object.entries(HEADINGS.fr)) {
    if (!value.trim()) issues.push(`heading-blank:${key}`);
    issues.push(...frenchPunctuationIssues(value).map((entry) => `heading:${key}:${entry}`));
  }
  for (const [key, value] of Object.entries(DIAGNOSTIC_COPY.fr)) {
    if (!value.trim()) issues.push(`diagnostic-blank:${key}`);
    issues.push(...frenchPunctuationIssues(value).map((entry) => `diagnostic:${key}:${entry}`));
  }
  return issues;
}
export function safeCsvCell(value: string): string {
  const normalized = canonical(value);
  const protectedCell = /^[\s]*[=+@\-\t\r]/.test(normalized) ? `'${normalized}` : normalized;
  return `"${protectedCell.replaceAll('"', '""')}"`;
}
export function itemRows(item: EvidenceItem, locale: Locale): readonly (readonly string[])[] {
  return [
    [heading(locale, "items"), canonical(item.id)],
    [heading(locale, "value"), valueKnown(item) ? canonical(item.value) : "UNKNOWN"],
    [heading(locale, "source"), canonical(item.provenance.source)],
    [heading(locale, "licence"), canonical(item.provenance.licence)],
    [heading(locale, "retrieved"), dateIsValid(item.provenance.retrievedOn) ? item.provenance.retrievedOn ?? "UNKNOWN" : "UNKNOWN"],
    [heading(locale, "tier"), item.provenance.tier],
  ];
}
export function packetCsv(packet: Handoff): string {
  const rows: string[][] = [[heading(packet.locale, "items"), heading(packet.locale, "value"), heading(packet.locale, "source"),
    heading(packet.locale, "licence"), heading(packet.locale, "retrieved"), heading(packet.locale, "tier")]];
  for (const item of packet.records) rows.push([
    canonical(item.id), valueKnown(item) ? canonical(item.value) : "UNKNOWN",
    canonical(item.provenance.source), canonical(item.provenance.licence),
    dateIsValid(item.provenance.retrievedOn) ? item.provenance.retrievedOn ?? "UNKNOWN" : "UNKNOWN",
    item.provenance.tier,
  ]);
  return `\uFEFF${rows.map((row) => row.map(safeCsvCell).join(",")).join("\r\n")}\r\n`;
}
export function packetPlainText(packet: Handoff): string {
  const lines = [heading(packet.locale, "handoff"), `${heading(packet.locale, "connection")}${packet.locale === "fr" ? "\u00a0:" : ":"} ${packet.connection}`];
  for (const item of packet.records) {
    lines.push("", canonical(item.label), ...itemRows(item, packet.locale).map(([key, value]) => `${key}${packet.locale === "fr" ? "\u00a0:" : ":"} ${value}`));
  }
  const findings = handoffDiagnostics(packet);
  if (findings.length > 0) lines.push("", heading(packet.locale, "warnings"),
    ...findings.map((entry) => `${diagnosticLabel(packet.locale, entry)}${packet.locale === "fr" ? "\u00a0:" : ":"} ${entry.field}`));
  return lines.join("\n");
}
export function packetSummary(packet: Handoff): Readonly<{ count: number; unknown: number; blocking: number; warnings: number }> {
  const findings = handoffDiagnostics(packet);
  return {
    count: packet.records.length,
    unknown: packet.records.filter((item) => !valueKnown(item)).length,
    blocking: findings.filter((item) => item.severity === "block").length,
    warnings: findings.filter((item) => item.severity === "warning").length,
  };
}
export function recordSummary(item: EvidenceItem, locale: Locale): string {
  const findings = evidenceDiagnostics(item);
  const value = valueKnown(item) ? canonical(item.value) : "UNKNOWN";
  if (findings.length === 0) return `${canonical(item.label)}${locale === "fr" ? "\u00a0:" : ":"} ${value}`;
  return `${canonical(item.label)}${locale === "fr" ? "\u00a0:" : ":"} ${value} (${findings.map((finding) => diagnosticLabel(locale, finding)).join(locale === "fr" ? "\u202f; " : "; ")})`;
}
