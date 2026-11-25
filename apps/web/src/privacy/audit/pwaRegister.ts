// What the install and offline-cache settings in the build configuration are written to be, one line per setting, and
// the findings that are accepted as they stand. A setting the reader cannot work out is written here as it is shown:
// "unknown:" and the text, never a guess. Changing a setting in the configuration without changing this list fails
// the test until the change is looked at. The list says what is written in the file; it does not say what the built
// files contain. Node only (tests and CI), never shipped to the browser.

import type { PwaCode } from "./pwaRules";

export interface PwaRegister {
  path: string;
  /** One value per setting, as pwaCompare.flattenConfig writes it. Keys are in sorted order. */
  settings: Readonly<Record<string, string>>;
  note: string;
}

export interface PwaAcceptRow {
  path: string;
  code: PwaCode;
  count: number;
  reason: string;
}

/** Findings that may be accepted. The others (a service worker that updates without asking, data kept in a page cache, and so on) never may. */
export const PWA_ACCEPTABLE: readonly PwaCode[] = ["verification-wording", "long-max-age", "many-entries", "precache-extension"];

export const PWA_REGISTER: PwaRegister = {
  path: "apps/web/vite.config.ts",
  settings: {
    "includeAssets": '["favicon.svg","icons/icon-192.png","icons/icon-512.png"]',
    "manifest.background_color": "#f4f1ea",
    "manifest.display": "standalone",
    "manifest.icons": '["icons/icon-192.png|192x192|any","icons/icon-512.png|512x512|any","icons/icon-512.png|512x512|maskable"]',
    "manifest.lang": "en",
    "manifest.scope": "unknown:base",
    "manifest.start_url": "unknown:base",
    "manifest.theme_color": "#083734",
    "registerType": "prompt",
    "workbox.cleanupOutdatedCaches": "true",
    "workbox.clientsClaim": "true",
    "workbox.denylist": '["/^\\\\/packs\\\\//","dataPath"]',
    "workbox.globIgnores": '["data/**","**/*.pmtiles","**/maplibre-*.js","**/NarrowAuditPage-*.js"]',
    "workbox.globPatterns": '["**/*.{js,css,html,svg,png,webmanifest}"]',
    "workbox.navigateFallback": "index.html",
    "workbox.runtime.0": "dataPath|NetworkOnly|absent|absent|absent|absent",
    "workbox.runtime.1": "function|NetworkFirst|shell-pages|4|32|604800",
    "workbox.runtime.count": "2",
    "workbox.skipWaiting": "false",
  },
  note: "Pages are fetched from the network first and kept for a week at most; data and offline packs are never kept in the page cache; a new version waits for the person to accept it.",
};

export const PWA_ACCEPTED: readonly PwaAcceptRow[] = [
  {
    path: "apps/web/vite.config.ts",
    code: "verification-wording",
    count: 1,
    reason: "The manifest description says the records are unverified and names the verification tier. The file belongs to another lane, so the wording is reported here and not edited.",
  },
];

export interface PwaRegisterProblem {
  message: string;
}

/** Checks the register itself: sorted keys, no empty value, a runtime count that matches the rows, accepted rows that may be accepted. */
export function validatePwaRegister(reg: PwaRegister = PWA_REGISTER, accepted: readonly PwaAcceptRow[] = PWA_ACCEPTED): PwaRegisterProblem[] {
  const out: PwaRegisterProblem[] = [];
  const keys = Object.keys(reg.settings);
  const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (keys.some((k, i) => k !== sorted[i])) out.push({ message: "the settings are not in sorted order" });
  for (const k of keys) if ((reg.settings[k] as string).length === 0) out.push({ message: `the setting ${k} has an empty value` });
  const rows = keys.filter((k) => /^workbox\.runtime\.\d+$/.test(k)).length;
  if (String(rows) !== reg.settings["workbox.runtime.count"]) out.push({ message: `workbox.runtime.count is ${reg.settings["workbox.runtime.count"] ?? "absent"} but ${rows} rows are written` });
  for (let i = 0; i < rows; i++) if (!(`workbox.runtime.${i}` in reg.settings)) out.push({ message: `the runtime rows skip ${i}` });
  if (reg.note.trim().length === 0) out.push({ message: "the note is empty" });
  const seen = new Set<string>();
  for (const a of accepted) {
    const id = `${a.path}\u0000${a.code}`;
    if (seen.has(id)) out.push({ message: `${a.path} accepts ${a.code} twice` });
    seen.add(id);
    if (!PWA_ACCEPTABLE.includes(a.code)) out.push({ message: `${a.code} may not be accepted (${a.path})` });
    if (!Number.isInteger(a.count) || a.count < 1) out.push({ message: `${a.path} ${a.code} has a count of ${a.count}` });
    if (a.reason.trim().length < 20) out.push({ message: `${a.path} ${a.code} has no real reason` });
  }
  return out;
}

export function assertPwaRegister(): void {
  const p = validatePwaRegister();
  if (p.length > 0) throw new Error(`The install-settings register is wrong:\n${p.map((x) => `  ${x.message}`).join("\n")}`);
}
