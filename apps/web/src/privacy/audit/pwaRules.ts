// The rules for the install and offline-cache settings read by pwaModel.ts. Each rule looks at the text of the
// settings only. "No finding" means that none of these rules matched what is written; it does not say what the built
// files contain, how the browser behaves, or that nothing is kept that the person did not expect. A setting that
// cannot be read as a plain value is not judged: it is reported as unknown and stays unknown. Node only (tests and
// CI), never shipped to the browser.

import { containsForbiddenOrg } from "../../../../../packages/shared/test/forbiddenOrg.ts";
import { listStrings, setValue, showVal, type PItem, type PwaConfig, type PwaIcon, type PwaRuntime, type Val } from "./pwaModel";

export const PWA_CODES = [
  "no-pwa-call",
  "options-unknown",
  "read-problem",
  "auto-update",
  "update-mode-unknown",
  "skip-waiting",
  "no-navigate-denylist",
  "data-cached",
  "packs-cached",
  "third-party-cache",
  "any-origin-cache",
  "unbounded-cache",
  "long-max-age",
  "many-entries",
  "runtime-unknown",
  "precache-extension",
  "precache-missing-ignore",
  "manifest-missing",
  "manifest-field",
  "manifest-display",
  "manifest-scope",
  "manifest-icons",
  "manifest-color",
  "manifest-lang",
  "manifest-org",
  "verification-wording",
  "dev-enabled",
] as const;

export type PwaCode = (typeof PWA_CODES)[number];

export interface PwaPolicy {
  /** The update mode that asks the person before a new version takes over. */
  registerType: string;
  /** File endings that may be kept at install. */
  precacheExtensions: readonly string[];
  /** Patterns that must be left out of the files kept at install (the data and the map files). */
  mustIgnore: readonly string[];
  /** Names a rule may use for the address of the data files; a rule for them must not keep them. */
  dataNames: readonly string[];
  /** The address start of the offline packs, which are kept elsewhere on purpose. */
  packsPath: string;
  maxAgeSeconds: number;
  maxEntries: number;
  display: readonly string[];
  requiredFields: readonly string[];
  iconSizes: readonly string[];
}

export const PWA_POLICY: PwaPolicy = {
  registerType: "prompt",
  precacheExtensions: ["js", "css", "html", "svg", "png", "webmanifest"],
  mustIgnore: ["data/**", "**/*.pmtiles"],
  dataNames: ["dataPath"],
  packsPath: "/packs/",
  maxAgeSeconds: 60 * 60 * 24 * 30,
  maxEntries: 200,
  display: ["standalone"],
  requiredFields: ["name", "short_name", "description", "theme_color", "background_color", "display", "start_url", "scope"],
  iconSizes: ["192x192", "512x512"],
};

export interface PwaFinding {
  code: PwaCode;
  path: string;
  line: number;
  detail: string;
}

const find = (c: PwaConfig, code: PwaCode, line: number, detail: string): PwaFinding => ({ code, path: c.path, line, detail });
const lineOfVal = <T>(v: Val<T>, fallback: number): number => (v.state === "absent" ? fallback : v.line);

