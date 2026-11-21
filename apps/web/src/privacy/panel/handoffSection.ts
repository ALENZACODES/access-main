// The part of the panel that lists the links in the App that open another app: an email, a place on a map, a phone
// number. It repeats what handoffRegister.ts records and says plainly that each one starts when the person taps
// a link. It does not say what the other app does with the text, because that is outside the App.

import type { Locale } from "./copyLint";
import { button, esc, isSingular } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import { handoffCounts, type HandoffCounts, type HandoffRow, type SchemeId } from "./handoffRegister";

const NBSP = " ";

export const SCHEME_LABELS: Readonly<Record<SchemeId, { en: string; fr: string }>> = {
  mailto: { en: "Email", fr: "Courriel" },
  tel: { en: "Phone call", fr: "Appel téléphonique" },
  sms: { en: "Text message", fr: "Message texte" },
  geo: { en: "Place on a map", fr: "Lieu sur une carte" },
  webcal: { en: "Calendar", fr: "Calendrier" },
  maps: { en: "Map link", fr: "Lien de carte" },
  intent: { en: "App link", fr: "Lien d’application" },
  whatsapp: { en: "Messaging app", fr: "Application de messagerie" },
  facetime: { en: "Video call", fr: "Appel vidéo" },
  navigation: { en: "A web address chosen while the App runs", fr: "Une adresse web choisie pendant l’exécution" },
};

export const HANDOFF_STRINGS = {
  en: {
    heading: "Links that open another app",
    note: "Each of these starts only when you tap a link. The App passes the other app the text listed here and does not see what happens next. What the other app does with it is up to that app.",
    caption: "Links that open another app",
    columns: { what: "What it is", opens: "What opens", carries: "What the App passes on" },
    summary: (c: HandoffCounts): string =>
      `${c.total} ${isSingular("en", c.total) ? "link is" : "links are"} listed, ${isSingular("en", c.uses) ? "in" : "at"} ${c.uses} ${isSingular("en", c.uses) ? "place" : "places"} in ${c.files} ${isSingular("en", c.files) ? "file" : "files"}.`,
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    exportHeader: ["What it is", "What opens", "What the App passes on", "Where in the code", "Places", "Recorded on"],
    labels: { what: "What it is", opens: "What opens", carries: "What the App passes on", path: "Where in the code", uses: "Places", recorded: "Recorded on" },
    fileTitle: "Links that open another app",
    stem: "the-app-links-to-other-apps",
  },
  fr: {
    heading: "Liens qui ouvrent une autre application",
    note: "Chacun de ces liens ne se lance que si vous le touchez. L’App transmet à l’autre application le texte indiqué ici et ne voit pas ce qui se passe ensuite. Ce que l’autre application en fait ne dépend que d’elle.",
    caption: "Liens qui ouvrent une autre application",
    columns: { what: "De quoi il s’agit", opens: "Ce qui s’ouvre", carries: "Ce que l’App transmet" },
    summary: (c: HandoffCounts): string =>
      `${c.total} ${isSingular("fr", c.total) ? "lien figure" : "liens figurent"} dans la liste, à ${c.uses} ${isSingular("fr", c.uses) ? "endroit" : "endroits"} dans ${c.files} ${isSingular("fr", c.files) ? "fichier" : "fichiers"}.`,
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    exportHeader: ["De quoi il s’agit", "Ce qui s’ouvre", "Ce que l’App transmet", "Où dans le code", "Endroits", "Date d’inscription"],
    labels: { what: "De quoi il s’agit", opens: "Ce qui s’ouvre", carries: "Ce que l’App transmet", path: "Où dans le code", uses: "Endroits", recorded: "Date d’inscription" },
    fileTitle: "Liens qui ouvrent une autre application",
    stem: "l-app-liens-vers-d-autres-applications",
  },
} as const;

/** Empty when there are no rows, so the section only appears when it has something to say. */
export function renderHandoffHtml(locale: Locale, rows: readonly HandoffRow[]): string {
  if (rows.length === 0) return "";
  const s = HANDOFF_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = rows
    .map((r) => `<tr><th scope="row">${label(s.columns.what, SCHEME_LABELS[r.scheme][locale])}</th><td>${label(s.columns.opens, r.opens[locale])}</td><td>${label(s.columns.carries, r.carries[locale])}</td></tr>`)
    .join("");
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr><th scope="col">${esc(s.columns.what)}</th><th scope="col">${esc(s.columns.opens)}</th><th scope="col">${esc(s.columns.carries)}</th></tr></thead><tbody>${body}</tbody></table>`;
  return (
    `<div data-privacy-handoff role="group" aria-labelledby="privacy-handoff-title"><h3 id="privacy-handoff-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.summary(handoffCounts(rows)))}</p>${table}` +
    `<div>${button("export-handoff-csv", s.csvButton)}${button("export-handoff-text", s.textButton)}</div></div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function handoffAsCsv(locale: Locale, rows: readonly HandoffRow[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = HANDOFF_STRINGS[locale];
  const line = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const body = rows.map((r) => line([SCHEME_LABELS[r.scheme][locale], r.opens[locale], r.carries[locale], r.path, String(r.uses), r.recordedOn])).join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: line(s.exportHeader) + body, count: rows.length };
}

export function handoffAsText(locale: Locale, rows: readonly HandoffRow[], now: Date): ExportFile {
  const s = HANDOFF_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const out: string[] = [s.fileTitle, "", s.note, "", rows.length === 0 ? "" : s.summary(handoffCounts(rows)), ""];
  for (const r of rows) {
    out.push(SCHEME_LABELS[r.scheme][locale]);
    out.push(`  ${s.labels.opens}${colon} ${r.opens[locale]}`, `  ${s.labels.carries}${colon} ${r.carries[locale]}`, `  ${s.labels.path}${colon} ${r.path}`, `  ${s.labels.uses}${colon} ${r.uses}`, `  ${s.labels.recorded}${colon} ${r.recordedOn}`, "");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: rows.length };
}
