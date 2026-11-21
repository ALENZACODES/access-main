// The part of the panel that says how long each thing the App keeps on this device is kept, and how much of it. It
// repeats what retentionRegister.ts records: a time limit, a limit on how many items or how much space, or that none
// was found in the code that saves it. "None found" is what was read, not a promise. A store that could not be read is
// shown as unknown and is not counted as having no limit.

import { liveFindingText, liveSummary, type LiveFinding } from "./retentionLive";
import type { Locale } from "./copyLint";
import { button, esc, isSingular } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";
import { limitOf, retentionCounts, type RetentionCounts, type RetentionRow, type WhenFull } from "./retentionRegister";

const NBSP = " ";

const MIB = 1024 * 1024;
const KIB = 1024;

/** A size in plain units. A whole number of megabytes is written as one, anything else with one decimal place. */
export function formatBytes(locale: Locale, bytes: number): string {
  const unit = locale === "fr" ? { mb: "Mo", kb: "Ko", b: "octets" } : { mb: "MB", kb: "KB", b: "bytes" };
  const dec = (n: number): string => {
    const t = Number.isInteger(n) ? String(n) : n.toFixed(1);
    return locale === "fr" ? t.replace(".", ",") : t;
  };
  if (bytes >= MIB) return `${dec(bytes / MIB)}${NBSP}${unit.mb}`;
  if (bytes >= KIB) return `${dec(bytes / KIB)}${NBSP}${unit.kb}`;
  return `${bytes}${NBSP}${unit.b}`;
}

export const RETENTION_STRINGS = {
  en: {
    heading: "How long the App keeps things",
    note: "This lists what the App keeps on this device and what its code sets for each: an end date, a limit on how many items, or a limit on how much space. Where none was found in the code that saves it, the list says so. That is what was read, not a promise about later versions.",
    caption: "What is kept, how long and how much",
    columns: { what: "What is kept", how: "How long", size: "How much" },
    days: (n: number): string => `Expires ${n} ${n === 1 ? "day" : "days"} after the latest save.`,
    noDays: "No end date found in the code.",
    count: (n: number, unit: string, full: WhenFull): string => `Up to ${n} ${unit}. When full, ${full === "oldest-removed" ? "the oldest are removed" : "new ones are refused"}.`,
    bytes: (size: string, about: string, full: WhenFull): string => `Up to ${size} of ${about}. When full, ${full === "oldest-removed" ? "the oldest are removed" : "new ones are refused"}.`,
    noSize: "No limit on how many or how much found in the code.",
    unknown: "Unknown",
    unknownWhy: "The code that keeps this is outside what could be read.",
    summary: (c: RetentionCounts): string => {
      const head = `${c.total} stored ${isSingular("en", c.total) ? "item is" : "items are"} listed.`;
      const timed = `${c.timed} ${isSingular("en", c.timed) ? "expires" : "expire"} after a set number of days.`;
      const capped = `${c.capped} ${isSingular("en", c.capped) ? "has" : "have"} a limit on how many or how much.`;
      const none = `For ${c.none}, no limit of either kind was found in the code.`;
      const unknown = c.unknown === 0 ? "" : ` ${c.unknown} could not be read.`;
      return `${head} ${timed} ${capped} ${none}${unknown}`;
    },
    checkButton: "Compare with what is stored now",
    csvButton: "Download this list (CSV)",
    textButton: "Download this list (text)",
    exportHeader: ["Stored under", "What is kept", "How long", "How much", "Files read", "Recorded on"],
    labels: { key: "Stored under", how: "How long", size: "How much", files: "Files read", recorded: "Recorded on" },
    fileTitle: "How long the App keeps things",
    stem: "the-app-how-long-kept",
  },
  fr: {
    heading: "Combien de temps l’App garde les choses",
    note: "Cette liste montre ce que l’App garde sur cet appareil et ce que son code fixe pour chaque élément : une date de fin, une limite du nombre d’éléments ou une limite d’espace. Quand rien n’a été trouvé dans le code qui l’enregistre, la liste le dit. C’est ce qui a été lu, pas une promesse pour les versions futures.",
    caption: "Ce qui est gardé, combien de temps et en quelle quantité",
    columns: { what: "Ce qui est gardé", how: "Combien de temps", size: "Quelle quantité" },
    days: (n: number): string => `Expire ${n} ${n === 1 ? "jour" : "jours"} après la dernière sauvegarde.`,
    noDays: "Aucune date de fin trouvée dans le code.",
    count: (n: number, unit: string, full: WhenFull): string => `Jusqu’à ${n} ${unit}. Quand la limite est atteinte, ${full === "oldest-removed" ? "les éléments les plus anciens sont retirés" : "les nouveaux éléments sont refusés"}.`,
    bytes: (size: string, about: string, full: WhenFull): string => `Jusqu’à ${size} de ${about}. Quand la limite est atteinte, ${full === "oldest-removed" ? "les éléments les plus anciens sont retirés" : "les nouveaux éléments sont refusés"}.`,
    noSize: "Aucune limite de nombre ou de taille trouvée dans le code.",
    unknown: "Inconnu",
    unknownWhy: "Le code qui garde cela est hors de ce qui a pu être lu.",
    summary: (c: RetentionCounts): string => {
      const head = `${c.total} ${isSingular("fr", c.total) ? "élément conservé figure" : "éléments conservés figurent"} dans la liste.`;
      const timed = `${c.timed} ${isSingular("fr", c.timed) ? "expire" : "expirent"} après un nombre de jours fixé.`;
      const capped = `${c.capped} ${isSingular("fr", c.capped) ? "a" : "ont"} une limite de nombre ou de taille.`;
      const none = `Pour ${c.none}, aucune limite de l’un ou l’autre type n’a été trouvée dans le code.`;
      const unknown = c.unknown === 0 ? "" : ` ${c.unknown} ${isSingular("fr", c.unknown) ? "n’a pas pu être lu" : "n’ont pas pu être lus"}.`;
      return `${head} ${timed} ${capped} ${none}${unknown}`;
    },
    checkButton: "Comparer avec ce qui est conservé maintenant",
    csvButton: "Télécharger cette liste (CSV)",
    textButton: "Télécharger cette liste (texte)",
    exportHeader: ["Enregistré sous", "Ce qui est gardé", "Combien de temps", "Quelle quantité", "Fichiers lus", "Date d’inscription"],
    labels: { key: "Enregistré sous", how: "Combien de temps", size: "Quelle quantité", files: "Fichiers lus", recorded: "Date d’inscription" },
    fileTitle: "Combien de temps l’App garde les choses",
    stem: "l-app-duree-de-conservation",
  },
} as const;

