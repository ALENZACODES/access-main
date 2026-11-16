/**
 * Pure router: URL -> route, with English and French path slugs
 * (/en/search, /fr/recherche, /en/place/{id}, /fr/lieu/{id}). Nothing here touches the
 * DOM or network, so it runs on a server, in a service worker or in tests.
 */
import type { Locale } from "./stateCopy";
import { isPlaceId } from "./placeRecord";

export type RouteName = "search" | "place" | "saved" | "map" | "compare" | "sources" | "settings" | "report";

export const SLUGS: Readonly<Record<RouteName, Readonly<Record<Locale, string>>>> = {
  search: { en: "search", fr: "recherche" },
  place: { en: "place", fr: "lieu" },
  saved: { en: "saved", fr: "enregistres" },
  map: { en: "map", fr: "carte" },
  compare: { en: "compare", fr: "comparer" },
  sources: { en: "sources", fr: "sources" },
  settings: { en: "settings", fr: "parametres" },
  report: { en: "report", fr: "signaler" },
};

export const ROUTE_NAMES = Object.keys(SLUGS) as RouteName[];
const ID_ROUTES: ReadonlySet<RouteName> = new Set<RouteName>(["place", "report"]);

export type Resolved =
  | { readonly kind: "route"; readonly locale: Locale; readonly route: RouteName; readonly id: string | null; readonly query: URLSearchParams }
  | { readonly kind: "redirect"; readonly to: string }
  | { readonly kind: "not-found"; readonly locale: Locale };

export interface HrefOptions {
  readonly id?: string;
  readonly query?: URLSearchParams | string;
}

export function hrefFor(locale: Locale, route: RouteName, opts: HrefOptions = {}): string {
  const base = `/${locale}/${SLUGS[route][locale]}${ID_ROUTES.has(route) && opts.id ? `/${encodeURIComponent(opts.id)}` : ""}`;
  const q = typeof opts.query === "string" ? opts.query : opts.query?.toString() ?? "";
  return q === "" ? base : `${base}?${q.replace(/^\?/, "")}`;
}

function safeDecode(s: string): string | null {
  try {
    return decodeURIComponent(s);
  } catch {
    return null;
  }
}

export function resolveRoute(url: string, preferred: Locale = "en"): Resolved {
  let u: URL;
  try {
    u = new URL(url, "https://app.invalid");
  } catch {
    return { kind: "not-found", locale: preferred };
  }
  const segs = u.pathname.split("/").filter((s) => s !== "").map(safeDecode);
  if (segs.length === 0) return { kind: "redirect", to: hrefFor(preferred, "search") };
  if (segs.some((s) => s === null)) return { kind: "not-found", locale: preferred };
  const [first, slug, id, ...rest] = segs as string[];
  if (first !== "en" && first !== "fr") return { kind: "not-found", locale: preferred };
  const locale: Locale = first;
  if (slug === undefined) return { kind: "redirect", to: hrefFor(locale, "search") };
  const route = ROUTE_NAMES.find((r) => SLUGS[r][locale] === slug);
  if (!route || rest.length > 0) return { kind: "not-found", locale };
  if (ID_ROUTES.has(route)) {
    if (id === undefined || !isPlaceId(id)) return { kind: "not-found", locale };
    return { kind: "route", locale, route, id, query: u.searchParams };
  }
  if (id !== undefined) return { kind: "not-found", locale };
  return { kind: "route", locale, route, id: null, query: u.searchParams };
}

/** The same page in the other language (used for the language switch link). */
export function alternateHref(r: Extract<Resolved, { kind: "route" }>): string {
  const other: Locale = r.locale === "en" ? "fr" : "en";
  return hrefFor(other, r.route, { ...(r.id ? { id: r.id } : {}), query: r.query });
}

/** Choose a language from an Accept-Language header, honouring q-values. */
export function parseAcceptLanguage(header: string | null | undefined): Locale {
  if (!header) return "en";
  const ranked = header
    .split(",")
    .map((part, index) => {
      const [tag = "", ...params] = part.trim().split(";");
      const q = params.map((p) => /^\s*q=(.*?)\s*$/.exec(p)?.[1]).find((x) => x !== undefined);
      return { tag: tag.trim().toLowerCase(), q: q === undefined ? 1 : Number(q), index };
    })
    .filter((x) => x.tag !== "" && Number.isFinite(x.q) && x.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const { tag } of ranked) {
    if (tag === "fr" || tag.startsWith("fr-")) return "fr";
    if (tag === "en" || tag.startsWith("en-")) return "en";
  }
  return "en";
}
