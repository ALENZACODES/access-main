// Compares the install and offline-cache settings read from the configuration with the register, the findings with the
// accepted list, and the picture files with what the manifest says about them. It reads nothing itself. Node only
// (tests and CI), never shipped to the browser.

import { readPngSize, sizeText } from "./pngHeader";
import { listStrings, showList, showVal, type PItem, type PList, type PwaConfig, type PwaRuntime, type Val } from "./pwaModel";
import { PWA_ACCEPTABLE, type PwaAcceptRow, type PwaRegister } from "./pwaRegister";
import type { PwaFinding } from "./pwaRules";

export type PwaProblemCode =
  | "setting-changed"
  | "setting-added"
  | "setting-gone"
  | "finding-not-accepted"
  | "accepted-gone"
  | "count-changed"
  | "unacceptable-code"
  | "asset-missing"
  | "icon-not-png"
  | "icon-size-differs"
  | "icon-not-square"
  | "head-theme-differs"
  | "head-lang-differs"
  | "head-title-differs"
  | "head-icon-not-kept";

export interface PwaCompareProblem {
  code: PwaProblemCode;
  key: string;
  detail: string;
}

const text = <T>(v: Val<T>): string => {
  if (v.state === "absent") return "absent";
  if (v.state === "unknown") return `unknown:${v.shown}`;
  return String(v.value);
};

const listText = (l: PList): string => {
  if (l.state === "absent") return "absent";
  if (l.state === "unknown") return `unknown:${l.shown}`;
  return JSON.stringify(l.items.map((i: PItem) => i.text));
};

function runtimeText(r: PwaRuntime): string {
  const pattern = r.pattern === null ? "absent" : r.pattern.kind === "fn" ? "function" : r.pattern.text;
  return [pattern, text(r.handler), text(r.cacheName), text(r.networkTimeoutSeconds), text(r.maxEntries), text(r.maxAgeSeconds)].join("|");
}

/** The settings of a configuration as one text per setting, the form the register uses. */
export function flattenConfig(c: PwaConfig): Record<string, string> {
  const out: Record<string, string> = {};
  if (!c.found || c.options !== "read") return out;
  out["registerType"] = text(c.registerType);
  out["includeAssets"] = listText(c.includeAssets);
  const m = c.manifest;
  if (m.state === "read") {
    out["manifest.background_color"] = text(m.background_color);
    out["manifest.display"] = text(m.display);
    out["manifest.lang"] = text(m.lang);
    out["manifest.scope"] = text(m.scope);
    out["manifest.start_url"] = text(m.start_url);
    out["manifest.theme_color"] = text(m.theme_color);
    out["manifest.icons"] = m.icons === "absent" ? "absent" : m.icons === "unknown" ? "unknown:icons" : JSON.stringify(m.icons.map((i) => `${text(i.src)}|${text(i.sizes)}|${i.purpose.state === "absent" ? "any" : text(i.purpose)}`));
  }
  const w = c.workbox;
  if (w.state === "read") {
    out["workbox.cleanupOutdatedCaches"] = text(w.cleanupOutdatedCaches);
    out["workbox.clientsClaim"] = text(w.clientsClaim);
    out["workbox.denylist"] = listText(w.denylist);
    out["workbox.globIgnores"] = listText(w.globIgnores);
    out["workbox.globPatterns"] = listText(w.globPatterns);
    out["workbox.navigateFallback"] = text(w.navigateFallback);
    out["workbox.skipWaiting"] = text(w.skipWaiting);
    if (w.runtime === "absent") out["workbox.runtime.count"] = "0";
    else if (w.runtime === "unknown") out["workbox.runtime.count"] = "unknown:runtimeCaching";
    else {
      out["workbox.runtime.count"] = String(w.runtime.length);
      w.runtime.forEach((r, i) => (out[`workbox.runtime.${i}`] = runtimeText(r)));
    }
  }
  return out;
}

const byKey = (a: PwaCompareProblem, b: PwaCompareProblem): number => (a.key < b.key ? -1 : a.key > b.key ? 1 : a.code < b.code ? -1 : a.code > b.code ? 1 : 0);

/** The differences between the settings read from the file and the register, in key order. */
export function compareSettings(c: PwaConfig, reg: PwaRegister): PwaCompareProblem[] {
  const found = flattenConfig(c);
  const out: PwaCompareProblem[] = [];
  if (!c.found) return [{ code: "setting-gone", key: "VitePWA", detail: `no call of VitePWA in ${c.path}` }];
  if (c.path !== reg.path) out.push({ code: "setting-changed", key: "path", detail: `read ${c.path}, register is for ${reg.path}` });
  for (const [k, expected] of Object.entries(reg.settings)) {
    const got = found[k];
    if (got === undefined) out.push({ code: "setting-gone", key: k, detail: `the register has ${expected}; the file has nothing readable for it` });
    else if (got !== expected) out.push({ code: "setting-changed", key: k, detail: `register ${expected}; file ${got}` });
  }
  for (const [k, got] of Object.entries(found)) if (!(k in reg.settings)) out.push({ code: "setting-added", key: k, detail: `the file has ${got}; the register does not list it` });
  return out.sort(byKey);
}

