// Reads the head of the App's start page (index.html) as text and compares what it says with the manifest: the page
// language, the browser colour, the title and the icon. It finds a tag by its name and reads its quoted attributes; it
// does not run the page, does not decode character references (&amp; and the like stay as written), and does not see
// anything a script adds later. Node only (tests and CI), never shipped to the browser.

import type { PwaCompareProblem } from "./pwaCompare";
import { assetPath } from "./pwaCompare";
import { listStrings, setValue, type PwaConfig } from "./pwaModel";

export interface PageHead {
  /** The lang of the html tag, or null when it has none. */
  lang: string | null;
  /** The content of the theme-color meta tag, or null when there is none. */
  themeColor: string | null;
  /** The text of the title, trimmed, or null when there is none. */
  title: string | null;
  /** The href of every link whose rel is icon (or shortcut icon or apple-touch-icon), in order. */
  icons: string[];
  /** How many theme-color tags the page has. */
  themeColorTags: number;
}

const ATTR = /([A-Za-z_:][\w:.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'<>=`]+))/g;

/** The attributes of a tag as written, with names in lower case. A name written twice keeps its first value, as a browser does. */
export function readAttributes(inside: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const m of inside.matchAll(ATTR)) {
    const name = (m[1] as string).toLowerCase();
    if (!out.has(name)) out.set(name, (m[2] ?? m[3] ?? m[4] ?? "") as string);
  }
  return out;
}

/** The text with its comments taken out. A comment that is not closed runs to the end. */
export function stripHtmlComments(html: string): string {
  let out = "";
  let i = 0;
  while (i < html.length) {
    const open = html.indexOf("<!--", i);
    if (open < 0) return out + html.slice(i);
    out += html.slice(i, open);
    const close = html.indexOf("-->", open + 4);
    if (close < 0) return out;
    i = close + 3;
  }
  return out;
}

/** Reads the head facts from the text of a page. Never throws. */
export function readPageHead(html: string): PageHead {
  const text = stripHtmlComments(html);
  let lang: string | null = null;
  let themeColor: string | null = null;
  let themeColorTags = 0;
  const icons: string[] = [];
  for (const m of text.matchAll(/<(html|meta|link)\b([^>]*)>/gi)) {
    const tag = (m[1] as string).toLowerCase();
    const attrs = readAttributes(m[2] as string);
    if (tag === "html" && lang === null && attrs.has("lang")) lang = attrs.get("lang") as string;
    else if (tag === "meta" && (attrs.get("name") ?? "").toLowerCase() === "theme-color") {
      themeColorTags++;
      if (themeColor === null) themeColor = attrs.get("content") ?? "";
    } else if (tag === "link") {
      const rel = (attrs.get("rel") ?? "").toLowerCase().split(/\s+/);
      const href = attrs.get("href");
      if (href !== undefined && (rel.includes("icon") || rel.includes("apple-touch-icon"))) icons.push(href);
    }
  }
  const t = /<title\b[^>]*>([\s\S]*?)<\/title>/i.exec(text);
  return { lang, themeColor, title: t === null ? null : (t[1] as string).trim(), icons, themeColorTags };
}

const same = (a: string, b: string): boolean => a.toLowerCase() === b.toLowerCase();

/** The differences between the head of the page and the manifest. A manifest value that is unknown or absent is not judged. */
export function compareHead(c: PwaConfig, h: PageHead): PwaCompareProblem[] {
  const out: PwaCompareProblem[] = [];
  const m = c.manifest;
  if (m.state !== "read") return out;
  const theme = setValue(m.theme_color);
  if (h.themeColorTags > 1) out.push({ code: "head-theme-differs", key: "theme-color", detail: `the page has ${h.themeColorTags} theme-color tags` });
  if (theme !== null && h.themeColor !== null && !same(theme, h.themeColor)) out.push({ code: "head-theme-differs", key: "theme-color", detail: `the page says ${h.themeColor}; the manifest says ${theme}` });
  if (theme !== null && h.themeColor === null) out.push({ code: "head-theme-differs", key: "theme-color", detail: "the page has no theme-color tag; the manifest has one" });
  const lang = setValue(m.lang);
  if (lang !== null && h.lang !== null && !same(lang.split("-")[0] as string, h.lang.split("-")[0] as string)) out.push({ code: "head-lang-differs", key: "lang", detail: `the page says ${h.lang}; the manifest says ${lang}` });
  if (lang !== null && h.lang === null) out.push({ code: "head-lang-differs", key: "lang", detail: "the page has no lang; the manifest has one" });
  const name = setValue(m.name);
  if (name !== null && h.title !== null && h.title !== name) out.push({ code: "head-title-differs", key: "title", detail: `the page title is ${JSON.stringify(h.title)}; the manifest name is ${JSON.stringify(name)}` });
  const kept = (listStrings(c.includeAssets) ?? []).map(assetPath);
  for (const href of h.icons) {
    if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(href)) {
      out.push({ code: "head-icon-not-kept", key: href, detail: `the page icon ${href} is at another address` });
      continue;
    }
    const p = assetPath(href.split(/[?#]/)[0] as string);
    if (c.includeAssets.state === "set" && listStrings(c.includeAssets) !== null && !kept.includes(p)) out.push({ code: "head-icon-not-kept", key: p, detail: `the page icon ${p} is not in includeAssets` });
  }
  return out.sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}
