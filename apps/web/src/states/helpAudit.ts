/**
 * A check of the saved help numbers for gaps a person maintaining the pack would want to see:
 * parts that are missing, a copy that is old, or one number saved under two entries. It reads only
 * what the pack holds; it cannot say whether a number still works, and it never says it does.
 */
import { csvCell } from "./exportData";
import { readContact } from "./helpContact";
import type { HelpNumber } from "./packHelp";
import type { Locale } from "./stateCopy";
import { t } from "./typography";

export const HELP_STALE_DAYS = 180;

export type HelpFindingCode =
  | "no-number" | "no-name-en" | "no-name-fr" | "no-how-en" | "no-how-fr"
  | "no-source" | "no-source-page" | "no-date" | "old-copy" | "future-date" | "no-tier" | "no-page" | "same-number";

export const HELP_FINDING_CODES: readonly HelpFindingCode[] = [
  "no-number", "no-name-en", "no-name-fr", "no-how-en", "no-how-fr", "no-source", "no-source-page",
  "no-date", "old-copy", "future-date", "no-tier", "no-page", "same-number",
];

export interface HelpFinding {
  id: string;
  code: HelpFindingCode;
  /** Another entry's id for "same-number", or the age in days for "old-copy". */
  detail: string | null;
}

/** Whole days from one day to another, both as YYYY-MM-DD, or null when either is not a real day. */
export function daysBetween(from: string, to: string): number | null {
  const a = parseDay(from);
  const b = parseDay(to);
  return a === null || b === null ? null : Math.round((b - a) / 86_400_000);
}

function parseDay(v: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const ms = Date.UTC(y, mo - 1, d);
  const back = new Date(ms);
  return back.getUTCFullYear() === y && back.getUTCMonth() === mo - 1 && back.getUTCDate() === d ? ms : null;
}

/** Findings for each entry in the order the pack lists them, then in the order of HELP_FINDING_CODES. */
export function auditHelp(items: readonly HelpNumber[], today: string): HelpFinding[] {
  const out: HelpFinding[] = [];
  const firstWithDigits = new Map<string, string>();
  for (const i of items) {
    const add = (code: HelpFindingCode, detail: string | null = null) => out.push({ id: i.id, code, detail });
    const reading = i.contact === null ? null : readContact(i.contact);
    if (reading === null) add("no-number");
    if (i.name.en === null) add("no-name-en");
    if (i.name.fr === null) add("no-name-fr");
    if (i.how.en === null) add("no-how-en");
    if (i.how.fr === null) add("no-how-fr");
    if (i.sourceName === null) add("no-source");
    if (i.sourceUrl === null) add("no-source-page");
    if (i.retrievedOn === null) add("no-date");
    else {
      const age = daysBetween(i.retrievedOn, today);
      if (age !== null && age < 0) add("future-date", i.retrievedOn);
      else if (age !== null && age > HELP_STALE_DAYS) add("old-copy", String(age));
    }
    if (i.tier === null) add("no-tier");
    if (i.url === null) add("no-page");
    if (reading !== null) {
      const first = firstWithDigits.get(reading.digits);
      if (first === undefined) firstWithDigits.set(reading.digits, i.id);
      else add("same-number", first);
    }
  }
  return out;
}

export interface HelpAuditSummary {
  entries: number;
  entriesWithFindings: number;
  byCode: Record<HelpFindingCode, number>;
}

export function summariseAudit(items: readonly HelpNumber[], findings: readonly HelpFinding[]): HelpAuditSummary {
  const byCode = Object.fromEntries(HELP_FINDING_CODES.map((c) => [c, 0])) as Record<HelpFindingCode, number>;
  for (const f of findings) byCode[f.code] += 1;
  return { entries: items.length, entriesWithFindings: new Set(findings.map((f) => f.id)).size, byCode };
}

export function findingText(f: HelpFinding, locale: Locale): string {
  const d = f.detail ?? "";
  switch (f.code) {
    case "no-number": return t(locale, "No number is saved.", "Aucun numéro n’est enregistré.");
    case "no-name-en": return t(locale, "No English name is saved.", "Aucun nom anglais n’est enregistré.");
    case "no-name-fr": return t(locale, "No French name is saved.", "Aucun nom français n’est enregistré.");
    case "no-how-en": return t(locale, "No English description is saved.", "Aucune description anglaise n’est enregistrée.");
    case "no-how-fr": return t(locale, "No French description is saved.", "Aucune description française n’est enregistrée.");
    case "no-source": return t(locale, "No source name is saved.", "Aucun nom de source n’est enregistré.");
    case "no-source-page": return t(locale, "No source address is saved.", "Aucune adresse de source n’est enregistrée.");
    case "no-date": return t(locale, "No retrieval date is saved.", "Aucune date de récupération n’est enregistrée.");
    case "old-copy": return t(locale, `This copy is ${d} days old.`, `Cette copie date de ${d} jours.`);
    case "future-date": return t(locale, `The retrieval date, ${d}, is after today.`, `La date de récupération, ${d}, est postérieure à aujourd’hui.`);
    case "no-tier": return t(locale, "No tier is saved.", "Aucun niveau n’est enregistré.");
    case "no-page": return t(locale, "No page address is saved.", "Aucune adresse de page n’est enregistrée.");
    case "same-number": return t(locale, `The same digits are saved under ${d}.`, `Les mêmes chiffres sont enregistrés sous ${d}.`);
  }
}

/** A plain-text report: one block per entry that has findings, and a line when there are none. */
export function auditToText(items: readonly HelpNumber[], today: string, locale: Locale): string {
  const findings = auditHelp(items, today);
  const s = summariseAudit(items, findings);
  const head = t(locale, "Check of the saved help numbers", "Contrôle des numéros d’aide enregistrés");
  const lines = [head, "=".repeat(head.length)];
  lines.push(t(locale, `${s.entries} entries, ${s.entriesWithFindings} with findings.`, `${s.entries} entrées, ${s.entriesWithFindings} avec constats.`));
  if (findings.length === 0) lines.push(t(locale, "No gaps were found in what is saved.", "Aucune lacune n’a été trouvée dans ce qui est enregistré."));
  for (const i of items) {
    const mine = findings.filter((f) => f.id === i.id);
    if (mine.length === 0) continue;
    lines.push("", i.id);
    for (const f of mine) lines.push(`- ${findingText(f, locale)}`);
  }
  return `${lines.join("\n")}\n`;
}

export const AUDIT_CSV_COLUMNS = ["id", "code", "detail", "finding"] as const;

/** The findings as CSV, one row each, with the sentence in the given language. Header only when there are none. */
export function auditToCsv(items: readonly HelpNumber[], today: string, locale: Locale, opts: { bom?: boolean } = {}): string {
  const lines = [AUDIT_CSV_COLUMNS.join(",")];
  for (const f of auditHelp(items, today)) {
    lines.push([f.id, f.code, f.detail ?? "UNKNOWN", findingText(f, locale)].map(csvCell).join(","));
  }
  return `${opts.bom ? "\uFEFF" : ""}${lines.join("\r\n")}\r\n`;
}
