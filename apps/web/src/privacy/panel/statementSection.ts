// The part of the panel that says where the App states that data stays on the device or is not sent, and the one
// thing that was checked about each place: whether the code in that part makes a network request itself. The check
// does not cover code in other files, so it never says a statement is true. A part whose code does make a request,
// or that was not checked, is shown as such and not counted as a pass.

import type { Locale } from "./copyLint";
import { button, esc } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import type { StatementCheck, StatementResult } from "./statementRegister";

const NBSP = "\u00a0";

export const STATEMENT_STRINGS = {
  en: {
    heading: "What the App says about your data",
    note: "Some parts of the App say that your data stays on this device or is not sent. This list shows where. The last column checks one thing only: whether the code in that part makes a network request itself. It does not cover code elsewhere, so it does not prove a statement.",
    caption: "Parts of the App that say it",
    columns: { where: "Part of the App", requests: "Network requests in that part’s code" },
    checks: { "no-requests-in-file": "None found", "requests-in-file": "Some. The check cannot confirm the statement there.", "not-checked": "Not checked" } as Record<StatementCheck, string>,
    summary: (parts: number, found: number, some: number, unchecked: number): string => {
      const head = `${parts} ${parts === 1 ? "part of the App says" : "parts of the App say"} this.`;
      if (unchecked === parts) return `${head} They were not checked.`;
      const none = `In ${found} of them the check found no network request in that part’s code.`;
      return some === 0 ? `${head} ${none}` : `${head} ${none} In ${some} it found one, so the statement there stays unconfirmed.`;
    },
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    exportHeader: ["Part of the App", "English statements", "French statements", "Network requests in that part’s code"],
    labels: { en: "English statements", fr: "French statements", requests: "Network requests in that part’s code" },
    fileTitle: "What the App says about your data",
    stem: "the-app-statements-about-data",
  },
  fr: {
    heading: "Ce que l’App dit de vos données",
    note: "Certaines parties de l’App disent que vos données restent sur cet appareil ou ne sont pas envoyées. Cette liste montre lesquelles. La dernière colonne regarde une seule chose\u00a0: si le code de cette partie fait lui-même une requête réseau. Elle ne couvre pas le code ailleurs, elle ne prouve donc pas une affirmation.",
    caption: "Parties de l’App qui le disent",
    columns: { where: "Partie de l’App", requests: "Requêtes réseau dans le code de cette partie" },
    checks: { "no-requests-in-file": "Aucune trouvée", "requests-in-file": "Oui. Le contrôle ne peut pas confirmer l’affirmation à cet endroit.", "not-checked": "Non contrôlé" } as Record<StatementCheck, string>,
    summary: (parts: number, found: number, some: number, unchecked: number): string => {
      const head = `${parts} ${parts > 1 ? "parties de l’App le disent" : "partie de l’App le dit"}.`;
      if (unchecked === parts) return `${head} ${parts > 1 ? "Elles n’ont pas été contrôlées" : "Elle n’a pas été contrôlée"}.`;
      const none = `Dans ${found} d’entre elles, le contrôle n’a trouvé aucune requête réseau dans le code de cette partie.`;
      return some === 0 ? `${head} ${none}` : `${head} ${none} Dans ${some}, il en a trouvé une, l’affirmation y reste donc non confirmée.`;
    },
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    exportHeader: ["Partie de l’App", "Affirmations en anglais", "Affirmations en français", "Requêtes réseau dans le code de cette partie"],
    labels: { en: "Affirmations en anglais", fr: "Affirmations en français", requests: "Requêtes réseau dans le code de cette partie" },
    fileTitle: "Ce que l’App dit de vos données",
    stem: "l-app-affirmations-sur-les-donnees",
  },
} as const;

/** How many parts were checked and found no request, found one, or were not checked. */
export function statementCounts(results: readonly StatementResult[]): { parts: number; found: number; some: number; unchecked: number } {
  const n = (c: StatementCheck): number => results.filter((r) => r.check === c).length;
  return { parts: results.length, found: n("no-requests-in-file"), some: n("requests-in-file"), unchecked: n("not-checked") };
}

/** Empty when there are no rows, so the section only appears when it has something to say. */
export function renderStatementsHtml(locale: Locale, results: readonly StatementResult[]): string {
  if (results.length === 0) return "";
  const s = STATEMENT_STRINGS[locale];
  const c = statementCounts(results);
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = results.map((r) => `<tr><th scope="row">${label(s.columns.where, r.row.where[locale])}</th><td>${label(s.columns.requests, s.checks[r.check])}</td></tr>`).join("");
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr><th scope="col">${esc(s.columns.where)}</th><th scope="col">${esc(s.columns.requests)}</th></tr></thead><tbody>${body}</tbody></table>`;
  return (
    `<div data-privacy-statements role="group" aria-labelledby="privacy-statements-title"><h3 id="privacy-statements-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.summary(c.parts, c.found, c.some, c.unchecked))}</p>${table}` +
    `<div>${button("export-statements-csv", s.csvButton)}${button("export-statements-text", s.textButton)}</div></div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function statementsAsCsv(locale: Locale, results: readonly StatementResult[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = STATEMENT_STRINGS[locale];
  const row = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const body = results.map((r) => row([r.row.where[locale], String(r.row.en), String(r.row.fr), s.checks[r.check]])).join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: row(s.exportHeader) + body, count: results.length };
}

export function statementsAsText(locale: Locale, results: readonly StatementResult[], now: Date): ExportFile {
  const s = STATEMENT_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const c = statementCounts(results);
  const out: string[] = [s.fileTitle, "", s.note, "", c.parts === 0 ? "" : s.summary(c.parts, c.found, c.some, c.unchecked), ""];
  for (const r of results) {
    out.push(r.row.where[locale]);
    out.push(`  ${s.labels.en}${colon} ${r.row.en}`, `  ${s.labels.fr}${colon} ${r.row.fr}`, `  ${s.labels.requests}${colon} ${s.checks[r.check]}`, "");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: results.length };
}
