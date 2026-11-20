// "What the App asks of your browser" as a file: one line per feature, with whether the App uses it, why,
// whether the browser asks the person first, what the browser said at the last check, and whether the App's
// header settings list it as off. Written offline from the same rows the panel shows. Before the check, the
// browser's answer is written as "Not checked", never as a guess.

import type { Locale } from "./copyLint";
import { FEATURE_STRINGS } from "./featureSection";
import type { FeatureRow } from "./featureRegister";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import type { FeatureStates } from "./permissions";

const NBSP = " ";

export const FEATURE_EXPORT_STRINGS = {
  en: {
    title: "What the App asks of your browser",
    header: ["Feature", "Used by the App", "Why", "Does your browser ask you first?", "Your browser’s answer", "App header settings", "Source", "Recorded on"],
    line: { used: "Used by the App", why: "Why", asks: "Does your browser ask you first?", answer: "Your browser’s answer", headers: "App header settings", source: "Source", date: "Recorded on" },
    yes: "Yes",
    no: "No",
  },
  fr: {
    title: "Ce que l’App demande à votre navigateur",
    header: ["Fonction", "Utilisé par l’App", "Pourquoi", "Votre navigateur vous le demande-t-il d’abord ?", "Réponse de votre navigateur", "Réglages d’en-tête de l’App", "Source", "Date d’inscription"],
    line: { used: "Utilisé par l’App", why: "Pourquoi", asks: "Votre navigateur vous le demande-t-il d’abord ?", answer: "Réponse de votre navigateur", headers: "Réglages d’en-tête de l’App", source: "Source", date: "Date d’inscription" },
    yes: "Oui",
    no: "Non",
  },
} as const;

export interface FeatureLine {
  feature: string;
  used: string;
  why: string;
  asks: string;
  answer: string;
  headers: string;
  source: string;
  recordedOn: string;
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Features the App uses first, then the ones it does not use; each group keeps the register's order. */
export function featureLines(locale: Locale, register: readonly FeatureRow[], states: FeatureStates | null): FeatureLine[] {
  const f = FEATURE_STRINGS[locale];
  const e = FEATURE_EXPORT_STRINGS[locale];
  const line = (r: FeatureRow): FeatureLine => ({
    feature: r.holds[locale],
    used: r.used ? e.yes : e.no,
    why: r.why?.[locale] ?? "",
    asks: f.asks[r.asks],
    answer: r.permission === undefined ? f.answer.none : states === null ? f.answer.notChecked : f.answer[states.answers[r.id] ?? "unknown"],
    headers: r.used ? f.answer.none : r.blockedBy === undefined ? f.headers.none : f.headers.off,
    source: r.source,
    recordedOn: r.recordedOn,
  });
  return [...register.filter((r) => r.used).map(line), ...register.filter((r) => !r.used).map(line)];
}

const stem = (locale: Locale): string => (locale === "fr" ? "l-app-fonctions-du-navigateur" : "the-app-browser-features");

export function featuresAsCsv(locale: Locale, register: readonly FeatureRow[], states: FeatureStates | null, now: Date, delimiter: "," | ";" = ","): ExportFile {
  const lines = featureLines(locale, register, states);
  const row = (cells: readonly string[]): string => `${cells.map((c) => csvCell(c, delimiter)).join(delimiter)}\r\n`;
  const text = row(FEATURE_EXPORT_STRINGS[locale].header) + lines.map((l) => row([l.feature, l.used, l.why, l.asks, l.answer, l.headers, l.source, l.recordedOn])).join("");
  return { filename: `${stem(locale)}-${localDate(now)}.csv`, mime: "text/csv", text, count: lines.length };
}

export function featuresAsText(locale: Locale, register: readonly FeatureRow[], states: FeatureStates | null, now: Date): ExportFile {
  const e = FEATURE_EXPORT_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const lines = featureLines(locale, register, states);
  const out: string[] = [e.title, ""];
  for (const l of lines) {
    out.push(l.feature);
    const fields: Array<readonly [string, string]> = [[e.line.used, l.used]];
    if (l.why !== "") fields.push([e.line.why, l.why]);
    fields.push([e.line.asks, l.asks], [e.line.answer, l.answer], [e.line.headers, l.headers], [e.line.source, l.source], [e.line.date, l.recordedOn]);
    for (const [label, value] of fields) out.push(`  ${label}${colon} ${value}`);
    out.push("");
  }
  return { filename: `${stem(locale)}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: lines.length };
}
