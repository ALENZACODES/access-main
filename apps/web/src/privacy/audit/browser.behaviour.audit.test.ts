// CI audit: what the App actually does with the browser matches what the list promises. It reads the source and
// checks that the App asks only the questions the list describes: two display settings, never a fingerprint-style
// read, no storage request for persistence outside the one file that owns it, and no answer put on the wire.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { BROWSER_REGISTER } from "../panel/browserRegister";
import { loadFiles } from "./repoFiles";
import { isScannedSource } from "./storageKeys";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const sources = loadFiles(ROOT, ["apps/web/src", "packages"]).filter((f) => isScannedSource(f.path));

interface Hit { path: string; line: number; text: string }

/** Lines of code (comments skipped) that match, with their path and number. */
function hits(re: RegExp, files = sources): Hit[] {
  const out: Hit[] = [];
  for (const f of files) {
    f.text.split("\n").forEach((text, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(text)) return;
      if (re.test(text)) out.push({ path: f.path, line: i + 1, text: text.trim() });
    });
  }
  return out;
}
const where = (h: Hit[]): string[] => h.map((x) => `${x.path}:${x.line}`);

describe("browser questions, in what the App does", () => {
  it("reads a real tree", () => {
    expect(sources.length).toBeGreaterThan(200);
  });

  it("asks only the two display settings the list describes", () => {
    const calls = hits(/\bmatchMedia\s*\(/);
    expect(calls.length).toBeGreaterThan(0);
    const odd = calls.filter((c) => !/matchMedia\s*\(\s*(?:QUERY\[|["'`]\(prefers-(?:contrast: more|reduced-motion: reduce)\)["'`])/.test(c.text) && !/matchMedia\s*\(\s*(?:query|q|mq)\b/.test(c.text));
    expect(where(odd), "a display question the list does not describe").toEqual([]);
  });

  it("never reads anything that tells one device from another", () => {
    const fingerprint = /\b(?:navigator|nav)\??\.(?:userAgent|userAgentData|platform|hardwareConcurrency|deviceMemory|connection|getBattery|mediaDevices|plugins|mimeTypes|maxTouchPoints|vendor)\b|\benumerateDevices\b|\bscreen\.(?:width|height|availWidth|availHeight|colorDepth|pixelDepth)\b|\bresolvedOptions\s*\(|\bgetTimezoneOffset\s*\(|\bdocument\.referrer\b/;
    expect(where(hits(fingerprint))).toEqual([]);
  });

  it("asks for the storage to be kept only in the one file that is about keeping it", () => {
    const owners = where(hits(/\bstorage\??\.persist\s*\(/));
    for (const o of owners) expect(o.startsWith("apps/web/src/offline/robust/storageDurability.ts"), o).toBe(true);
  });

  it("does not ask the browser to keep anything from this panel", () => {
    expect(hits(/\.persist\s*\(/, sources.filter((f) => f.path.startsWith("apps/web/src/privacy/")))).toEqual([]);
  });

  it("does not put the browser's language, online state or storage size on a line that sends it", () => {
    const answer = /\b(?:navigator|nav)\??\.(?:language|languages|onLine|storage)\b/;
    const sending = /\b(?:fetch|sendBeacon|XMLHttpRequest|WebSocket|EventSource|postMessage)\b/;
    expect(where(hits(new RegExp(`(?=.*${answer.source})(?=.*${sending.source})`)))).toEqual([]);
  });

  it("keeps the files that ask the language, the online state or the display settings free of network calls", () => {
    const listed = new Set(BROWSER_REGISTER.filter((r) => ["language", "online", "preference"].includes(r.kind)).map((r) => r.path));
    const files = sources.filter((f) => listed.has(f.path) && !f.path.includes("RegionPackPage"));
    expect(files.length).toBeGreaterThan(3);
    // data-status/standalone/main.ts fetches the status file it shows; the line must not carry a browser answer.
    const calls = hits(/\b(?:fetch|sendBeacon|XMLHttpRequest|WebSocket|EventSource)\s*\(/, files);
    const own = calls.filter((c) => c.path === "apps/web/src/data-status/standalone/main.ts");
    expect(own.map((c) => c.text)).toEqual(["const res = await fetch(url, { headers: { accept: 'application/json' } });"]);
    expect(where(calls.filter((c) => !own.includes(c)))).toEqual([]);
  });

  it("makes identifiers in the files the list names, and no other file mixes Math.random into one", () => {
    const named = new Set(BROWSER_REGISTER.filter((r) => r.kind === "identifier").map((r) => r.path));
    const randomIds = hits(/Math\.random\(\)\.toString\(\s*(?:16|36)\s*\)/);
    // A made-up element id such as `offline-diagnostics-${Math.random()...}` names a page element, not a person or a record.
    const elementId = /`[a-z][a-z-]*-\$\{Math\.random\(\)/;
    for (const h of randomIds.filter((x) => !elementId.test(x.text))) expect(named.has(h.path), `${h.path}:${h.line} makes an identifier from Math.random`).toBe(true);
  });

  it("writes a number in the browser's own language only in the places the list names, with empty parentheses", () => {
    const own = new Set(BROWSER_REGISTER.filter((r) => r.kind === "own-language").map((r) => r.path));
    const calls = hits(/\.toLocale(?:Date|Time)?String\s*\(\s*\)/);
    expect(calls.length).toBeGreaterThan(0);
    for (const c of calls) expect(own.has(c.path), `${c.path}:${c.line}`).toBe(true);
    for (const c of hits(/\.toLocale(?:Date|Time)?String\s*\(\s*(?:undefined|\[\s*\])/)) expect(own.has(c.path), `${c.path}:${c.line}`).toBe(true);
  });

  it("lists the privacy settings read in this panel's own file and the one secure-connection read", () => {
    const rows = BROWSER_REGISTER.filter((r) => r.kind === "privacy-signal").map((r) => r.path);
    expect([...rows].sort()).toEqual(["apps/web/src/data-status/standalone/main.ts", "apps/web/src/privacy/panel/signals.ts"]);
  });

  it("never reads the browser's answers inside a try that hides a failure as No", () => {
    const text = sources.find((s) => s.path === "apps/web/src/privacy/panel/browserLive.ts")!.text;
    expect(text).not.toMatch(/catch\s*(?:\([^)]*\))?\s*\{\s*return\s+false/);
    expect(text).toContain("null");
  });
});
