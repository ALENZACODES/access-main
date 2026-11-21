// The part of the panel that is honest about what Erase and Download do not reach. The panel acts on
// its prefix and on the exact extra names it is given. Anything else the App keeps in this browser is
// listed here in plain words, with a way to remove it that does not depend on the App.

import type { Locale } from "./copyLint";
import { inScope, prefixScope, type DataScope } from "./dataScope";
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
    note: "The App also keeps the items below on this device. The “Erase data on this device” button does not remove them, and “Download my data” does not include them. To remove them, clear this site’s data in your browser settings.",
    unconfirmed: "The App has not confirmed where this is kept, so the erase button may not remove it.",
  },
  fr: {
    heading: "Aussi conservé sur cet appareil",
    note: "L’App conserve aussi les éléments ci-dessous sur cet appareil. Le bouton « Effacer les données de cet appareil » ne les retire pas et « Télécharger mes données » ne les inclut pas. Pour les retirer, effacez les données de ce site dans les paramètres de votre navigateur.",
    unconfirmed: `L’App n’a pas confirmé où cela est conservé${NBSP}: le bouton d’effacement pourrait ne pas le retirer.`,
  },
} as const;

/**
 * The items the panel's data scope does not reach: registered keys that are not in the scope, plus
 * storage whose key is unknown. Order follows the register, then the unscanned list.
 */
export function outsideItemsForScope(register: readonly RegisterRow[], unscanned: readonly UnscannedRow[], scope: DataScope): OutsideItem[] {
  return [
    ...register.filter((r) => !inScope(scope, r.key)).map((r) => ({ holds: r.holds, unconfirmed: false })),
    ...unscanned.map((u) => ({ holds: u.holds, unconfirmed: true })),
  ];
}

/** The same list for a panel that covers only the names under `prefix`. */
export function outsideItems(register: readonly RegisterRow[], unscanned: readonly UnscannedRow[], prefix: string): OutsideItem[] {
  return outsideItemsForScope(register, unscanned, prefixScope(prefix));
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
