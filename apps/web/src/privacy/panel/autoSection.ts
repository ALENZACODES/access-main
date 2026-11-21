// The part of the panel that lists where the App starts work on its own: timers, page watchers, listeners and the
// offline worker. It repeats what autoRegister.ts records, row by row (the file of each row is in the downloads, not on screen, like the other lists), and says plainly what it is: a list read from
// the code, with each row marked as setting work going, answering something that happens, or only asking the browser a
// question. The person can also ask the browser which offline workers this site has right now.

import type { Locale } from "./copyLint";
import { button, esc, isSingular } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import { EFFECT_LABELS, KIND_LABELS, autoCounts, inKindOrder, type AutoCounts, type AutoRow } from "./autoRegister";
import { workerFindingText, workerSummary, type WorkerCheckView } from "./autoLive";

const NBSP = "\u00a0";

export const AUTO_STRINGS = {
  en: {
    heading: "What the App does on its own",
    note: "This lists the places in the App's code that start work without you pressing anything: a timer that ends a wait, a watcher that follows part of the page, a listener for going online or offline, and the offline worker. Each row says whether it sets work going, answers something that happens, or only asks the browser a question. It is a list read from the code. Work started by outside libraries is not in it.",
    caption: "Work the App starts on its own",
    columns: { what: "What it is", when: "When it runs", does: "What it does" },
    summary: (c: AutoCounts): string => {
      const head = `${c.total} ${isSingular("en", c.total) ? "row is" : "rows are"} listed, at ${c.uses} ${isSingular("en", c.uses) ? "place" : "places"} in ${c.files} ${isSingular("en", c.files) ? "file" : "files"}.`;
      return `${head} ${c.runs} set work going, ${c.reacts} answer something that happens and ${c.reads} only ${isSingular("en", c.reads) ? "asks" : "ask"} the browser a question.`;
    },
    checkButton: "Ask the browser about offline workers",
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    exportHeader: ["What it is", "In the code", "Places", "Kind of start", "When it runs", "What it does", "Recorded on"],
    labels: { file: "In the code", places: "Places", effect: "Kind of start", when: "When it runs", does: "What it does", recorded: "Recorded on" },
    fileTitle: "What the App does on its own",
    stem: "the-app-work-on-its-own",
  },
  fr: {
    heading: "Ce que l’App fait d’elle-même",
    note: "Cette liste montre les endroits du code de l’App qui lancent un travail sans que vous touchiez à rien\u00a0: une minuterie qui met fin à une attente, une surveillance d’une partie de la page, une écoute du passage en ligne ou hors ligne, et l’agent hors ligne. Chaque ligne dit si elle lance un travail, répond à un événement ou pose seulement une question au navigateur. C’est une liste lue dans le code. Le travail lancé par des bibliothèques extérieures n’y figure pas.",
    caption: "Travail que l’App lance d’elle-même",
    columns: { what: "De quoi il s’agit", when: "Quand cela s’exécute", does: "Ce que cela fait" },
    summary: (c: AutoCounts): string => {
      const head = `${c.total} ${isSingular("fr", c.total) ? "ligne figure" : "lignes figurent"} dans la liste, à ${c.uses} ${isSingular("fr", c.uses) ? "endroit" : "endroits"} dans ${c.files} ${isSingular("fr", c.files) ? "fichier" : "fichiers"}.`;
      return `${head} ${c.runs} ${isSingular("fr", c.runs) ? "lance" : "lancent"} un travail, ${c.reacts} ${isSingular("fr", c.reacts) ? "répond" : "répondent"} à un événement et ${c.reads} ${isSingular("fr", c.reads) ? "pose" : "posent"} seulement une question au navigateur.`;
    },
    checkButton: "Interroger le navigateur sur les agents hors ligne",
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    exportHeader: ["De quoi il s’agit", "Dans le code", "Endroits", "Type de lancement", "Quand cela s’exécute", "Ce que cela fait", "Date d’inscription"],
    labels: { file: "Dans le code", places: "Endroits", effect: "Type de lancement", when: "Quand cela s’exécute", does: "Ce que cela fait", recorded: "Date d’inscription" },
    fileTitle: "Ce que l’App fait d’elle-même",
    stem: "l-app-travail-lance-d-elle-meme",
  },
} as const;

function checkHtml(locale: Locale, c: WorkerCheckView): string {
  const differences = c.findings.filter((f) => f.code === "unlisted" || f.code === "unreadable").length;
  const items = c.findings.map((f) => `<li>${esc(workerFindingText(locale, f))}</li>`).join("");
  return `<div role="status" data-privacy-auto-check><p>${esc(workerSummary(locale, c.registered, differences))}</p>${items === "" ? "" : `<ul>${items}</ul>`}</div>`;
}

/** Empty when there are no rows, so the section only appears when it has something to say. `check` is what the browser said; null before the person asks. */
export function renderAutoHtml(locale: Locale, rows: readonly AutoRow[], check: WorkerCheckView | null = null): string {
  if (rows.length === 0) return "";
  const s = AUTO_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = inKindOrder(rows)
    .map(
      (r) =>
        `<tr><th scope="row">${label(s.columns.what, KIND_LABELS[r.kind][locale])}</th><td>${label(s.columns.when, r.when[locale])}</td><td>${label(s.columns.does, `${r.does[locale]} (${EFFECT_LABELS[r.effect][locale]})`)}</td></tr>`,
    )
    .join("");
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr><th scope="col">${esc(s.columns.what)}</th><th scope="col">${esc(s.columns.when)}</th><th scope="col">${esc(s.columns.does)}</th></tr></thead><tbody>${body}</tbody></table>`;
  return (
    `<div data-privacy-auto role="group" aria-labelledby="privacy-auto-title"><h3 id="privacy-auto-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.summary(autoCounts(rows)))}</p>${table}` +
    `<div>${button("check-workers", s.checkButton)}${button("export-auto-csv", s.csvButton)}${button("export-auto-text", s.textButton)}</div>${check === null ? "" : checkHtml(locale, check)}</div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function autoAsCsv(locale: Locale, rows: readonly AutoRow[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = AUTO_STRINGS[locale];
  const line = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const list = inKindOrder(rows);
  const body = list.map((r) => line([KIND_LABELS[r.kind][locale], r.path, String(r.uses), EFFECT_LABELS[r.effect][locale], r.when[locale], r.does[locale], r.recordedOn])).join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: line(s.exportHeader) + body, count: list.length };
}

export function autoAsText(locale: Locale, rows: readonly AutoRow[], now: Date): ExportFile {
  const s = AUTO_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const list = inKindOrder(rows);
  const out: string[] = [s.fileTitle, "", s.note, "", rows.length === 0 ? "" : s.summary(autoCounts(rows)), ""];
  for (const r of list) {
    out.push(KIND_LABELS[r.kind][locale]);
    out.push(`  ${s.labels.file}${colon} ${r.path}`, `  ${s.labels.places}${colon} ${r.uses}`, `  ${s.labels.effect}${colon} ${EFFECT_LABELS[r.effect][locale]}`, `  ${s.labels.when}${colon} ${r.when[locale]}`, `  ${s.labels.does}${colon} ${r.does[locale]}`, `  ${s.labels.recorded}${colon} ${r.recordedOn}`, "");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: list.length };
}
