// What the build configuration says about installing the App and keeping pages for offline use: the settings given to the
// VitePWA plugin (update mode, the web app manifest, the files kept at install, the rules for pages fetched later). It
// reads the text of the configuration file; it does not run the build, and it says nothing about what the built files
// contain. A setting written as something the reader cannot work out (a variable, a spread, a sum of variables) is kept
// as unknown with the text as written, and is never filled in with a guess. Node only (tests and CI), never shipped.

import {
  arrOf,
  boolOf,
  duplicateKeys,
  findCalls,
  findDecl,
  getKey,
  hasSpread,
  numOf,
  showNode,
  strOf,
  type JNode,
} from "./jsLit";

/** A setting: written as a plain value, written as something the reader cannot work out, or not written. */
export type Val<T> = { state: "set"; value: T; line: number } | { state: "unknown"; shown: string; line: number } | { state: "absent" };

export interface PItem {
  kind: JNode["kind"];
  /** The string itself for a string; the text as written for anything else. */
  text: string;
  line: number;
}

export type PList = { state: "set"; items: PItem[]; line: number } | { state: "unknown"; shown: string; line: number } | { state: "absent" };

export interface PwaIcon {
  line: number;
  src: Val<string>;
  sizes: Val<string>;
  type: Val<string>;
  purpose: Val<string>;
}

export interface PwaRuntime {
  line: number;
  pattern: PItem | null;
  handler: Val<string>;
  cacheName: Val<string>;
  networkTimeoutSeconds: Val<number>;
  maxEntries: Val<number>;
  maxAgeSeconds: Val<number>;
  /** True when the rule has an `expiration` object (even one with no limits in it). */
  hasExpiration: boolean;
}

export interface PwaProblem {
  line: number;
  message: string;
}

export interface PwaManifest {
  state: "read" | "absent" | "unknown";
  line: number;
  name: Val<string>;
  short_name: Val<string>;
  description: Val<string>;
  theme_color: Val<string>;
  background_color: Val<string>;
  display: Val<string>;
  lang: Val<string>;
  start_url: Val<string>;
  scope: Val<string>;
  icons: PwaIcon[] | "unknown" | "absent";
}

export interface PwaWorkbox {
  state: "read" | "absent" | "unknown";
  line: number;
  globPatterns: PList;
  globIgnores: PList;
  navigateFallback: Val<string>;
  denylist: PList;
  cleanupOutdatedCaches: Val<boolean>;
  clientsClaim: Val<boolean>;
  skipWaiting: Val<boolean>;
  runtime: PwaRuntime[] | "unknown" | "absent";
}

export interface PwaConfig {
  path: string;
  /** False when the file has no call of VitePWA. */
  found: boolean;
  line: number;
  /** "read" when the options are an object written out; "unknown" when they are held elsewhere and not found. */
  options: "read" | "unknown" | "absent";
  registerType: Val<string>;
  includeAssets: PList;
  devEnabled: Val<boolean>;
  manifest: PwaManifest;
  workbox: PwaWorkbox;
  problems: PwaProblem[];
}

const ABSENT = { state: "absent" } as const;

/** A name written on its own (not a member chain) is looked up once in the same file. */
function resolve(source: string, n: JNode | undefined): JNode | undefined {
  if (n === undefined || n.kind !== "ref" || n.name.includes(".")) return n;
  const d = findDecl(source, n.name);
  return d === null ? n : d.node;
}

function field(obj: JNode | undefined, key: string): JNode | undefined {
  const v = getKey(obj, key);
  if (v !== undefined) return v;
  if (obj !== undefined && hasSpread(obj)) return { kind: "expr", line: obj.line, raw: "...spread" };
  return undefined;
}

function val<T>(n: JNode | undefined, pick: (x: JNode | undefined) => T | null): Val<T> {
  if (n === undefined) return ABSENT;
  const v = pick(n);
  return v === null ? { state: "unknown", shown: showNode(n), line: n.line } : { state: "set", value: v, line: n.line };
}

const str = (n: JNode | undefined): Val<string> => val(n, strOf);
const num = (n: JNode | undefined): Val<number> => val(n, numOf);
const bool = (n: JNode | undefined): Val<boolean> => val(n, boolOf);

function plist(source: string, n0: JNode | undefined): PList {
  const n = resolve(source, n0);
  if (n === undefined) return ABSENT;
  const items = arrOf(n);
  if (items === null) return { state: "unknown", shown: showNode(n), line: n.line };
  return {
    state: "set",
    line: n.line,
    items: items.map((x) => ({ kind: x.kind, text: x.kind === "str" ? x.value : showNode(x), line: x.line })),
  };
}

function icon(n: JNode): PwaIcon {
  return {
    line: n.line,
    src: str(field(n, "src")),
    sizes: str(field(n, "sizes")),
    type: str(field(n, "type")),
    purpose: str(field(n, "purpose")),
  };
}

function runtimeRule(source: string, n: JNode): PwaRuntime {
  const options = resolve(source, field(n, "options"));
  const expiration = getKey(options, "expiration");
  const pat = field(n, "urlPattern");
  return {
    line: n.line,
    pattern: pat === undefined ? null : { kind: pat.kind, text: pat.kind === "str" ? pat.value : showNode(pat), line: pat.line },
    handler: str(field(n, "handler")),
    cacheName: str(field(options, "cacheName")),
    networkTimeoutSeconds: num(field(options, "networkTimeoutSeconds")),
    maxEntries: num(field(expiration, "maxEntries")),
    maxAgeSeconds: num(field(expiration, "maxAgeSeconds")),
    hasExpiration: expiration !== undefined && expiration.kind === "obj",
  };
}

