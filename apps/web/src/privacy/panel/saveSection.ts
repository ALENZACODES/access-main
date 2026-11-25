// The part of the panel that lists where the App makes a file for you to save. It repeats what saveRegister.ts records,
// row by row (the file of each row is in the downloads, not on screen, like the other lists), and says plainly what it
// is: a list read from the code. It does not say what is inside a file, who chose to make it or where it goes once
// your browser has saved it. The person can also ask the browser now whether it can do the three things the App needs
// to hand over a file; the answers are shown here and are not stored or sent, and no file is made.

import type { Locale } from "./copyLint";
import { button, esc, isSingular } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import { SAVE_QUESTIONS, saveAnswerText, saveFindingText, saveQuestionName, saveSummary, type SaveCheckView } from "./saveLive";
import { SAVE_KIND_LABELS, saveCounts, saveKindOrder, type SaveCounts, type SaveRow } from "./saveRegister";

const NBSP = "\u00A0";

export const SAVE_STRINGS = {
  en: {
    heading: "Where the App makes files for you to save",
    note: "This lists the places in the App's code that make a file for you to save, such as a report or a list. It is a list read from the code. It names what each file is about and which file formats the code names. It does not say what is inside a file you save, or what happens to it once your browser has saved it.",
    caption: "Places that make a file for you to save",
    columns: { kind: "Formats the code names", makes: "What the file is about" },
    summary: (c: SaveCounts): string => {
      const head = `${c.total} ${isSingular("en", c.total) ? "row is" : "rows are"} listed, at ${c.uses} ${isSingular("en", c.uses) ? "place" : "places"} in ${c.files} ${isSingular("en", c.files) ? "file" : "files"}.`;
      return `${head} In ${c.named} the code names the format itself and in ${c.caller} the format is passed in from somewhere else.`;
    },
    checkButton: "Ask the browser now",
    checkNote: "These are the answers your browser gives about three things the App needs to hand over a file. They are shown here and are not saved or sent. No file is made.",
    answerColumns: { question: "Question", answer: "Answer" },
    answerCaption: "What your browser said",
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    exportHeader: ["Formats the code names", "What the file is about", "In the code", "Places", "Recorded on"],
    labels: { kind: "Formats the code names", file: "In the code", places: "Places", recorded: "Recorded on" },
    fileTitle: "Where the App makes files for you to save",
    stem: "the-app-files-it-makes",
  },
  fr: {
    heading: "Où l’App fabrique des fichiers à enregistrer",
    note: "Cette liste montre les endroits du code de l’App qui fabriquent un fichier à enregistrer, comme un rapport ou une liste. C’est une liste lue dans le code. Elle indique de quoi parle chaque fichier et quels formats de fichier le code nomme. Elle ne dit pas ce que contient un fichier que vous enregistrez, ni ce qu’il devient une fois que votre navigateur l’a enregistré.",
    caption: "Endroits qui fabriquent un fichier à enregistrer",
    columns: { kind: "Formats nommés par le code", makes: "De quoi parle le fichier" },
    summary: (c: SaveCounts): string => {
      const head = `${c.total} ${isSingular("fr", c.total) ? "ligne figure" : "lignes figurent"} dans la liste, à ${c.uses} ${isSingular("fr", c.uses) ? "endroit" : "endroits"} dans ${c.files} ${isSingular("fr", c.files) ? "fichier" : "fichiers"}.`;
      return `${head} Dans ${c.named}, le code nomme lui-même le format et dans ${c.caller}, le format est transmis par un autre endroit.`;
    },
    checkButton: "Interroger le navigateur maintenant",
    checkNote: "Voici les réponses que votre navigateur donne sur trois choses dont l’App a besoin pour vous remettre un fichier. Elles sont affichées ici et ne sont ni enregistrées ni envoyées. Aucun fichier n’est fabriqué.",
    answerColumns: { question: "Question", answer: "Réponse" },
    answerCaption: "Ce qu’a répondu votre navigateur",
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    exportHeader: ["Formats nommés par le code", "De quoi parle le fichier", "Dans le code", "Endroits", "Date d’inscription"],
    labels: { kind: "Formats nommés par le code", file: "Dans le code", places: "Endroits", recorded: "Date d’inscription" },
    fileTitle: "Où l’App fabrique des fichiers à enregistrer",
    stem: "l-app-fichiers-qu-elle-fabrique",
  },
} as const;

function checkHtml(locale: Locale, c: SaveCheckView): string {
  const s = SAVE_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const rows = SAVE_QUESTIONS.map(
    (q) => `<tr><th scope="row">${label(s.answerColumns.question, saveQuestionName(locale, q))}</th><td>${label(s.answerColumns.answer, saveAnswerText(locale, q, c.reading))}</td></tr>`,
  ).join("");
  const table = `<table><caption>${esc(s.answerCaption)}</caption><thead><tr><th scope="col">${esc(s.answerColumns.question)}</th><th scope="col">${esc(s.answerColumns.answer)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  const items = c.findings.map((f) => `<li>${esc(saveFindingText(locale, f))}</li>`).join("");
  return `<div role="status" data-privacy-save-check><p>${esc(saveSummary(locale, c.answered))}</p><p>${esc(s.checkNote)}</p>${table}${items === "" ? "" : `<ul>${items}</ul>`}</div>`;
}

/** Empty when there are no rows, so the section only appears when it has something to say. `check` is what the browser said; null before the person asks. */
export function renderSaveHtml(locale: Locale, rows: readonly SaveRow[], check: SaveCheckView | null = null): string {
  if (rows.length === 0) return "";
  const s = SAVE_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = saveKindOrder(rows)
    .map((r) => `<tr><th scope="row">${label(s.columns.makes, r.makes[locale])}</th><td>${label(s.columns.kind, SAVE_KIND_LABELS[r.kind][locale])}</td></tr>`)
    .join("");
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr><th scope="col">${esc(s.columns.makes)}</th><th scope="col">${esc(s.columns.kind)}</th></tr></thead><tbody>${body}</tbody></table>`;
  return (
    `<div data-privacy-save role="group" aria-labelledby="privacy-save-title"><h3 id="privacy-save-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.summary(saveCounts(rows)))}</p>${table}` +
    `<div>${button("check-save", s.checkButton)}${button("export-save-csv", s.csvButton)}${button("export-save-text", s.textButton)}</div>${check === null ? "" : checkHtml(locale, check)}</div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function saveAsCsv(locale: Locale, rows: readonly SaveRow[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = SAVE_STRINGS[locale];
  const line = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const list = saveKindOrder(rows);
  const body = list.map((r) => line([SAVE_KIND_LABELS[r.kind][locale], r.makes[locale], r.path, String(r.uses), r.recordedOn])).join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: line(s.exportHeader) + body, count: list.length };
}

export function saveAsText(locale: Locale, rows: readonly SaveRow[], now: Date): ExportFile {
  const s = SAVE_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const list = saveKindOrder(rows);
  const out: string[] = [s.fileTitle, "", s.note, "", rows.length === 0 ? "" : s.summary(saveCounts(rows)), ""];
  for (const r of list) {
    out.push(r.makes[locale]);
    out.push(`  ${s.labels.kind}${colon} ${SAVE_KIND_LABELS[r.kind][locale]}`, `  ${s.labels.file}${colon} ${r.path}`, `  ${s.labels.places}${colon} ${r.uses}`, `  ${s.labels.recorded}${colon} ${r.recordedOn}`, "");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: list.length };
}
