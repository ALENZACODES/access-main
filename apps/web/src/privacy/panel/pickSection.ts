// The part of the panel that lists where the App reads a file you choose. It repeats what pickRegister.ts records, row
// by row (the file of each row is in the downloads, not on screen, like the other lists), and says plainly what it is:
// a list read from the code. It does not say what is in a file you choose, and a file input's list of kinds only
// filters what the browser offers, it does not stop you choosing another file. The size limit is stated as far as the
// code shows it.

import type { Locale } from "./copyLint";
import { button, esc, isSingular } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import { PICK_KIND_LABELS, PICK_LIMIT_LABELS, acceptsText, pickCounts, pickKindOrder, type PickCounts, type PickRow } from "./pickRegister";

const NBSP = " ";

export const PICK_STRINGS = {
  en: {
    heading: "Where the App reads a file you choose",
    note: "This lists the places in the App's code that read a file from your device, each only after you choose the file. It is a list read from the code. It does not say what is in a file you choose. The list of kinds of file a page offers only filters what your browser shows: you can still choose another file. The size limit is named as far as the code shows it.",
    caption: "Files the App reads when you choose them",
    columns: { what: "What you give", formats: "Kinds offered", limit: "Size limit" },
    noKinds: "Not applicable",
    summary: (c: PickCounts): string => {
      const head = `${c.total} ${isSingular("en", c.total) ? "row is" : "rows are"} listed, at ${c.uses} ${isSingular("en", c.uses) ? "place" : "places"} in ${c.files} ${isSingular("en", c.files) ? "file" : "files"}.`;
      return `${head} ${c.before} ${isSingular("en", c.before) ? "checks" : "check"} the size before reading, ${c.after} only after reading and ${c.unlimited} ${isSingular("en", c.unlimited) ? "has" : "have"} no check for some or all of the files.`;
    },
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    exportHeader: ["What you give", "How", "Kinds offered", "Size limit", "Checked in", "In the code", "Places", "Recorded on"],
    labels: { how: "How", formats: "Kinds offered", limit: "Size limit", checkedIn: "Checked in", file: "In the code", places: "Places", recorded: "Recorded on" },
    fileTitle: "Where the App reads a file you choose",
    stem: "the-app-files-you-choose",
  },
  fr: {
    heading: "Où l’App lit un fichier que vous choisissez",
    note: "Cette liste montre les endroits du code de l’App qui lisent un fichier de votre appareil, chacun seulement après que vous avez choisi le fichier. C’est une liste lue dans le code. Elle ne dit pas ce que contient un fichier que vous choisissez. La liste des types de fichier qu’une page propose ne fait que filtrer ce que montre votre navigateur : vous pouvez quand même choisir un autre fichier. La limite de taille est indiquée dans la mesure où le code la montre.",
    caption: "Fichiers que l’App lit quand vous les choisissez",
    columns: { what: "Ce que vous donnez", formats: "Types proposés", limit: "Limite de taille" },
    noKinds: "Sans objet",
    summary: (c: PickCounts): string => {
      const head = `${c.total} ${isSingular("fr", c.total) ? "ligne figure" : "lignes figurent"} dans la liste, à ${c.uses} ${isSingular("fr", c.uses) ? "endroit" : "endroits"} dans ${c.files} ${isSingular("fr", c.files) ? "fichier" : "fichiers"}.`;
      return `${head} ${c.before} ${isSingular("fr", c.before) ? "contrôle" : "contrôlent"} la taille avant la lecture, ${c.after} seulement après la lecture et ${c.unlimited} ${isSingular("fr", c.unlimited) ? "n’a" : "n’ont"} aucun contrôle pour une partie ou la totalité des fichiers.`;
    },
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    exportHeader: ["Ce que vous donnez", "Comment", "Types proposés", "Limite de taille", "Contrôlée dans", "Dans le code", "Endroits", "Date d’inscription"],
    labels: { how: "Comment", formats: "Types proposés", limit: "Limite de taille", checkedIn: "Contrôlée dans", file: "Dans le code", places: "Endroits", recorded: "Date d’inscription" },
    fileTitle: "Où l’App lit un fichier que vous choisissez",
    stem: "l-app-fichiers-que-vous-choisissez",
  },
} as const;

/** Empty when there are no rows, so the section only appears when it has something to say. Readers are not listed on screen: they only read what a choice hands them. */
export function renderPickHtml(locale: Locale, rows: readonly PickRow[]): string {
  const shown = rows.filter((r) => r.kind === "pick");
  if (shown.length === 0) return "";
  const s = PICK_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = pickKindOrder(shown)
    .map((r) => `<tr><th scope="row">${label(s.columns.what, r.reads[locale])}</th><td>${label(s.columns.formats, acceptsText(locale, r.accepts))}</td><td>${label(s.columns.limit, PICK_LIMIT_LABELS[r.limit][locale])}</td></tr>`)
    .join("");
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr><th scope="col">${esc(s.columns.what)}</th><th scope="col">${esc(s.columns.formats)}</th><th scope="col">${esc(s.columns.limit)}</th></tr></thead><tbody>${body}</tbody></table>`;
  return (
    `<div data-privacy-pick role="group" aria-labelledby="privacy-pick-title"><h3 id="privacy-pick-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.summary(pickCounts(rows)))}</p>${table}` +
    `<div>${button("export-picks-csv", s.csvButton)}${button("export-picks-text", s.textButton)}</div></div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function picksAsCsv(locale: Locale, rows: readonly PickRow[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = PICK_STRINGS[locale];
  const line = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const list = pickKindOrder(rows);
  const body = list
    .map((r) => line([r.reads[locale], PICK_KIND_LABELS[r.kind][locale], acceptsText(locale, r.accepts) || s.noKinds, PICK_LIMIT_LABELS[r.limit][locale], r.checkedIn ?? "", r.path, String(r.uses), r.recordedOn]))
    .join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: line(s.exportHeader) + body, count: list.length };
}

export function picksAsText(locale: Locale, rows: readonly PickRow[], now: Date): ExportFile {
  const s = PICK_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const list = pickKindOrder(rows);
  const out: string[] = [s.fileTitle, "", s.note, "", rows.length === 0 ? "" : s.summary(pickCounts(rows)), ""];
  for (const r of list) {
    out.push(r.reads[locale]);
    out.push(`  ${s.labels.how}${colon} ${PICK_KIND_LABELS[r.kind][locale]}`, `  ${s.labels.formats}${colon} ${acceptsText(locale, r.accepts) || s.noKinds}`, `  ${s.labels.limit}${colon} ${PICK_LIMIT_LABELS[r.limit][locale]}`);
    if (r.checkedIn !== undefined) out.push(`  ${s.labels.checkedIn}${colon} ${r.checkedIn}`);
    out.push(`  ${s.labels.file}${colon} ${r.path}`, `  ${s.labels.places}${colon} ${r.uses}`, `  ${s.labels.recorded}${colon} ${r.recordedOn}`, "");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: list.length };
}
