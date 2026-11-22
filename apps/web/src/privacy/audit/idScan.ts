// Finds the places where the App's code makes an identifier or reads something about the device that a site can
// use to tell one browser from another. Identifiers: crypto.randomUUID, crypto.getRandomValues, Math.random, and the clock (Date.now or performance.now) in a template or a sum on a line that names an id, a key, a token or a name. Reads
// about the device are sorted by how much they reveal: "high" ones (cores, memory, battery, the list of cameras and
// microphones, canvas and audio readback, installed fonts, WebGL) and "low" ones (the language, the user agent, the
// screen size, the time zone). The text is masked first (idMask), so a comment or a string that only names an API is
// not a finding. It reads one file at a time and does not follow a value from where it is made to where it goes.

import { lineAt, maskCode } from "./idMask";
import type { SourceFile } from "./repoAudit";

export type IdKind = "uuid" | "random-bytes" | "math-random" | "time-id" | "device-high" | "device-low";

export const ID_KINDS: readonly IdKind[] = ["uuid", "random-bytes", "math-random", "time-id", "device-high", "device-low"];

export interface IdSite {
  path: string;
  line: number;
  kind: IdKind;
  /** The name that was found, for example randomUUID or navigator.language. */
  detail: string;
  /** Whether the same line of code also stores, sends or posts something: put, add, setItem, fetch, send, postMessage. */
  moves: boolean;
}

