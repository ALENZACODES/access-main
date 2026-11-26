// The part of the panel that says where the App makes a random value or reads something about your browser, and
// whether the value is kept. It lists what the code does at those places and does not say that a value is never
// sent: the check behind the list follows a value inside one file only.

import type { Locale } from "./copyLint";
import { button, esc } from "./html";
import type { IdentifierKept, IdentifierRow } from "./identifierRegister";
import { identifierKeptCounts, identifierTotal } from "./identifierRegister";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";

const NBSP = "\u00a0";

export const IDENTIFIER_STRINGS = {
  en: {
    heading: "What the App makes or reads about your browser",
    note: "In some parts, the App makes a random value or reads a setting of your browser. This list shows where and what. The last column says whether the value is kept. It was made from reading the code one file at a time, so it does not show where a value goes after that.",
    caption: "Parts of the App that make or read something",
    columns: { where: "Part of the App", what: "What it makes or reads", kept: "Is it kept?" },
    kept: { "on-device": "Kept on this device", "not-kept": "Not kept", "in-copy": "Written into the protected copy", "shown-only": "Shown in this panel, not kept" } as Record<IdentifierKept, string>,
    summary: (places: number, parts: number, onDevice: number): string => {
      const head = `${places} ${places === 1 ? "place" : "places"} in ${parts} ${parts === 1 ? "part" : "parts"} of the App ${places === 1 ? "makes" : "make"} a random value or ${places === 1 ? "reads" : "read"} a setting of your browser.`;
      return onDevice === 0 ? head : `${head} ${onDevice} of them ${onDevice === 1 ? "keeps" : "keep"} the value on this device.`;
    },
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    exportHeader: ["Part of the App", "What it makes or reads", "Places", "Is it kept?"],
    labels: { what: "What it makes or reads", count: "Places", kept: "Is it kept?" },
    fileTitle: "What the App makes or reads about your browser",
    stem: "the-app-random-values-and-browser-reads",
  },
  fr: {
    heading: "Ce que l’App produit ou lit sur votre navigateur",
    note: "Dans certaines parties, l’App produit une valeur aléatoire ou lit un réglage de votre navigateur. Cette liste montre où et quoi. La dernière colonne dit si la valeur est conservée. Elle vient d’une lecture du code, un fichier à la fois\u00a0: elle ne montre donc pas où va une valeur ensuite.",
    caption: "Parties de l’App qui produisent ou lisent quelque chose",
    columns: { where: "Partie de l’App", what: "Ce qu’elle produit ou lit", kept: "Est-ce conservé\u202f?" },
    kept: { "on-device": "Conservé sur cet appareil", "not-kept": "Non conservé", "in-copy": "Écrit dans la copie protégée", "shown-only": "Affiché dans ce panneau, non conservé" } as Record<IdentifierKept, string>,
    summary: (places: number, parts: number, onDevice: number): string => {
      const head = `${places} ${places > 1 ? "endroits" : "endroit"} dans ${parts} ${parts > 1 ? "parties" : "partie"} de l’App ${places > 1 ? "produisent" : "produit"} une valeur aléatoire ou ${places > 1 ? "lisent" : "lit"} un réglage de votre navigateur.`;
      return onDevice === 0 ? head : `${head} ${onDevice} d’entre eux ${onDevice > 1 ? "conservent" : "conserve"} la valeur sur cet appareil.`;
    },
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    exportHeader: ["Partie de l’App", "Ce qu’elle produit ou lit", "Endroits", "Est-ce conservé\u202f?"],
    labels: { what: "Ce qu’elle produit ou lit", count: "Endroits", kept: "Est-ce conservé\u202f?" },
    fileTitle: "Ce que l’App produit ou lit sur votre navigateur",
    stem: "l-app-valeurs-aleatoires-et-lectures-du-navigateur",
  },
} as const;

/** The summary sentence for the rows, or an empty string for none. */
export function identifierSummary(locale: Locale, rows: readonly IdentifierRow[]): string {
  if (rows.length === 0) return "";
  return IDENTIFIER_STRINGS[locale].summary(identifierTotal(rows), rows.length, identifierKeptCounts(rows)["on-device"]);
}

/** Empty when there are no rows, so the section only appears when it has something to say. */
export function renderIdentifiersHtml(locale: Locale, rows: readonly IdentifierRow[]): string {
  if (rows.length === 0) return "";
  const s = IDENTIFIER_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = rows
    .map((r) => `<tr><th scope="row">${label(s.columns.where, r.where[locale])}</th><td>${label(s.columns.what, r.what[locale])}</td><td>${label(s.columns.kept, s.kept[r.kept])}</td></tr>`)
    .join("");
  const head = `<th scope="col">${esc(s.columns.where)}</th><th scope="col">${esc(s.columns.what)}</th><th scope="col">${esc(s.columns.kept)}</th>`;
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  return (
    `<div data-privacy-identifiers role="group" aria-labelledby="privacy-identifiers-title"><h3 id="privacy-identifiers-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(identifierSummary(locale, rows))}</p>${table}` +
    `<div>${button("export-identifiers-csv", s.csvButton)}${button("export-identifiers-text", s.textButton)}</div></div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function identifiersAsCsv(locale: Locale, rows: readonly IdentifierRow[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = IDENTIFIER_STRINGS[locale];
  const line = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const body = rows.map((r) => line([r.where[locale], r.what[locale], String(r.count), s.kept[r.kept]])).join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: line(s.exportHeader) + body, count: rows.length };
}

export function identifiersAsText(locale: Locale, rows: readonly IdentifierRow[], now: Date): ExportFile {
  const s = IDENTIFIER_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const out: string[] = [s.fileTitle, "", s.note, "", identifierSummary(locale, rows), ""];
  for (const r of rows) {
    out.push(r.where[locale]);
    out.push(`  ${s.labels.what}${colon} ${r.what[locale]}`, `  ${s.labels.count}${colon} ${r.count}`, `  ${s.labels.kept}${colon} ${s.kept[r.kept]}`, "");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: rows.length };
}
