// The record of a person's choices as a table and as a file. See receipt.ts for where the rows come from.

import type { Locale } from "./copyLint";
import { button, esc } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import { receiptOpen, type ReceiptAnswer, type ReceiptRow } from "./receipt";

const NBSP = " ";

export const RECEIPT_STRINGS = {
  en: {
    heading: "Record of your choices",
    note: "This record is made on this device from the choices you made in this panel. It is not sent anywhere. It lists each choice, its date, what the choice lets the App save and what is saved now.",
    caption: "Your choices",
    columns: { choice: "Choice", answer: "Your answer", date: "Date", covers: "Lets the App save", saved: "Saved now", ifNo: "If you say no" },
    answers: { granted: "Yes", declined: "No", unknown: "Not asked yet", changed: "Asked again because the wording changed" } as Record<ReceiptAnswer, string>,
    noDate: "No date",
    earlier: (date: string): string => `${date} (no longer counts)`,
    notListed: "Not listed",
    nothingTied: "Nothing is tied to this choice.",
    saved: (n: number): string => `${n} ${n === 1 ? "item" : "items"}`,
    ifNo: { removes: "The App stops saving it and removes what it saved.", keeps: "The App stops saving it. What is already saved stays until you erase it.", none: "Nothing changes, because nothing is tied to this choice." },
    open: (n: number): string => (n === 0 ? "Every choice has a current answer." : `${n} ${n === 1 ? "choice has" : "choices have"} no current answer. ${n === 1 ? "It is" : "They are"} off until you answer.`),
    csvButton: "Download this record (CSV)",
    textButton: "Download this record (text)",
    exportHeader: ["Choice", "What the choice means", "Your answer", "Date", "Wording version", "Lets the App save", "Saved now", "If you say no"],
    labels: { means: "What the choice means", answer: "Your answer", date: "Date", version: "Wording version", covers: "Lets the App save", saved: "Saved now", ifNo: "If you say no" },
    fileTitle: "Record of your choices",
    noteShort: (date: string): string => `Made on this device on ${date}. It is not sent anywhere.`,
    stem: "the-app-record-of-your-choices",
  },
  fr: {
    heading: "Registre de vos choix",
    note: "Ce registre est fait sur cet appareil à partir des choix que vous avez faits dans ce panneau. Il n’est envoyé nulle part. Il indique chaque choix, sa date, ce que le choix permet à l’App d’enregistrer et ce qui est enregistré maintenant.",
    caption: "Vos choix",
    columns: { choice: "Choix", answer: "Votre réponse", date: "Date", covers: "Permet à l’App d’enregistrer", saved: "Enregistré maintenant", ifNo: "Si vous répondez non" },
    answers: { granted: "Oui", declined: "Non", unknown: "Pas encore demandé", changed: "Redemandé parce que le texte a changé" } as Record<ReceiptAnswer, string>,
    noDate: "Aucune date",
    earlier: (date: string): string => `${date} (ne compte plus)`,
    notListed: "Non listé",
    nothingTied: "Rien n’est lié à ce choix.",
    saved: (n: number): string => `${n} ${n > 1 ? "éléments" : "élément"}`,
    ifNo: { removes: "L’App cesse de l’enregistrer et supprime ce qu’elle avait enregistré.", keeps: "L’App cesse de l’enregistrer. Ce qui est déjà enregistré reste jusqu’à ce que vous l’effaciez.", none: "Rien ne change, car rien n’est lié à ce choix." },
    open: (n: number): string => (n === 0 ? "Chaque choix a une réponse à jour." : `${n} ${n > 1 ? "choix n’ont" : "choix n’a"} pas de réponse à jour. ${n > 1 ? "Ils sont désactivés" : "Il est désactivé"} jusqu’à votre réponse.`),
    csvButton: "Télécharger ce registre (CSV)",
    textButton: "Télécharger ce registre (texte)",
    exportHeader: ["Choix", "Ce que le choix signifie", "Votre réponse", "Date", "Version du texte", "Permet à l’App d’enregistrer", "Enregistré maintenant", "Si vous répondez non"],
    labels: { means: "Ce que le choix signifie", answer: "Votre réponse", date: "Date", version: "Version du texte", covers: "Permet à l’App d’enregistrer", saved: "Enregistré maintenant", ifNo: "Si vous répondez non" },
    fileTitle: "Registre de vos choix",
    noteShort: (date: string): string => `Fait sur cet appareil le ${date}. Il n’est envoyé nulle part.`,
    stem: "l-app-registre-de-vos-choix",
  },
} as const;