const RE_MOVES = /\.\s*(?:put|add|bulkPut|setItem|send|postMessage|sendBeacon)\s*\(|\bfetch\s*\(/;

/** The masked text of the line that holds the index. */
export function lineOfMasked(masked: string, index: number): string {
  const from = masked.lastIndexOf("\n", index - 1) + 1;
  const to = masked.indexOf("\n", index);
  return masked.slice(from, to < 0 ? masked.length : to);
}

/** Properties of navigator that reveal a lot about the device. */
export const NAVIGATOR_HIGH: ReadonlySet<string> = new Set(["hardwareConcurrency", "deviceMemory", "getBattery", "userAgentData", "getGamepads", "plugins", "mimeTypes", "mediaDevices", "getUserMedia"]);

/** Properties of navigator that reveal a little: the same for many people. */
export const NAVIGATOR_LOW: ReadonlySet<string> = new Set(["userAgent", "platform", "vendor", "appVersion", "language", "languages", "connection", "maxTouchPoints", "cookieEnabled", "doNotTrack", "globalPrivacyControl"]);

const SCREEN_LOW = new Set(["width", "height", "availWidth", "availHeight", "colorDepth", "pixelDepth", "orientation"]);

/** Names that are high on their own wherever they are called: readback of drawings and sound, fonts and WebGL. */
const HIGH_CALLS = ["toDataURL", "getImageData", "enumerateDevices", "queryLocalFonts", "getHighEntropyValues", "getSupportedExtensions", "getExtension", "measureText"];
const HIGH_TYPES = ["WebGLRenderingContext", "WebGL2RenderingContext", "OfflineAudioContext", "AudioContext", "webkitAudioContext", "AnalyserNode"];
const LOW_CALLS = ["getTimezoneOffset", "resolvedOptions", "matchMedia"];

export function isIdScanned(path: string): boolean {
  if (!/\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(path)) return false;
  if (/(?:^|\/)(?:node_modules|dist|e2e)\//.test(path)) return false;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) return false;
  if (/^apps\/web\/src\/privacy\/audit\//.test(path)) return false;
  return /^apps\/web\/src\//.test(path);
}

const RE_UUID = /\.\s*randomUUID\s*\(/g;
const RE_BYTES = /\.\s*getRandomValues\s*\(/g;
const RE_MATH = /\bMath\s*\.\s*random\s*\(/g;
const RE_NAVIGATOR = /\bnavigator\s*\??\.\s*([A-Za-z_$][\w$]*)/g;
const RE_ALIAS = /\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:[A-Za-z_$][\w$]*\s*\??\.\s*)*navigator\s*(?:[;,)]|$)/gm;
const RE_CLOCK = /\b(?:Date\s*\.\s*now|performance\s*\.\s*now)\s*\(/g;
/**
 * Whether the call at this column of the line is written into text: inside a template expression, or added to
 * something with + on either side. A call whose value is only compared or stored in a number is not.
 */
export function joinedIntoText(line: string, column: number, length: number): boolean {
  const before = line.slice(0, column);
  const after = line.slice(column + length);
  const opens = (before.match(/\$\{/g) ?? []).length;
  const closes = (before.match(/\}/g) ?? []).length;
  if (opens > closes) return true;
  if (/\+\s*$/.test(before) && !/\+\+\s*$/.test(before)) return true;
  return /^[^;]*?\)\s*\+(?!\+|=)/.test(after);
}

const RE_IDISH = /\b(?:id|ids|key|token|name|slug|uuid|serial)\b|(?:Id|Key|Token|Name)\b/;
const RE_SCREEN = /\b(?:window\s*\.\s*)?screen\s*\??\.\s*([A-Za-z_$][\w$]*)/g;
const RE_DPR = /\b(?:devicePixelRatio|visualViewport)\b/g;
const RE_CALL = new RegExp(`\\.\\s*(${[...HIGH_CALLS, ...LOW_CALLS].join("|")})\\s*\\(`, "g");
const RE_TYPE = new RegExp(`\\b(${HIGH_TYPES.join("|")})\\b`, "g");

/** The masked line that holds the index and the lines before it, up to the number given, joined. */
export function nearbyLines(masked: string, index: number, before: number): string {
  const lines = masked.slice(0, index).split("\n");
  const own = lineOfMasked(masked, index);
  return [...lines.slice(Math.max(0, lines.length - 1 - before), lines.length - 1), own].join("\n");
}

/** Names that hold the navigator in this text: const nav = navigator, const nav = env.navigator, const nav = window.navigator. */
export function navigatorAliases(masked: string): string[] {
  const names = new Set<string>();
  for (const m of masked.matchAll(RE_ALIAS)) names.add(m[1] as string);
  return [...names].sort();
}

/** The sites in one file. */
export function scanFile(file: SourceFile): IdSite[] {
  if (!isIdScanned(file.path)) return [];
  const text = maskCode(file.text);
  const out: IdSite[] = [];
  const add = (index: number, kind: IdKind, detail: string): void => void out.push({ path: file.path, line: lineAt(text, index), kind, detail, moves: RE_MOVES.test(lineOfMasked(text, index)) });
  for (const m of text.matchAll(RE_UUID)) add(m.index, "uuid", "randomUUID");
  for (const m of text.matchAll(RE_BYTES)) add(m.index, "random-bytes", "getRandomValues");
  for (const m of text.matchAll(RE_MATH)) add(m.index, "math-random", "Math.random");
  const navigatorRead = (index: number, prop: string): void => {
    if (NAVIGATOR_HIGH.has(prop)) add(index, "device-high", `navigator.${prop}`);
    else if (NAVIGATOR_LOW.has(prop)) add(index, "device-low", `navigator.${prop}`);
  };
  for (const m of text.matchAll(RE_NAVIGATOR)) navigatorRead(m.index, m[1] as string);
  for (const alias of navigatorAliases(text)) {
    const re = new RegExp(`(?<![\\w$.])${alias.replace(/\$/g, "\\$")}\\s*\\??\\.\\s*([A-Za-z_$][\\w$]*)`, "g");
    for (const m of text.matchAll(re)) navigatorRead(m.index, m[1] as string);
  }
  for (const m of text.matchAll(RE_CLOCK)) {
    const line = lineOfMasked(text, m.index);
    const near = nearbyLines(text, m.index, 3);
    const column = m.index - (text.lastIndexOf("\n", m.index - 1) + 1);
    if (joinedIntoText(line, column, m[0].length) && RE_IDISH.test(near)) add(m.index, "time-id", m[0].replace(/\s*\($/, "").replace(/\s+/g, ""));
  }
  for (const m of text.matchAll(RE_SCREEN)) if (SCREEN_LOW.has(m[1] as string)) add(m.index, "device-low", `screen.${m[1] as string}`);
  for (const m of text.matchAll(RE_DPR)) add(m.index, "device-low", m[0]);
  for (const m of text.matchAll(RE_CALL)) add(m.index, HIGH_CALLS.includes(m[1] as string) ? "device-high" : "device-low", m[1] as string);
  for (const m of text.matchAll(RE_TYPE)) add(m.index, "device-high", m[1] as string);
  return out.sort((a, b) => a.line - b.line || (a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0));
}

/** The sites in every file, sorted by path and line. */
export function scanIds(files: readonly SourceFile[]): IdSite[] {
  const all = files.flatMap(scanFile);
  return all.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line || (a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0)));
}

/** How many files the scan reads. */
export function countScanned(files: readonly SourceFile[]): number {
  return files.filter((f) => isIdScanned(f.path)).length;
}

/** The number of sites of each kind, every kind present. */
export function countKinds(sites: readonly IdSite[]): Record<IdKind, number> {
  const out: Record<IdKind, number> = { uuid: 0, "random-bytes": 0, "math-random": 0, "time-id": 0, "device-high": 0, "device-low": 0 };
  for (const s of sites) out[s.kind]++;
  return out;
}