const NEGATED_PACKS = /!\s*[\w$.]+\.(?:startsWith|includes)\(\s*["']\/packs\/["']\s*\)/;
const THIRD_PARTY = /https?:|\/\/[a-z0-9-]+\.[a-z]{2,}/i;

function isDataPattern(p: PItem | null, p0: PwaPolicy): boolean {
  if (p === null) return false;
  if (p0.dataNames.includes(p.text)) return true;
  return /(^|[^\w])data\\?\//.test(p.text);
}

function mentionsPacks(p: PItem | null, p0: PwaPolicy): boolean {
  return p !== null && p.text.includes(p0.packsPath) && !NEGATED_PACKS.test(p.text);
}

function runtimeFindings(c: PwaConfig, r: PwaRuntime, p0: PwaPolicy): PwaFinding[] {
  const out: PwaFinding[] = [];
  const handler = setValue(r.handler);
  if (r.pattern === null) out.push(find(c, "runtime-unknown", r.line, "a rule has no urlPattern that can be read"));
  if (handler === null) {
    out.push(find(c, "runtime-unknown", lineOfVal(r.handler, r.line), `the handler of a rule is ${showVal(r.handler)}`));
    return out;
  }
  if (handler === "NetworkOnly") return out;
  const where = r.pattern?.line ?? r.line;
  const shown = r.pattern === null ? "(none)" : r.pattern.text;
  if (isDataPattern(r.pattern, p0)) out.push(find(c, "data-cached", where, `${shown} is handled by ${handler}, which keeps what it fetches`));
  if (mentionsPacks(r.pattern, p0)) out.push(find(c, "packs-cached", where, `${shown} reaches ${p0.packsPath} and is handled by ${handler}`));
  if (r.pattern !== null && r.pattern.kind !== "fn" && THIRD_PARTY.test(r.pattern.text)) out.push(find(c, "third-party-cache", where, `${shown} names an address and is handled by ${handler}`));
  if (r.pattern !== null && r.pattern.kind === "fn" && !/\bsameOrigin\b/.test(r.pattern.text)) out.push(find(c, "any-origin-cache", where, `${shown} does not check sameOrigin and is handled by ${handler}`));
  const entries = setValue(r.maxEntries);
  const age = setValue(r.maxAgeSeconds);
  if (r.maxEntries.state === "absent" && r.maxAgeSeconds.state === "absent") out.push(find(c, "unbounded-cache", where, `${handler} keeps pages with no limit on how many or for how long`));
  if (age !== null && age > p0.maxAgeSeconds) out.push(find(c, "long-max-age", lineOfVal(r.maxAgeSeconds, where), `pages are kept up to ${age} s (limit ${p0.maxAgeSeconds} s)`));
  if (entries !== null && entries > p0.maxEntries) out.push(find(c, "many-entries", lineOfVal(r.maxEntries, where), `up to ${entries} pages are kept (limit ${p0.maxEntries})`));
  return out;
}

function extensionsOf(pattern: string): string[] | null {
  const m = /\.(?:\{([^{}]*)\}|([A-Za-z0-9]+))$/.exec(pattern);
  if (m === null) return null;
  const group = m[1];
  const one = m[2];
  if (group !== undefined) return group.split(",").map((x) => x.trim());
  return one === undefined ? null : [one];
}

function iconFindings(c: PwaConfig, icons: PwaIcon[], p0: PwaPolicy): PwaFinding[] {
  const out: PwaFinding[] = [];
  const line = c.manifest.line;
  const has = (size: string, purpose: string): boolean =>
    icons.some((i) => setValue(i.sizes) === size && (setValue(i.purpose) ?? "any") === purpose && i.purpose.state !== "unknown");
  for (const s of p0.iconSizes) if (!has(s, "any")) out.push(find(c, "manifest-icons", line, `no icon of ${s} for any purpose`));
  if (!has("512x512", "maskable")) out.push(find(c, "manifest-icons", line, "no maskable icon of 512x512"));
  for (const i of icons) {
    const src = setValue(i.src);
    if (i.src.state === "absent") out.push(find(c, "manifest-icons", i.line, "an icon has no src"));
    else if (src !== null && /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(src)) out.push(find(c, "manifest-icons", i.line, `the icon ${src} is at another address`));
    if (setValue(i.type) !== null && setValue(i.type) !== "image/png" && setValue(i.type) !== "image/svg+xml") out.push(find(c, "manifest-icons", i.line, `the icon type ${showVal(i.type)} is not an image type the App ships`));
  }
  return out;
}

/** The findings for one configuration, in order of line, then code, then detail. */
export function auditPwa(c: PwaConfig, policy: PwaPolicy = PWA_POLICY): PwaFinding[] {
  const out: PwaFinding[] = [];
  for (const p of c.problems) out.push(find(c, "read-problem", p.line, p.message));
  if (!c.found) {
    out.push(find(c, "no-pwa-call", 0, "no call of VitePWA is written in the file"));
    return sort(out);
  }
  if (c.options !== "read") {
    out.push(find(c, "options-unknown", c.line, `the options of VitePWA are ${c.options === "absent" ? "not written" : "not written out and not found in the file"}`));
    return sort(out);
  }

  if (c.registerType.state === "set" && c.registerType.value !== policy.registerType)
    out.push(find(c, c.registerType.value === "autoUpdate" ? "auto-update" : "update-mode-unknown", c.registerType.line, `registerType is ${showVal(c.registerType)}; the App asks first (${JSON.stringify(policy.registerType)})`));
  else if (c.registerType.state === "unknown") out.push(find(c, "update-mode-unknown", c.registerType.line, `registerType is ${showVal(c.registerType)}`));
  if (c.devEnabled.state === "set" && c.devEnabled.value) out.push(find(c, "dev-enabled", c.devEnabled.line, "the service worker is switched on while developing"));

  const w = c.workbox;
  if (w.state === "read") {
    if (w.skipWaiting.state === "set" && w.skipWaiting.value) out.push(find(c, "skip-waiting", w.skipWaiting.line, "skipWaiting is true: a new version takes over without asking"));
    const globs = listStrings(w.globPatterns);
    if (globs !== null) {
      for (const g of w.globPatterns.state === "set" ? w.globPatterns.items : []) {
        const ext = extensionsOf(g.text);
        if (ext === null) out.push(find(c, "precache-extension", g.line, `the pattern ${JSON.stringify(g.text)} does not end in file endings the reader can list`));
        else for (const e of ext) if (!policy.precacheExtensions.includes(e)) out.push(find(c, "precache-extension", g.line, `.${e} files are kept at install (${JSON.stringify(g.text)})`));
      }
    } else if (w.globPatterns.state === "set") out.push(find(c, "precache-extension", w.globPatterns.line, "a pattern of the files kept at install is not a plain string"));
    const ignores = listStrings(w.globIgnores);
    if (w.globIgnores.state === "absent") for (const m of policy.mustIgnore) out.push(find(c, "precache-missing-ignore", w.line, `globIgnores is not written, so ${JSON.stringify(m)} is not left out of the install`));
    else if (ignores !== null) for (const m of policy.mustIgnore) if (!ignores.includes(m)) out.push(find(c, "precache-missing-ignore", w.globIgnores.state === "set" ? w.globIgnores.line : w.line, `${JSON.stringify(m)} is not left out of the files kept at install`));
    if (w.navigateFallback.state === "set") {
      const deny = w.denylist;
      const mentions = deny.state === "set" && deny.items.some((i) => i.text.includes(policy.packsPath) || i.text.includes("packs"));
      if (!mentions && deny.state !== "unknown") out.push(find(c, "no-navigate-denylist", w.navigateFallback.line, `the fallback page is used for ${policy.packsPath} too`));
    }
    if (w.runtime === "unknown") out.push(find(c, "runtime-unknown", w.line, "runtimeCaching is not written out as a list"));
    else if (w.runtime !== "absent") for (const r of w.runtime) out.push(...runtimeFindings(c, r, policy));
  } else if (w.state === "unknown") out.push(find(c, "runtime-unknown", w.line, "the workbox settings are not written out"));

  out.push(...manifestFindings(c, policy));
  return sort(out);
}

const COLOR = /^#[0-9a-fA-F]{6}$/;
const LANG = /^[a-z]{2,3}(?:-[A-Z][A-Za-z]{1,3})?$/;
const VERIF = /v[ée]rif/i;

function manifestFindings(c: PwaConfig, policy: PwaPolicy): PwaFinding[] {
  const out: PwaFinding[] = [];
  const m = c.manifest;
  if (m.state === "absent") return [find(c, "manifest-missing", c.line, "no manifest is written in the options")];
  if (m.state === "unknown") return [find(c, "manifest-missing", m.line, "the manifest is not written out and cannot be read")];
  const fields: Record<string, Val<string>> = { name: m.name, short_name: m.short_name, description: m.description, theme_color: m.theme_color, background_color: m.background_color, display: m.display, start_url: m.start_url, scope: m.scope };
  for (const f of policy.requiredFields) if ((fields[f] as Val<string>).state === "absent") out.push(find(c, "manifest-field", m.line, `the manifest has no ${f}`));
  if (m.icons === "absent") out.push(find(c, "manifest-field", m.line, "the manifest has no icons"));
  else if (m.icons !== "unknown") out.push(...iconFindings(c, m.icons, policy));
  const display = setValue(m.display);
  if (display !== null && !policy.display.includes(display)) out.push(find(c, "manifest-display", m.display.state === "set" ? m.display.line : m.line, `display is ${JSON.stringify(display)}`));
  const start = setValue(m.start_url);
  const scope = setValue(m.scope);
  if (start !== null && scope !== null && start !== scope) out.push(find(c, "manifest-scope", lineOfVal(m.scope, m.line), `start_url ${JSON.stringify(start)} and scope ${JSON.stringify(scope)} differ`));
  else if (m.start_url.state === "unknown" && m.scope.state === "unknown" && m.start_url.shown !== m.scope.shown) out.push(find(c, "manifest-scope", lineOfVal(m.scope, m.line), `start_url (${m.start_url.shown}) and scope (${m.scope.shown}) are written differently`));
  for (const k of ["theme_color", "background_color"] as const) {
    const v = setValue(m[k]);
    if (v !== null && !COLOR.test(v)) out.push(find(c, "manifest-color", lineOfVal(m[k], m.line), `${k} is ${JSON.stringify(v)}, not a six-digit colour`));
  }
  const lang = setValue(m.lang);
  if (m.lang.state === "absent") out.push(find(c, "manifest-lang", m.line, "the manifest has no lang"));
  else if (lang !== null && !LANG.test(lang)) out.push(find(c, "manifest-lang", lineOfVal(m.lang, m.line), `lang is ${JSON.stringify(lang)}`));
  for (const k of ["name", "short_name", "description"] as const) {
    const v = setValue(m[k]);
    if (v === null) continue;
    if (containsForbiddenOrg(v)) out.push(find(c, "manifest-org", lineOfVal(m[k], m.line), `${k} names a body the App does not name`));
    if (VERIF.test(v)) out.push(find(c, "verification-wording", lineOfVal(m[k], m.line), `${k} uses a word the App's copy does not use`));
  }
  return out;
}

function sort(f: PwaFinding[]): PwaFinding[] {
  return [...f].sort((a, b) => a.line - b.line || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0) || (a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0));
}

/** One finding as one line. */
export function formatPwaFinding(f: PwaFinding): string {
  return `${f.path}:${f.line} ${f.code}: ${f.detail}`;
}
