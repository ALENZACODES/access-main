// The part of the panel that says what each cache and database found on this device is. The check of
// this device (deviceStorage.ts) lists names; this section pairs each name with the App's own list
// (deviceRegister.ts). A name that is not in that list is shown as unknown, never guessed at, and the
// section says whether the clear button reaches it. It appears only after the device has been checked.

import type { Locale } from "./copyLint";
import type { DescribedDevice, DescribedName } from "./deviceRegister";
import { esc } from "./html";

export const DEVICE_KNOWN_STRINGS = {
  en: {
    heading: "What these names are",
    note: "Each name below was found on this device. The App’s own list says what it holds. A name that is not in that list is shown as unknown: it may belong to another page on this site or to your browser.",
    caches: "Saved files",
    databases: "Saved records",
    columns: { name: "Name", holds: "What it holds", clear: "Removed by the clear button" },
    unknownHolds: "Unknown. The App’s list does not include it.",
    yes: "Yes",
    no: "No",
    browserSilent: "Your browser did not say, so this is unknown.",
    none: "None found.",
    summary: (listed: number, unlisted: number): string =>
      `${listed} ${listed === 1 ? "name matches" : "names match"} the App’s list. ${unlisted} ${unlisted === 1 ? "does" : "do"} not.`,
  },
  fr: {
    heading: "Ce que sont ces noms",
    note: "Chaque nom ci-dessous a été trouvé sur cet appareil. La liste de l’App dit ce qu’il contient. Un nom absent de cette liste est présenté comme inconnu : il peut appartenir à une autre page de ce site ou à votre navigateur.",
    caches: "Fichiers enregistrés",
    databases: "Enregistrements sauvegardés",
    columns: { name: "Nom", holds: "Ce qu’il contient", clear: "Retiré par le bouton d’effacement" },
    unknownHolds: "Inconnu. La liste de l’App ne le comprend pas.",
    yes: "Oui",
    no: "Non",
    browserSilent: "Votre navigateur ne l’a pas dit, donc c’est inconnu.",
    none: "Aucun trouvé.",
    summary: (listed: number, unlisted: number): string =>
      `${listed} ${listed > 1 ? "noms correspondent" : "nom correspond"} à la liste de l’App. ${unlisted} ${unlisted > 1 ? "ne correspondent pas" : "ne correspond pas"}.`,
  },
} as const;

function table(locale: Locale, caption: string, rows: readonly DescribedName[]): string {
  const s = DEVICE_KNOWN_STRINGS[locale];
  const tr = rows
    .map(
      (r) =>
        `<tr><th scope="row"><span data-label="${esc(s.columns.name)}">${esc(r.name)}</span></th>` +
        `<td><span data-label="${esc(s.columns.holds)}">${esc(r.row === null ? s.unknownHolds : r.row.holds[locale])}</span></td>` +
        `<td><span data-label="${esc(s.columns.clear)}">${esc(r.clearable ? s.yes : s.no)}</span></td></tr>`,
    )
    .join("");
  return (
    `<table><caption>${esc(caption)}</caption><thead><tr><th scope="col">${esc(s.columns.name)}</th>` +
    `<th scope="col">${esc(s.columns.holds)}</th><th scope="col">${esc(s.columns.clear)}</th></tr></thead><tbody>${tr}</tbody></table>`
  );
}

function group(locale: Locale, heading: string, rows: readonly DescribedName[] | null): string {
  const s = DEVICE_KNOWN_STRINGS[locale];
  if (rows === null) return `<h4>${esc(heading)}</h4><p>${esc(s.browserSilent)}</p>`;
  if (rows.length === 0) return `<h4>${esc(heading)}</h4><p>${esc(s.none)}</p>`;
  return `<h4>${esc(heading)}</h4>${table(locale, heading, rows)}`;
}

export function countListed(d: DescribedDevice): { listed: number; unlisted: number } {
  const all = [...(d.caches ?? []), ...(d.databases ?? [])];
  const listed = all.filter((r) => r.row !== null).length;
  return { listed, unlisted: all.length - listed };
}

/** Empty before the device has been checked, so the section only appears when it has something to say. */
export function renderDeviceKnownHtml(locale: Locale, d: DescribedDevice | null): string {
  if (d === null) return "";
  const s = DEVICE_KNOWN_STRINGS[locale];
  const c = countListed(d);
  const answered = d.caches !== null || d.databases !== null;
  return (
    `<div data-privacy-device-known role="group" aria-labelledby="privacy-device-known-title"><h3 id="privacy-device-known-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p>${answered ? `<p>${esc(s.summary(c.listed, c.unlisted))}</p>` : ""}` +
    `${group(locale, s.caches, d.caches)}${group(locale, s.databases, d.databases)}</div>`
  );
}
