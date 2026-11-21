/**
 * Full-page shell: document language and title, a skip link, labelled landmarks, a
 * language switch, a zoomable viewport and a visible focus style. Route markup goes
 * inside <main>. auditPage() checks all of this.
 */
import { type Locale } from "./stateCopy";
import { MIN_TARGET_PX, STATE_PALETTE, styleFor, type Theme } from "./contrast";
import { message } from "./messages";
import { type Preferences, rootStyle } from "./preferences";
import { escapeHtml, linkStyle } from "./renderHtml";
import { type RouteName, hrefFor } from "./router";

export interface PageOptions {
  readonly locale: Locale;
  readonly current: RouteName | null;
  /** Text of the single <h1>; also used in <title>. */
  readonly heading: string;
  readonly body: string;
  /** Link to this page in the other language, or null to link to the other language's start page. */
  readonly alternateHref: string | null;
  readonly preferences: Preferences;
}

export function themeFor(p: Preferences): Theme {
  return p.theme === "dark" ? "dark" : "light";
}

const NAV: readonly { readonly route: RouteName; readonly label: "nav.search" | "nav.map" | "nav.saved" | "nav.compare" | "nav.coverage" | "nav.sources" | "nav.settings" }[] = [
  { route: "search", label: "nav.search" },
  { route: "map", label: "nav.map" },
  { route: "saved", label: "nav.saved" },
  { route: "compare", label: "nav.compare" },
  { route: "coverage", label: "nav.coverage" },
  { route: "sources", label: "nav.sources" },
  { route: "settings", label: "nav.settings" },
];

export function renderPage(o: PageOptions): string {
  const L = o.locale;
  const theme = themeFor(o.preferences);
  const pal = STATE_PALETTE[theme];
  const otherLocale: Locale = L === "en" ? "fr" : "en";
  const alt = o.alternateHref ?? hrefFor(otherLocale, "search");
  const link = linkStyle(theme);

  const nav = NAV.map(({ route, label }) => {
    const current = route === o.current ? ' aria-current="page"' : "";
    return `<li style="display:inline-block"><a href="${escapeHtml(hrefFor(L, route))}"${current} style="${link};padding:0 12px">${escapeHtml(message(label, L))}</a></li>`;
  }).join("");

  const motion = o.preferences.reduceMotion
    ? "*{animation:none!important;transition:none!important;scroll-behavior:auto!important}"
    : "@media (prefers-reduced-motion:reduce){*{animation:none!important;transition:none!important;scroll-behavior:auto!important}}";
  const css =
    `:focus-visible{outline:3px solid ${pal.focusRing};outline-offset:2px}` +
    `.skip{position:absolute;left:-999px}.skip:focus{left:8px;top:8px}` + motion;

  const title = `${o.heading} – ${message("app.name", L)}`;
  return (
    `<!doctype html><html lang="${L}" style="${rootStyle(o.preferences)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1">` +
    `<title>${escapeHtml(title)}</title><meta name="theme-color" content="${pal.roles.body.bg}"><link rel="manifest" href="/manifest.webmanifest"><script src="/register-sw.js" defer></script><style>${css}</style></head>` +
    `<body style="${styleFor("body", theme)}">` +
    `<a class="skip" href="#main" style="${link}">${escapeHtml(message("nav.skip", L))}</a>` +
    `<header style="${styleFor("body", theme)}"><nav aria-label="${escapeHtml(message("nav.main", L))}"><ul style="list-style:none;margin:0;padding:0">${nav}</ul></nav>` +
    `<a href="${escapeHtml(alt)}" hreflang="${otherLocale}" lang="${otherLocale}" style="${link};padding:0 12px;min-width:${MIN_TARGET_PX}px">${otherLocale === "fr" ? "Français" : "English"}</a></header>` +
    `<main id="main" tabindex="-1" style="${styleFor("body", theme)}"><h1>${escapeHtml(o.heading)}</h1>${o.body}</main>` +
    `<footer style="${styleFor("status", theme)}"><p>${escapeHtml(message("footer.note", L))}</p></footer>` +
    `</body></html>`
  );
}
