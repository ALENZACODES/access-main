// The part of the panel that shows the counts in glance.ts as small tables, one per group, and the same counts
// as a file. Every figure is counted from the App's own lists. A figure that counts things the App has not
// confirmed says so in its label. Nothing here reads the person's device.

import type { Locale } from "./copyLint";
import { glanceFigures, glanceUnknowns, type GlanceFigure, type GlanceGroup, type GlanceId, type GlanceSources } from "./glance";
import { button, esc } from "./html";
import { csvCell } from "./inventoryExport";
import type { ExportFile } from "./localData";

const NBSP = "\u00a0";

const LABELS: Record<GlanceId, { en: string; fr: string }> = {
  kept: { en: "Things the App saves in this browser", fr: "Éléments que l’App enregistre dans ce navigateur" },
  "kept-asked": { en: "of which are saved only after you say yes", fr: "dont enregistrés seulement après votre accord" },
  "kept-outside": { en: "of which this panel cannot download or erase", fr: "dont ce panneau ne peut ni télécharger ni effacer" },
  "kept-unread": { en: "Places that keep data the check could not read (unknown)", fr: "Endroits qui gardent des données que le contrôle n’a pas pu lire (inconnu)" },
  caches: { en: "Caches kept for offline use", fr: "Caches gardés pour l’usage hors ligne" },
  databases: { en: "Databases on this device", fr: "Bases de données sur cet appareil" },
  "features-used": { en: "Browser features the App uses", fr: "Fonctions du navigateur que l’App utilise" },
  "features-asked": { en: "of which your browser asks you first", fr: "dont votre navigateur vous demande d’abord l’accord" },
  "features-unconfirmed": { en: "of which the App has not confirmed whether your browser asks (unknown)", fr: "dont l’App n’a pas confirmé si votre navigateur le demande (inconnu)" },
  "features-unused": { en: "Powerful browser features the App does not use", fr: "Fonctions puissantes du navigateur que l’App n’utilise pas" },
  pages: { en: "Pages the App links to", fr: "Pages vers lesquelles l’App renvoie" },
  names: { en: "Names inside data formats, which are never contacted", fr: "Noms dans des formats de données, jamais contactés" },
  "request-places": { en: "Places in the code that make network requests", fr: "Endroits du code qui font des requêtes réseau" },
  "request-unknown": { en: "of which the destination is unknown", fr: "dont la destination est inconnue" },
};

export const GLANCE_STRINGS = {
  en: {
    heading: "Privacy at a glance",
    note: "These counts come from the App’s own lists on this page, not from your device. A count marked unknown covers things the App has not confirmed. It is never counted as a yes or a no.",
    groups: { kept: "Saved in this browser", device: "Offline storage", features: "Browser features", addresses: "Web addresses and requests" } as Record<GlanceGroup, string>,
    columns: { what: "What", count: "How many" },
    unconfirmed: (things: number): string => (things === 0 ? "Nothing in these lists is unconfirmed." : `${things} ${things === 1 ? "thing" : "things"} the App has not confirmed. They are shown as unknown.`),
    csvButton: "Download these counts (CSV)",
    textButton: "Download these counts (text)",
    exportHeader: ["Group", "What", "How many", "Not confirmed by the App"],
    yes: "Yes",
    no: "No",
    fileTitle: "Privacy at a glance",
    stem: "the-app-privacy-at-a-glance",
  },
  fr: {
    heading: "La vie privée en un coup d’œil",
    note: "Ces chiffres viennent des listes de l’App sur cette page, pas de votre appareil. Un chiffre marqué inconnu couvre des éléments que l’App n’a pas confirmés. Il n’est jamais compté comme un oui ou un non.",
    groups: { kept: "Enregistré dans ce navigateur", device: "Stockage hors ligne", features: "Fonctions du navigateur", addresses: "Adresses web et requêtes" } as Record<GlanceGroup, string>,
    columns: { what: "Quoi", count: "Combien" },
    unconfirmed: (things: number): string => (things === 0 ? "Rien n’est à confirmer dans ces listes." : `${things} ${things > 1 ? "éléments que l’App n’a pas confirmés" : "élément que l’App n’a pas confirmé"}. ${things > 1 ? "Ils sont indiqués" : "Il est indiqué"} comme inconnu${things > 1 ? "s" : ""}.`),
    csvButton: "Télécharger ces chiffres (CSV)",
    textButton: "Télécharger ces chiffres (texte)",
    exportHeader: ["Groupe", "Quoi", "Combien", "Non confirmé par l’App"],
    yes: "Oui",
    no: "Non",
    fileTitle: "La vie privée en un coup d’œil",
    stem: "l-app-vie-privee-en-un-coup-d-oeil",
  },
} as const;

