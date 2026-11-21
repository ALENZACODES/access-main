// The part of the panel that lists what the App asks the browser about your device and settings. It repeats what
// browserRegister.ts records, row by row (the file of each row is in the downloads, not on screen, like the other
// lists), and says plainly what it is: a list read from the code. It does not say what a browser answers for you, where
// an identifier goes afterwards or what the rest of the App does with an answer. The person can also ask the browser
// the questions now and see the answers; they are shown here and are not stored or sent.

import { BROWSER_QUESTIONS, browserAnswerText, browserFindingText, browserQuestionName, browserSummary, type BrowserCheckView } from "./browserLive";
import { BROWSER_KIND_LABELS, browserCounts, browserKindOrder, type BrowserCounts, type BrowserRow } from "./browserRegister";
import type { Locale } from "./copyLint";
import { button, esc, isSingular } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";

const NBSP = " ";

export const BROWSER_STRINGS = {
  en: {
    heading: "What the App asks your browser",
    note: "This lists the places in the App's code that ask your browser about your device or settings, make a random identifier, or write numbers in the browser's own language. It is a list read from the code. It does not say what your browser answers, where an identifier goes afterwards, or what the rest of the App does with an answer.",
    caption: "Questions the App asks your browser",
    columns: { kind: "About", asks: "What it asks", usedFor: "What it is used for" },
    summary: (c: BrowserCounts): string => {
      const head = `${c.total} ${isSingular("en", c.total) ? "row is" : "rows are"} listed, at ${c.uses} ${isSingular("en", c.uses) ? "place" : "places"} in ${c.files} ${isSingular("en", c.files) ? "file" : "files"}.`;
      return `${head} ${c.questions} ${isSingular("en", c.questions) ? "asks" : "ask"} about your device or settings and ${c.identifiers} ${isSingular("en", c.identifiers) ? "makes" : "make"} an identifier.`;
    },
    checkButton: "Ask the browser now",
    checkNote: "These are the answers your browser gives to the questions above that ask about your device or settings. They are shown here and are not saved or sent.",
    answerColumns: { question: "Question", answer: "Answer" },
    answerCaption: "What your browser said",
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    exportHeader: ["About", "What it asks", "What it is used for", "In the code", "Places", "Recorded on"],
    labels: { kind: "About", asks: "What it asks", usedFor: "What it is used for", file: "In the code", places: "Places", recorded: "Recorded on" },
    fileTitle: "What the App asks your browser",
    stem: "the-app-browser-questions",
  },
  fr: {
    heading: "Ce que l’App demande à votre navigateur",
    note: "Cette liste montre les endroits du code de l’App qui interrogent votre navigateur sur votre appareil ou vos réglages, fabriquent un identifiant aléatoire ou écrivent des nombres dans la langue propre au navigateur. C’est une liste lue dans le code. Elle ne dit pas ce que répond votre navigateur, où va un identifiant ensuite, ni ce que le reste de l’App fait d’une réponse.",
    caption: "Questions que l’App pose à votre navigateur",
    columns: { kind: "Sujet", asks: "Ce qu’elle demande", usedFor: "À quoi cela sert" },
    summary: (c: BrowserCounts): string => {
      const head = `${c.total} ${isSingular("fr", c.total) ? "ligne figure" : "lignes figurent"} dans la liste, à ${c.uses} ${isSingular("fr", c.uses) ? "endroit" : "endroits"} dans ${c.files} ${isSingular("fr", c.files) ? "fichier" : "fichiers"}.`;
      return `${head} ${c.questions} ${isSingular("fr", c.questions) ? "interroge" : "interrogent"} le navigateur sur votre appareil ou vos réglages et ${c.identifiers} ${isSingular("fr", c.identifiers) ? "fabrique" : "fabriquent"} un identifiant.`;
    },
    checkButton: "Interroger le navigateur maintenant",
    checkNote: "Voici les réponses que votre navigateur donne aux questions ci-dessus qui portent sur votre appareil ou vos réglages. Elles sont affichées ici et ne sont ni enregistrées ni envoyées.",
    answerColumns: { question: "Question", answer: "Réponse" },
    answerCaption: "Ce qu’a répondu votre navigateur",
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    exportHeader: ["Sujet", "Ce qu’elle demande", "À quoi cela sert", "Dans le code", "Endroits", "Date d’inscription"],
    labels: { kind: "Sujet", asks: "Ce qu’elle demande", usedFor: "À quoi cela sert", file: "Dans le code", places: "Endroits", recorded: "Date d’inscription" },
    fileTitle: "Ce que l’App demande à votre navigateur",
    stem: "l-app-questions-au-navigateur",
  },
} as const;

