// The part of the panel that is honest about what Erase and Download do not reach. The panel acts
// only on names that start with its prefix. Anything else the App keeps in this browser is listed
// here in plain words, with a way to remove it that does not depend on the App.

import type { Locale } from "./copyLint";
import { esc } from "./html";
import type { Bilingual } from "./inventory";
import type { RegisterRow, UnscannedRow } from "./storageRegister";

export interface OutsideItem {
  holds: Bilingual;
  /** True when the App has not confirmed where this is kept */
  unconfirmed: boolean;
}

const NBSP = " ";

export const OUTSIDE_STRINGS = {
  en: {
    heading: "Also kept on this device",
    note: "The “Download my data” and “Erase data on this device” buttons act only on the items listed in the table. The App also keeps the items below. The erase button does not remove them. To remove them, clear this site’s data in your browser settings.",
    unconfirmed: "The App has not confirmed where this is kept, so the erase button may not remove it.",
  },
  fr: {
    heading: "Aussi conservé sur cet appareil",
    note: "Les boutons « Télécharger mes données » et « Effacer les données de cet appareil » n’agissent que sur les éléments du tableau. L’App conserve aussi les éléments ci-dessous. Le bouton d’effacement ne les retire pas. Pour les retirer, effacez les données de ce site dans les paramètres de votre navigateur.",
    unconfirmed: `L’App n’a pas confirmé où cela est conservé${NBSP}: le bouton d’effacement pourrait ne pas le retirer.`,
  },
} as const;

/**
 * The items the panel's prefix does not reach: registered keys that do not start with the prefix,
 * plus storage whose key is unknown. Order follows the register, then the unscanned list.
 */
export function outsideItems(register: readonly RegisterRow[], unscanned: readonly UnscannedRow[], prefix: string): OutsideItem[] {
  return [
    ...register.filter((r) => !r.key.startsWith(prefix)).map((r) => ({ holds: r.holds, unconfirmed: false })),
    ...unscanned.map((u) => ({ holds: u.holds, unconfirmed: true })),
  ];
}

/** Empty when there is nothing outside the prefix, so the section only appears when it has something to say. */
export function renderOutsideHtml(locale: Locale, items: readonly OutsideItem[]): string {
  if (items.length === 0) return "";
  const s = OUTSIDE_STRINGS[locale];
  const li = items
    .map((i) => `<li>${esc(i.holds[locale])}${i.unconfirmed ? ` <span data-outside-unconfirmed>${esc(s.unconfirmed)}</span>` : ""}</li>`)
    .join("");
  return (
    `<div data-privacy-outside role="group" aria-labelledby="privacy-outside-title"><h3 id="privacy-outside-title">${esc(s.heading)}</h3>` +
    `<p>${esc(s.note)}</p><ul>${li}</ul></div>`
  );
}