/** Counts findings by path and code. */
export function countFindings(f: readonly PwaFinding[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const x of f) m.set(`${x.path}\u0000${x.code}`, (m.get(`${x.path}\u0000${x.code}`) ?? 0) + 1);
  return m;
}

/** The differences between the findings and the accepted list: a finding not accepted, an accepted one gone or changed in number. */
export function compareAccepted(findings: readonly PwaFinding[], accepted: readonly PwaAcceptRow[]): PwaCompareProblem[] {
  const counts = countFindings(findings);
  const out: PwaCompareProblem[] = [];
  const listed = new Set<string>();
  for (const a of accepted) {
    const id = `${a.path}\u0000${a.code}`;
    listed.add(id);
    if (!PWA_ACCEPTABLE.includes(a.code)) out.push({ code: "unacceptable-code", key: `${a.path} ${a.code}`, detail: `${a.code} may not be accepted` });
    const n = counts.get(id) ?? 0;
    if (n === 0) out.push({ code: "accepted-gone", key: `${a.path} ${a.code}`, detail: `accepted ×${a.count} but no longer found; remove it from the list` });
    else if (n !== a.count) out.push({ code: "count-changed", key: `${a.path} ${a.code}`, detail: `accepted ×${a.count}, found ×${n}` });
  }
  for (const [id, n] of counts) {
    if (listed.has(id)) continue;
    const [path, code] = id.split("\u0000") as [string, string];
    out.push({ code: "finding-not-accepted", key: `${path} ${code}`, detail: `${n} finding${n === 1 ? "" : "s"} not on the accepted list` });
  }
  return out.sort(byKey);
}

/** The folder-relative path of an asset named in the configuration: no leading ./ or /. */
export function assetPath(src: string): string {
  return src.replace(/^(?:\.\/)+/, "").replace(/^\/+/, "");
}

/** The assets the configuration names (the extra files and the icons), each once, in order of first mention. */
export function namedAssets(c: PwaConfig): string[] {
  const out: string[] = [];
  const add = (s: string): void => {
    const p = assetPath(s);
    if (!out.includes(p)) out.push(p);
  };
  for (const s of listStrings(c.includeAssets) ?? []) add(s);
  if (c.manifest.state === "read" && c.manifest.icons !== "absent" && c.manifest.icons !== "unknown") for (const i of c.manifest.icons) if (i.src.state === "set") add(i.src.value);
  return out;
}

/** Compares the named assets with the files: each must be there, and each icon must be a PNG of the size the manifest gives. */
export function compareAssets(c: PwaConfig, files: ReadonlyMap<string, Uint8Array | null>): PwaCompareProblem[] {
  const out: PwaCompareProblem[] = [];
  for (const p of namedAssets(c)) {
    const f = files.get(p);
    if (f === undefined || f === null) out.push({ code: "asset-missing", key: p, detail: `${p} is named in the configuration and is not in the public folder` });
  }
  if (c.manifest.state === "read" && c.manifest.icons !== "absent" && c.manifest.icons !== "unknown") {
    for (const i of c.manifest.icons) {
      if (i.src.state !== "set" || i.sizes.state !== "set") continue;
      const p = assetPath(i.src.value);
      const f = files.get(p);
      if (f === undefined || f === null) continue;
      if (i.type.state === "set" && i.type.value !== "image/png") continue;
      const size = readPngSize(f);
      if (size === null) out.push({ code: "icon-not-png", key: p, detail: `${p} does not start like a PNG file` });
      else {
        if (size.width !== size.height) out.push({ code: "icon-not-square", key: p, detail: `${p} is ${sizeText(size)}` });
        if (sizeText(size) !== i.sizes.value) out.push({ code: "icon-size-differs", key: p, detail: `${p} is ${sizeText(size)}; the manifest says ${i.sizes.value}` });
      }
    }
  }
  return out.sort(byKey);
}

export function formatPwaProblem(p: PwaCompareProblem): string {
  return `${p.code} ${p.key}: ${p.detail}`;
}

export function formatPwaProblems(ps: readonly PwaCompareProblem[]): string {
  return ps.map(formatPwaProblem).join("\n");
}

export { showList, showVal };