const GROUPS: readonly GlanceGroup[] = ["kept", "device", "features", "addresses"];

/** Empty when no list was given, so the section only appears when it has something to count. */
export function renderGlanceHtml(locale: Locale, src: GlanceSources): string {
  const figures = glanceFigures(src);
  if (figures.length === 0) return "";
  const s = GLANCE_STRINGS[locale];
  const tables = GROUPS.map((g) => {
    const mine = figures.filter((f) => f.group === g);
    if (mine.length === 0) return "";
    const rows = mine.map((f) => `<tr><th scope="row"><span data-label="${esc(s.columns.what)}">${esc(LABELS[f.id][locale])}</span></th><td><span data-label="${esc(s.columns.count)}">${f.count}</span></td></tr>`).join("");
    return `<table><caption>${esc(s.groups[g])}</caption><thead><tr><th scope="col">${esc(s.columns.what)}</th><th scope="col">${esc(s.columns.count)}</th></tr></thead><tbody>${rows}</tbody></table>`;
  }).join("");
  const u = glanceUnknowns(figures);
  return (
    `<div data-privacy-glance role="group" aria-labelledby="privacy-glance-title"><h3 id="privacy-glance-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><p>${esc(s.unconfirmed(u.things))}</p>${tables}` +
    `<div>${button("export-glance-csv", s.csvButton)}${button("export-glance-text", s.textButton)}</div></div>`
  );
}

function localDate(d: Date): string {
  const p = (n: number): string => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function glanceAsCsv(locale: Locale, src: GlanceSources, now: Date, delimiter: "," | ";" = ","): ExportFile {
  const s = GLANCE_STRINGS[locale];
  const figures = glanceFigures(src);
  const row = (cells: readonly string[]): string => `${cells.map((c) => csvCell(c, delimiter)).join(delimiter)}\r\n`;
  const body = figures.map((f: GlanceFigure) => row([s.groups[f.group], LABELS[f.id][locale], String(f.count), f.unknown ? s.yes : s.no])).join("");
  return { filename: `${s.stem}-${localDate(now)}.csv`, mime: "text/csv", text: row(s.exportHeader) + body, count: figures.length };
}

export function glanceAsText(locale: Locale, src: GlanceSources, now: Date): ExportFile {
  const s = GLANCE_STRINGS[locale];
  const figures = glanceFigures(src);
  const colon = locale === "fr" ? `${NBSP}:` : ":";
  const out: string[] = [s.fileTitle, "", s.unconfirmed(glanceUnknowns(figures).things), ""];
  for (const g of GROUPS) {
    const mine = figures.filter((f) => f.group === g);
    if (mine.length === 0) continue;
    out.push(s.groups[g]);
    for (const f of mine) out.push(`  ${LABELS[f.id][locale]}${colon} ${f.count}`);
    out.push("");
  }
  return { filename: `${s.stem}-${localDate(now)}.txt`, mime: "text/plain", text: `${out.join("\n")}\n`, count: figures.length };
}

export { LABELS as GLANCE_LABELS };