export interface RetentionText {
  how: string;
  size: string;
}

/** The two sentences for one row: how long, and how much. */
export function retentionText(locale: Locale, row: RetentionRow): RetentionText {
  const s = RETENTION_STRINGS[locale];
  if (row.limits === "UNKNOWN") return { how: s.unknown, size: s.unknown };
  const days = limitOf(row, "days");
  const count = limitOf(row, "count");
  const bytes = limitOf(row, "bytes");
  const sizeParts: string[] = [];
  if (count !== undefined) sizeParts.push(s.count(count.max, count.unit[locale], count.whenFull));
  if (bytes !== undefined) sizeParts.push(s.bytes(formatBytes(locale, bytes.max), bytes.about[locale], bytes.whenFull));
  return { how: days === undefined ? s.noDays : s.days(days.days), size: sizeParts.length === 0 ? s.noSize : sizeParts.join(" ") };
}

/** Empty when there are no rows, so the section only appears when it has something to say. */
export interface RetentionCheckView {
  compared: number;
  findings: readonly LiveFinding[];
}

function checkHtml(locale: Locale, c: RetentionCheckView): string {
  const items = c.findings.map((f) => `<li>${esc(liveFindingText(locale, f))}</li>`).join("");
  return `<div role="status" data-privacy-retention-check><p>${esc(liveSummary(locale, c.compared, c.findings.length))}</p>${items === "" ? "" : `<ul>${items}</ul>`}</div>`;
}

/** Empty when there are no rows, so the section only appears when it has something to say. `check` is the result of comparing with what is stored; null before the person asks. */
export function renderRetentionHtml(locale: Locale, rows: readonly RetentionRow[], check: RetentionCheckView | null = null): string {
  if (rows.length === 0) return "";
  const s = RETENTION_STRINGS[locale];
  const label = (name: string, text: string): string => `<span data-label="${esc(name)}">${esc(text)}</span>`;
  const body = rows
    .map((r) => {
      const t = retentionText(locale, r);
      return `<tr><th scope="row">${label(s.columns.what, r.holds[locale])}</th><td>${label(s.columns.how, t.how)}</td><td>${label(s.columns.size, t.size)}</td></tr>`;
    })
    .join("");
  const table = `<table><caption>${esc(s.caption)}</caption><thead><tr><th scope="col">${esc(s.columns.what)}</th><th scope="col">${esc(s.columns.how)}</th><th scope="col">${esc(s.columns.size)}</th></tr></thead><tbody>${body}</tbody></table>`;
  const unknown = rows.some((r) => r.limits === "UNKNOWN") ? `<p>${esc(s.unknownWhy)}</p>` : "";
  return (
    `<div data-privacy-retention role="group" aria-labelledby="privacy-retention-title"><h3 id="privacy-retention-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.summary(retentionCounts(rows)))}</p>${unknown}${table}` +
    `<div>${button("check-retention", s.checkButton)}${button("export-retention-csv", s.csvButton)}${button("export-retention-text", s.textButton)}</div>${check === null ? "" : checkHtml(locale, check)}</div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function retentionAsCsv(locale: Locale, rows: readonly RetentionRow[], now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = RETENTION_STRINGS[locale];
  const line = (cells: readonly string[]): string => `${cells.map((x) => csvCell(x, delimiter)).join(delimiter)}\r\n`;
  const body = rows
    .map((r) => {
      const t = retentionText(locale, r);
      return line([r.key, r.holds[locale], t.how, t.size, r.files.join(" | "), r.recordedOn]);
    })
    .join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: line(s.exportHeader) + body, count: rows.length };
}

export function retentionAsText(locale: Locale, rows: readonly RetentionRow[], now: Date): ExportFile {
  const s = RETENTION_STRINGS[locale];
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const out: string[] = [s.fileTitle, "", s.note, "", rows.length === 0 ? "" : s.summary(retentionCounts(rows)), ""];
  for (const r of rows) {
    const t = retentionText(locale, r);
    out.push(r.holds[locale]);
    out.push(`  ${s.labels.key}${colon} ${r.key}`, `  ${s.labels.how}${colon} ${t.how}`, `  ${s.labels.size}${colon} ${t.size}`, `  ${s.labels.files}${colon} ${r.files.join(" | ")}`, `  ${s.labels.recorded}${colon} ${r.recordedOn}`, "");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: rows.length };
}