function manifestOf(source: string, n0: JNode | undefined): PwaManifest {
  const n = resolve(source, n0);
  const empty = { name: ABSENT, short_name: ABSENT, description: ABSENT, theme_color: ABSENT, background_color: ABSENT, display: ABSENT, lang: ABSENT, start_url: ABSENT, scope: ABSENT } as const;
  if (n === undefined) return { state: "absent", line: 0, ...empty, icons: "absent" };
  if (n.kind !== "obj") return { state: "unknown", line: n.line, ...empty, icons: "unknown" };
  const icons = resolve(source, field(n, "icons"));
  const items = arrOf(icons);
  return {
    state: "read",
    line: n.line,
    name: str(field(n, "name")),
    short_name: str(field(n, "short_name")),
    description: str(field(n, "description")),
    theme_color: str(field(n, "theme_color")),
    background_color: str(field(n, "background_color")),
    display: str(field(n, "display")),
    lang: str(field(n, "lang")),
    start_url: str(field(n, "start_url")),
    scope: str(field(n, "scope")),
    icons: icons === undefined ? "absent" : items === null ? "unknown" : items.map((x) => icon(x)),
  };
}

function workboxOf(source: string, n0: JNode | undefined): PwaWorkbox {
  const n = resolve(source, n0);
  const blank = { globPatterns: ABSENT, globIgnores: ABSENT, navigateFallback: ABSENT, denylist: ABSENT, cleanupOutdatedCaches: ABSENT, clientsClaim: ABSENT, skipWaiting: ABSENT } as const;
  if (n === undefined) return { state: "absent", line: 0, ...blank, runtime: "absent" };
  if (n.kind !== "obj") return { state: "unknown", line: n.line, ...blank, runtime: "unknown" };
  const rc = resolve(source, field(n, "runtimeCaching"));
  const rules = arrOf(rc);
  return {
    state: "read",
    line: n.line,
    globPatterns: plist(source, field(n, "globPatterns")),
    globIgnores: plist(source, field(n, "globIgnores")),
    navigateFallback: str(field(n, "navigateFallback")),
    denylist: plist(source, field(n, "navigateFallbackDenylist")),
    cleanupOutdatedCaches: bool(field(n, "cleanupOutdatedCaches")),
    clientsClaim: bool(field(n, "clientsClaim")),
    skipWaiting: bool(field(n, "skipWaiting")),
    runtime: rc === undefined ? "absent" : rules === null ? "unknown" : rules.map((r) => runtimeRule(source, r)),
  };
}

/** Reads the VitePWA settings from the text of a configuration file. Never throws. */
export function parsePwaConfig(path: string, source: string): PwaConfig {
  const problems: PwaProblem[] = [];
  const calls = findCalls(source, "VitePWA");
  const blank: PwaConfig = {
    path,
    found: false,
    line: 0,
    options: "absent",
    registerType: ABSENT,
    includeAssets: ABSENT,
    devEnabled: ABSENT,
    manifest: manifestOf(source, undefined),
    workbox: workboxOf(source, undefined),
    problems,
  };
  const first = calls[0];
  if (first === undefined) return blank;
  for (const c of calls) for (const p of c.problems) problems.push({ line: p.line, message: p.message });
  if (calls.length > 1) problems.push({ line: (calls[1] as { line: number }).line, message: `VitePWA is called ${calls.length} times; the first call is read` });
  const arg = resolve(source, first.args[0]);
  const base = { ...blank, found: true, line: first.line };
  if (arg === undefined) return { ...base, options: "absent" };
  if (arg.kind !== "obj") return { ...base, options: "unknown" };
  for (const k of duplicateKeys(arg)) problems.push({ line: arg.line, message: `the key ${k} is written twice in the options` });
  const dev = resolve(source, field(arg, "devOptions"));
  return {
    ...base,
    options: "read",
    registerType: str(field(arg, "registerType")),
    includeAssets: plist(source, field(arg, "includeAssets")),
    devEnabled: dev === undefined ? ABSENT : bool(field(dev, "enabled")),
    manifest: manifestOf(source, field(arg, "manifest")),
    workbox: workboxOf(source, field(arg, "workbox")),
  };
}

/** The strings of a list, or null when the list is absent or unknown or has an item that is not a plain string. */
export function listStrings(l: PList): string[] | null {
  if (l.state !== "set") return null;
  if (l.items.some((i) => i.kind !== "str")) return null;
  return l.items.map((i) => i.text);
}

/** The value of a setting, or null when it is absent or unknown. */
export function setValue<T>(v: Val<T>): T | null {
  return v.state === "set" ? v.value : null;
}

/** A setting as text for a message: the value, or what was written, or "(absent)". */
export function showVal<T>(v: Val<T>): string {
  if (v.state === "absent") return "(absent)";
  if (v.state === "unknown") return `unknown (${v.shown})`;
  return typeof v.value === "string" ? JSON.stringify(v.value) : String(v.value);
}

export function showList(l: PList): string {
  if (l.state === "absent") return "(absent)";
  if (l.state === "unknown") return `unknown (${l.shown})`;
  return `[${l.items.map((i) => (i.kind === "str" ? JSON.stringify(i.text) : i.text)).join(", ")}]`;
}