export interface ReceiptCells {
  choice: string;
  means: string;
  answer: string;
  date: string;
  version: string;
  covers: string;
  saved: string;
  ifNo: string;
}

/** The words for one row, the same in the panel and in the file. */
export function receiptCells(locale: Locale, r: ReceiptRow): ReceiptCells {
  const s = RECEIPT_STRINGS[locale];
  const date = r.decidedOn === undefined ? s.noDate : r.answer === "changed" ? s.earlier(r.decidedOn) : r.decidedOn;
  const covers = r.covers === null ? s.notListed : r.covers.length === 0 ? s.nothingTied : r.covers.map((c) => c[locale]).join(locale === "fr" ? " ; " : "; ");
  const ifNo = r.tied === 0 ? s.ifNo.none : r.removesOnNo ? s.ifNo.removes : s.ifNo.keeps;
  return { choice: r.label[locale], means: r.description[locale], answer: s.answers[r.answer], date, version: String(r.wordingVersion), covers, saved: s.saved(r.savedNow), ifNo };
}

/** Empty when there are no choices, so the section only appears when the App has something to ask. */
export function renderReceiptHtml(locale: Locale, rows: readonly ReceiptRow[]): string {
  if (rows.length === 0) return "";
  const s = RECEIPT_STRINGS[locale];
  const c = s.columns;
  const head = [c.choice, c.answer, c.date, c.covers, c.saved, c.ifNo];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = rows
    .map((r) => {
      const x = receiptCells(locale, r);
      return `<tr><th scope="row">${label(c.choice, x.choice)}</th><td>${label(c.answer, x.answer)}</td><td>${label(c.date, x.date)}</td><td>${label(c.covers, x.covers)}</td><td>${label(c.saved, x.saved)}</td><td>${label(c.ifNo, x.ifNo)}</td></tr>`;
    })
    .join("");
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join("")}</tr></thead><tbody>${body}</tbody></table>`;
  return (
    `<div data-privacy-receipt role="group" aria-labelledby="privacy-receipt-title"><h3 id="privacy-receipt-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.open(receiptOpen(rows)))}</p>${table}` +
    `<div>${button("export-receipt-csv", s.csvButton)}${button("export-receipt-text", s.textButton)}</div></div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function receiptAsCsv(locale: Locale, rows: readonly ReceiptRow[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = RECEIPT_STRINGS[locale];
  const row = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const body = rows
    .map((r) => {
      const x = receiptCells(locale, r);
      return row([x.choice, x.means, x.answer, x.date, x.version, x.covers, x.saved, x.ifNo]);
    })
    .join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: row(s.exportHeader) + body, count: rows.length };
}

export function receiptAsText(locale: Locale, rows: readonly ReceiptRow[], now: Date): ExportFile {
  const s = RECEIPT_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const out: string[] = [s.fileTitle, "", s.noteShort(localDate(now)), "", s.open(receiptOpen(rows)), ""];
  for (const r of rows) {
    const x = receiptCells(locale, r);
    out.push(x.choice);
    const fields: Array<readonly [string, string]> = [[s.labels.means, x.means], [s.labels.answer, x.answer], [s.labels.date, x.date], [s.labels.version, x.version], [s.labels.covers, x.covers], [s.labels.saved, x.saved], [s.labels.ifNo, x.ifNo]];
    for (const [label, value] of fields) out.push(`  ${label}${colon} ${value}`);
    out.push("");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: rows.length };
}
