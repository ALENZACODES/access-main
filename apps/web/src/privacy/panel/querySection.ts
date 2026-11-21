// The part of the panel that says what the web address of a page can carry. It repeats what queryRegister.ts
// records: which names the App reads from an address, which it builds into a link, what each holds, and the
// limit on length where the code sets one. What a browser keeps or what happens to an address once it is shared
// is outside the App and is not said here. The check reads the address of the page being shown and names what it
// finds; it does not repeat a value.

import { addressFindingText, addressSummary, type AddressCheck } from "./queryLive";
import { RUN_TIME_NAME, isBuilt, longestAllowed, queryCounts, type QueryCounts, type QueryKind, type QueryRow } from "./queryRegister";
import type { Locale } from "./copyLint";
import { button, esc, isSingular } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";

const NBSP = " ";

export const QUERY_KIND_LABELS: Record<Locale, Record<QueryKind, string>> = {
  en: { place: "A place", typed: "Typed words", ids: "Picked places", choice: "A choice", layout: "How a list is shown", language: "Language", format: "Kind of download" },
  fr: { place: "Un lieu", typed: "Des mots saisis", ids: "Des lieux choisis", choice: "Un choix", layout: "Présentation d’une liste", language: "Langue", format: "Type de téléchargement" },
};

export const QUERY_STRINGS = {
  en: {
    heading: "What a web address can carry",
    note: "Some pages read their choices from the part of the web address after the question mark, and some build it into a link so a choice can be shared, bookmarked or opened again. A place or words that end up in an address travel with the link wherever it is copied or sent. This lists the names the code reads or builds. What a browser keeps, and what happens to an address once it is shared, is outside the App and is not known here.",
    caption: "Names in a web address, what they hold and what the App does with them",
    columns: { name: "Name", holds: "What it holds", kind: "Kind", does: "What the App does", length: "Longest value read" },
    runTimeName: "Built at run time",
    reads: "Reads it from a link you open.",
    builds: "Puts it into links it builds.",
    both: "Reads it from a link you open and puts it into links it builds.",
    names: (list: string): string => `Names it can take: ${list}.`,
    noNames: "The names are set by other functions and are not listed here.",
    noLimit: "No limit found in the code.",
    chars: (n: number): string => `${n} ${n === 1 ? "character" : "characters"}`,
    summary: (c: QueryCounts): string => {
      const head = `${c.names} ${isSingular("en", c.names) ? "name is" : "names are"} listed${c.runTime === 0 ? "." : `, and ${c.runTime} ${isSingular("en", c.runTime) ? "row covers" : "rows cover"} names built at run time.`}`;
      const built = `${c.built} ${isSingular("en", c.built) ? "is" : "are"} put into links the App builds.`;
      const personal = `${c.personal} ${isSingular("en", c.personal) ? "holds" : "hold"} a place, typed words or picked places, and ${c.personalBuilt} of those ${isSingular("en", c.personalBuilt) ? "is" : "are"} put into links.`;
      return `${head} ${built} ${personal}`;
    },
    checkButton: "Check the address of this page",
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    exportHeader: ["Name in the address", "What it holds", "Kind", "What the App does", "Longest value read", "Where in the code", "Recorded on"],
    labels: { name: "Name in the address", kind: "Kind", does: "What the App does", length: "Longest value read", files: "Where in the code", recorded: "Recorded on" },
    fileTitle: "What a web address can carry",
    stem: "the-app-web-address-names",
  },
  fr: {
    heading: "Ce qu’une adresse web peut contenir",
    note: "Certaines pages lisent leurs choix dans la partie de l’adresse web qui suit le point d’interrogation, et certaines la placent dans un lien pour qu’un choix puisse être partagé, mis en favori ou rouvert. Un lieu ou des mots qui se retrouvent dans une adresse suivent le lien partout où il est copié ou envoyé. Cette liste donne les noms que le code lit ou construit. Ce qu’un navigateur garde, et ce qui arrive à une adresse une fois partagée, est hors de l’App et n’est pas connu ici.",
    caption: "Noms d’une adresse web, ce qu’ils contiennent et ce que l’App en fait",
    columns: { name: "Nom", holds: "Ce qu’il contient", kind: "Type", does: "Ce que l’App en fait", length: "Plus longue valeur lue" },
    runTimeName: "Construit à l’exécution",
    reads: "Le lit dans un lien que vous ouvrez.",
    builds: "Le place dans les liens qu’elle construit.",
    both: "Le lit dans un lien que vous ouvrez et le place dans les liens qu’elle construit.",
    names: (list: string): string => `Noms possibles${NBSP}: ${list}.`,
    noNames: "Les noms sont fixés par d’autres fonctions et ne sont pas listés ici.",
    noLimit: "Aucune limite trouvée dans le code.",
    chars: (n: number): string => `${n} ${n === 0 || n === 1 ? "caractère" : "caractères"}`,
    summary: (c: QueryCounts): string => {
      const head = `${c.names} ${isSingular("fr", c.names) ? "nom figure" : "noms figurent"} dans la liste${c.runTime === 0 ? "." : `, et ${c.runTime} ${isSingular("fr", c.runTime) ? "ligne couvre" : "lignes couvrent"} des noms construits à l’exécution.`}`;
      const built = `${c.built} ${isSingular("fr", c.built) ? "est placé" : "sont placés"} dans les liens que l’App construit.`;
      const personal = `${c.personal} ${isSingular("fr", c.personal) ? "contient" : "contiennent"} un lieu, des mots saisis ou des lieux choisis, et ${c.personalBuilt} de ${c.personalBuilt === 0 || c.personalBuilt === 1 ? "ceux-ci est placé" : "ceux-ci sont placés"} dans des liens.`;
      return `${head} ${built} ${personal}`;
    },
    checkButton: "Examiner l’adresse de cette page",
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    exportHeader: ["Nom dans l’adresse", "Ce qu’il contient", "Type", "Ce que l’App en fait", "Plus longue valeur lue", "Endroits dans le code", "Date d’inscription"],
    labels: { name: "Nom dans l’adresse", kind: "Type", does: "Ce que l’App en fait", length: "Plus longue valeur lue", files: "Endroits dans le code", recorded: "Date d’inscription" },
    fileTitle: "Ce qu’une adresse web peut contenir",
    stem: "l-app-noms-de-l-adresse-web",
  },
} as const;