function checkHtml(locale: Locale, c: BrowserCheckView): string {
  const s = BROWSER_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const rows = BROWSER_QUESTIONS.map(
    (q) => `<tr><th scope="row">${label(s.answerColumns.question, browserQuestionName(locale, q))}</th><td>${label(s.answerColumns.answer, browserAnswerText(locale, q, c.reading))}</td></tr>`,
  ).join("");
  const table = `<table><caption>${esc(s.answerCaption)}</caption><thead><tr><th scope="col">${esc(s.answerColumns.question)}</th><th scope="col">${esc(s.answerColumns.answer)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  const items = c.findings.map((f) => `<li>${esc(browserFindingText(locale, f))}</li>`).join("");
  return `<div role="status" data-privacy-browser-check><p>${esc(browserSummary(locale, c.answered))}</p><p>${esc(s.checkNote)}</p>${table}${items === "" ? "" : `<ul>${items}</ul>`}</div>`;
}

/** Empty when there are no rows, so the section only appears when it has something to say. `check` is what the browser said; null before the person asks. */
export function renderBrowserHtml(locale: Locale, rows: readonly BrowserRow[], check: BrowserCheckView | null = null): string {
  if (rows.length === 0) return "";
  const s = BROWSER_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = browserKindOrder(rows)
    .map((r) => `<tr><th scope="row">${label(s.columns.kind, BROWSER_KIND_LABELS[r.kind][locale])}</th><td>${label(s.columns.asks, r.asks[locale])}</td><td>${label(s.columns.usedFor, r.usedFor[locale])}</td></tr>`)
    .join("");
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr><th scope="col">${esc(s.columns.kind)}</th><th scope="col">${esc(s.columns.asks)}</th><th scope="col">${esc(s.columns.usedFor)}</th></tr></thead><tbody>${body}</tbody></table>`;
  return (
    `<div data-privacy-browser role="group" aria-labelledby="privacy-browser-title"><h3 id="privacy-browser-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.summary(browserCounts(rows)))}</p>${table}` +
    `<div>${button("check-browser", s.checkButton)}${button("export-browser-csv", s.csvButton)}${button("export-browser-text", s.textButton)}</div>${check === null ? "" : checkHtml(locale, check)}</div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function browserAsCsv(locale: Locale, rows: readonly BrowserRow[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = BROWSER_STRINGS[locale];
  const line = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const list = browserKindOrder(rows);
  const body = list.map((r) => line([BROWSER_KIND_LABELS[r.kind][locale], r.asks[locale], r.usedFor[locale], r.path, String(r.uses), r.recordedOn])).join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: line(s.exportHeader) + body, count: list.length };
}

export function browserAsText(locale: Locale, rows: readonly BrowserRow[], now: Date): ExportFile {
  const s = BROWSER_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const list = browserKindOrder(rows);
  const out: string[] = [s.fileTitle, "", s.note, "", rows.length === 0 ? "" : s.summary(browserCounts(rows)), ""];
  for (const r of list) {
    out.push(r.asks[locale]);
    out.push(`  ${s.labels.kind}${colon} ${BROWSER_KIND_LABELS[r.kind][locale]}`, `  ${s.labels.usedFor}${colon} ${r.usedFor[locale]}`, `  ${s.labels.file}${colon} ${r.path}`, `  ${s.labels.places}${colon} ${r.uses}`, `  ${s.labels.recorded}${colon} ${r.recordedOn}`, "");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: list.length };
}
