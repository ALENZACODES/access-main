// The privacy page's address, title and link. The App's own shell and router
// import these so the page, the link to it and the document title never drift
// apart. English and French each have their own address.

import type { Locale } from "./copyLint";
import { TARGET_STYLE, esc } from "./html";

export const ROUTE_PATHS: Readonly<Record<Locale, string>> = {
  en: "/privacy",
  fr: "/confidentialite",
};

export const PAGE_TITLES: Readonly<Record<Locale, string>> = {
  en: "Privacy and your data on this device",
  fr: "Confidentialité et vos données sur cet appareil",
};

export const LINK_LABELS: Readonly<Record<Locale, string>> = {
  en: "Privacy and your data",
  fr: "Confidentialité et vos données",
};

/** The hash (#/privacy or #/confidentialite) that shows the page in a language. */
export function routeHref(locale: Locale): string {
  return `#${ROUTE_PATHS[locale]}`;
}

/** Which language's address a location hash is, or null if it is not the privacy page. */
export function matchRoute(hash: string): Locale | null {
  let h = hash.startsWith("#") ? hash.slice(1) : hash;
  if (h.startsWith("!")) h = h.slice(1);
  const cut = h.search(/[?#]/);
  if (cut >= 0) h = h.slice(0, cut);
  if (h.length > 1 && h.endsWith("/")) h = h.slice(0, -1);
  h = h.toLowerCase();
  if (h === ROUTE_PATHS.en) return "en";
  if (h === ROUTE_PATHS.fr) return "fr";
  return null;
}

/** A link for the App's navigation or footer, at least 44 x 44 px. */
export function renderPrivacyLinkHtml(locale: Locale): string {
  return `<a href="${esc(routeHref(locale))}" lang="${locale}" style="display:inline-flex;align-items:center;${TARGET_STYLE}">${esc(LINK_LABELS[locale])}</a>`;
}
