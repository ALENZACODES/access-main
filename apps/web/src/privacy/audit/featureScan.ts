// Finds the browser features the App's own source code uses, and compares them with the register in
// panel/featureRegister.ts. Each feature is a short list of patterns for the calls that use it. A feature
// the register says the App does not use must not be found; a feature it says the App uses must be found in
// the file the row names. Features reached by a name built at run time cannot be found this way, so the
// patterns stay on the plain spelling. Node only (tests and CI), never shipped to the browser.

import type { FeatureId, FeatureRow } from "../panel/featureRegister";
import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

export interface FeaturePattern {
  id: FeatureId;
  /** Any one of these means the feature is used */
  patterns: readonly RegExp[];
  /** Files where a match is not a use, with the reason */
  ignore?: ReadonlyArray<{ path: RegExp; reason: string }>;
}

export const FEATURE_CATALOGUE: readonly FeaturePattern[] = [
  { id: "service-worker", patterns: [/\bserviceWorker\??\.register\s*\(/] },
  { id: "storage-estimate", patterns: [/\bnavigator\.storage\b/, /\bstorage\??\.(?:estimate|persisted)\b/] },
  { id: "storage-persist", patterns: [/\bstorage\??\.persist\b(?!ed)/] },
  { id: "permission-query", patterns: [/\.permissions\??\.query\s*\(/] },
  { id: "clipboard-write", patterns: [/\bclipboard\??\.write(?:Text)?\s*\(/] },
  { id: "file-download", patterns: [/\bURL\.createObjectURL\s*\(/] },
  { id: "file-pick", patterns: [/\btype[=:]\s*\{?\s*["']file["']/] },
  { id: "print", patterns: [/\bwindow\.print\s*\(/] },
  { id: "language", patterns: [/\bnavigator\.languages?\b/] },
  { id: "display-preferences", patterns: [/\bmatchMedia\s*\(/] },
  { id: "geolocation", patterns: [/\bnavigator\.geolocation\b/, /\.(?:getCurrentPosition|watchPosition)\s*\(/] },
  { id: "camera-microphone", patterns: [/\bgetUserMedia\b/, /\bmediaDevices\b/, /\bgetDisplayMedia\b/] },
  { id: "notifications", patterns: [/\bNotification\.requestPermission\b/, /\bnew Notification\s*\(/, /\.showNotification\s*\(/, /\bpushManager\b/i] },
  { id: "clipboard-read", patterns: [/\bclipboard\??\.read(?:Text)?\s*\(/] },
  {
    id: "send-beacon",
    patterns: [/\.sendBeacon\b/],
    ignore: [{ path: /(^|\/)privacy\/panel\/egress\.ts$/, reason: "The network guard wraps the call to stop it; it never sends" }],
  },
  { id: "share", patterns: [/\bnavigator\.(?:share|canShare)\b/] },
  { id: "cookie-write", patterns: [/\bdocument\.cookie\s*=(?!=)/] },
  { id: "device-apis", patterns: [/\bnavigator\.(?:bluetooth|usb|serial|hid)\b/] },
  { id: "sensors", patterns: [/\bnavigator\.(?:vibrate|wakeLock)\b/, /\bDeviceOrientationEvent\b/, /\bDeviceMotionEvent\b/, /\bAccelerometer\b/, /\bGyroscope\b/] },
  { id: "credentials", patterns: [/\bnavigator\.credentials\b/, /\bPublicKeyCredential\b/] },
];

export interface FoundFeature {
  id: FeatureId;
  /** Repo-relative path of the first file that uses it */
  path: string;
  /** 1-based line of the first use in that file */
  line: number;
  /** Every file that uses it, sorted */
  paths: string[];
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** True when the match starts on a line that is a comment, so documentation never counts as use. */
function inComment(text: string, index: number): boolean {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\/\/|\*|\/\*)/.test(text.slice(start, index + 1));
}

export function scanFeatures(files: readonly SourceFile[], catalogue: readonly FeaturePattern[] = FEATURE_CATALOGUE): FoundFeature[] {
  const byId = new Map<FeatureId, FoundFeature>();
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path)) continue;
    for (const feature of catalogue) {
      if (feature.ignore?.some((i) => i.path.test(file.path)) === true) continue;
      let first = -1;
      for (const re of feature.patterns) {
        const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
        for (const m of file.text.matchAll(global)) {
          if (m.index === undefined || inComment(file.text, m.index)) continue;
          if (first === -1 || m.index < first) first = m.index;
        }
      }
      if (first === -1) continue;
      const existing = byId.get(feature.id);
      if (existing === undefined) byId.set(feature.id, { id: feature.id, path: file.path, line: lineOf(file.text, first), paths: [file.path] });
      else existing.paths = [...existing.paths, file.path].sort();
    }
  }
  return [...byId.values()].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export interface FeatureComparison {
  /** Found in the source, but the register says the App does not use it or has no row for it */
  unexpected: FoundFeature[];
  /** The register says the App uses it, but the source does not show it */
  stale: FeatureRow[];
  /** Used, but the row's file is not one of the files that use it */
  moved: { id: FeatureId; registered: string; found: string[] }[];
  /** Ids the register has and the catalogue cannot look for, or the other way round */
  uncovered: string[];
}

export function compareFeatures(found: readonly FoundFeature[], register: readonly FeatureRow[], catalogue: readonly FeaturePattern[] = FEATURE_CATALOGUE): FeatureComparison {
  const rows = new Map(register.map((r) => [r.id, r]));
  const seen = new Map(found.map((f) => [f.id, f]));
  const catalogued = new Set<string>(catalogue.map((c) => c.id));
  return {
    unexpected: found.filter((f) => rows.get(f.id)?.used !== true),
    stale: register.filter((r) => r.used && !seen.has(r.id)),
    moved: register.flatMap((r) => {
      const f = seen.get(r.id);
      return r.used && f !== undefined && r.path !== null && !f.paths.includes(r.path) ? [{ id: r.id, registered: r.path, found: f.paths }] : [];
    }),
    uncovered: [
      ...register.filter((r) => !catalogued.has(r.id)).map((r) => `${r.id}: in the register but the scan has no pattern for it`),
      ...catalogue.filter((c) => !rows.has(c.id)).map((c) => `${c.id}: the scan looks for it but the register has no row`),
    ],
  };
}

export function formatFeatureComparison(c: FeatureComparison): string {
  const lines: string[] = [];
  for (const f of c.unexpected) lines.push(`${f.id}: used in ${f.path}:${f.line} but featureRegister.ts says the App does not use it`);
  for (const r of c.stale) lines.push(`${r.id}: featureRegister.ts says the App uses it but the source does not show it`);
  for (const m of c.moved) lines.push(`${m.id}: registered for ${m.registered}, found in ${m.found.join(", ")}`);
  lines.push(...c.uncovered);
  return lines.join("\n");
}