export interface QueryText {
  name: string;
  holds: string;
  kind: string;
  does: string;
  length: string;
}

/** The words for one row, in one language. */
export function queryText(locale: Locale, row: QueryRow, rows: readonly QueryRow[] = [row]): QueryText {
  const s = QUERY_STRINGS[locale];
  const reads = row.places.some((p) => p.reads > 0);
  const builds = isBuilt(rows, row);
  const runTime = row.name === RUN_TIME_NAME;
  const names = row.names === undefined ? null : row.names.names.map((n) => `${row.names?.prefix ?? ""}${n}`).join(", ");
  const extra = !runTime ? "" : names === null ? ` ${s.noNames}` : ` ${s.names(names)}`;
  const allowed = longestAllowed(row);
  return {
    name: runTime ? s.runTimeName : row.name,
    holds: `${row.holds[locale]}${extra}`,
    kind: QUERY_KIND_LABELS[locale][row.kind],
    does: reads && builds ? s.both : builds ? s.builds : s.reads,
    length: allowed === null ? s.noLimit : s.chars(allowed),
  };
}

function checkHtml(locale: Locale, c: AddressCheck): string {
  const items = c.findings.map((f) => `<li>${esc(addressFindingText(locale, f))}</li>`).join("");
  return `<div role="status" data-privacy-query-check><p>${esc(addressSummary(locale, c.params, c.findings.length))}</p>${items === "" ? "" : `<ul>${items}</ul>`}</div>`;
}

/** Empty when there are no rows, so the section only appears when it has something to say. `check` is the result of reading the address; null before the person asks. */
export function renderQueryHtml(locale: Locale, rows: readonly QueryRow[], check: AddressCheck | null = null, canCheck = true): string {
  if (rows.length === 0) return "";
  const s = QUERY_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = rows
    .map((r) => {
      const t = queryText(locale, r, rows);
      return `<tr><th scope="row">${label(s.columns.name, t.name)}</th><td>${label(s.columns.holds, t.holds)}</td><td>${label(s.columns.kind, t.kind)}</td><td>${label(s.columns.does, t.does)}</td><td>${label(s.columns.length, t.length)}</td></tr>`;
    })
    .join("");
  const head = (["name", "holds", "kind", "does", "length"] as const).map((k) => `<th scope="col">${esc(s.columns[k])}</th>`).join("");
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
  const check1 = canCheck ? button("check-query", s.checkButton) : "";
  return (
    `<div data-privacy-query role="group" aria-labelledby="privacy-query-title"><h3 id="privacy-query-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.summary(queryCounts(rows)))}</p>${table}` +
    `<div>${check1}${button("export-query-csv", s.csvButton)}${button("export-query-text", s.textButton)}</div>${check === null ? "" : checkHtml(locale, check)}</div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

const filesOf = (row: QueryRow): string => row.places.map((p) => p.path).join(" | ");

export function queryAsCsv(locale: Locale, rows: readonly QueryRow[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = QUERY_STRINGS[locale];
  const line = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const body = rows
    .map((r) => {
      const t = queryText(locale, r, rows);
      return line([t.name, t.holds, t.kind, t.does, t.length, filesOf(r), r.recordedOn]);
    })
    .join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: line(s.exportHeader) + body, count: rows.length };
}

export function queryAsText(locale: Locale, rows: readonly QueryRow[], now: Date): ExportFile {
  const s = QUERY_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const out: string[] = [s.fileTitle, "", s.note, "", rows.length === 0 ? "" : s.summary(queryCounts(rows)), ""];
  for (const r of rows) {
    const t = queryText(locale, r, rows);
    out.push(`${t.name}`, `  ${t.holds}`);
    out.push(`  ${s.labels.kind}${colon} ${t.kind}`, `  ${s.labels.does}${colon} ${t.does}`, `  ${s.labels.length}${colon} ${t.length}`, `  ${s.labels.files}${colon} ${filesOf(r)}`, `  ${s.labels.recorded}${colon} ${r.recordedOn}`, "");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: rows.length };
}
