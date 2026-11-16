/**
 * Accessibility and copy audit for rendered HTML strings. Dependency-free so it runs
 * anywhere tests run. Each check returns violations rather than throwing; use
 * assertAccessibleHtml in tests so a violation fails the build.
 */
import type { Locale } from "./stateCopy";
import { MIN_TARGET_PX, contrastRatio, AA_TEXT } from "./contrast";
import { lintCopy } from "./copyLint";

export type HtmlViolationCode =
  | "target-size"
  | "button-name"
  | "lang-mismatch"
  | "region-name"
  | "dangling-labelledby"
  | "missing-heading"
  | "img-alt"
  | "inline-script"
  | "contrast"
  | "duplicate-id"
  | "copy"
  | "inferred-accessibility";

export interface HtmlViolation {
  readonly code: HtmlViolationCode;
  readonly detail: string;
}

interface Tag {
  readonly name: string;
  readonly attrs: Readonly<Record<string, string>>;
}

function parseTags(html: string): Tag[] {
  const tags: Tag[] = [];
  for (const m of html.matchAll(/<([a-zA-Z][a-zA-Z0-9]*)\b([^>]*)>/g)) {
    const attrs: Record<string, string> = {};
    for (const a of m[2]!.matchAll(/([a-zA-Z][a-zA-Z0-9:-]*)(?:="([^"]*)")?/g)) attrs[a[1]!.toLowerCase()] = a[2] ?? "";
    tags.push({ name: m[1]!.toLowerCase(), attrs });
  }
  return tags;
}

export function decodeEntities(s: string): string {
  return s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function textNodes(html: string): string[] {
  return html
    .split(/<[^>]*>/)
    .map((t) => decodeEntities(t).trim())
    .filter((t) => t !== "");
}

function parseStyle(style: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const decl of style.split(";")) {
    const i = decl.indexOf(":");
    if (i > 0) out[decl.slice(0, i).trim().toLowerCase()] = decl.slice(i + 1).trim();
  }
  return out;
}

function px(v: string | undefined): number {
  const m = /^(\d+(?:\.\d+)?)px$/.exec(v ?? "");
  return m ? Number(m[1]) : 0;
}

const INFERENCE = /\b(probably|likely accessible|presumably|assumed|assume)\b|probablement|vraisemblablement|présumé/i;

export function auditHtml(html: string, locale: Locale): HtmlViolation[] {
  const out: HtmlViolation[] = [];
  const add = (code: HtmlViolationCode, detail: string): void => void out.push({ code, detail });
  const tags = parseTags(html);

  const ids = new Map<string, number>();
  for (const t of tags) if (t.attrs.id !== undefined) ids.set(t.attrs.id, (ids.get(t.attrs.id) ?? 0) + 1);
  for (const [id, n] of ids) if (n > 1) add("duplicate-id", id);

  let regions = 0;
  for (const t of tags) {
    const style = parseStyle(t.attrs.style ?? "");

    if (t.name === "button" || t.name === "summary") {
      const w = px(style["min-width"]);
      const h = px(style["min-height"]);
      // summary spans the row width, so only its height needs to be set explicitly
      if (h < MIN_TARGET_PX || (t.name === "button" && w < MIN_TARGET_PX)) add("target-size", `<${t.name}>`);
    }
    if (t.name === "section" || t.name === "article") {
      regions++;
      if (t.attrs.lang !== locale) add("lang-mismatch", `<${t.name}> lang=${t.attrs.lang ?? "(none)"}`);
      const labelledby = t.attrs["aria-labelledby"];
      if (!labelledby && !t.attrs["aria-label"]) add("region-name", `<${t.name}>`);
      if (labelledby && !ids.has(labelledby)) add("dangling-labelledby", labelledby);
    }
    if (t.name === "img" && !("alt" in t.attrs)) add("img-alt", "<img>");
    if (t.name === "script" || Object.keys(t.attrs).some((a) => a.startsWith("on"))) add("inline-script", t.name);

    const fg = style.color;
    const bg = style.background ?? style["background-color"];
    if (fg && bg) {
      const r = contrastRatio(fg, bg);
      if (r === null || r < AA_TEXT) add("contrast", `${fg} on ${bg}`);
    }
  }

  if (regions > 0 && !/<h[1-6]\b/i.test(html)) add("missing-heading", "no heading in region");

  for (const m of html.matchAll(/<(button|summary)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
    if (m[2]!.replace(/<[^>]*>/g, "").trim() === "") add("button-name", `<${m[1]!}>`);
  }

  const texts = [...textNodes(html), ...tags.map((t) => t.attrs["aria-label"]).filter((x): x is string => !!x)];
  for (const text of texts) {
    for (const issue of lintCopy(text, locale)) add("copy", `${issue}: ${text}`);
    if (INFERENCE.test(text)) add("inferred-accessibility", text);
  }
  return out;
}

export class AccessibilityAuditError extends Error {
  constructor(readonly violations: readonly HtmlViolation[]) {
    super(`HTML audit failed: ${violations.map((v) => `${v.code} (${v.detail})`).join("; ")}`);
    this.name = "AccessibilityAuditError";
  }
}

/** Throws AccessibilityAuditError when the HTML has any violation. */
export function assertAccessibleHtml(html: string, locale: Locale): void {
  const v = auditHtml(html, locale);
  if (v.length > 0) throw new AccessibilityAuditError(v);
}
