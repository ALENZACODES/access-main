// Finds the places in the App's own source where work starts without the person pressing anything: timers, animation
// frames, observers that watch the page, listeners for the network coming or going or for another tab writing
// storage, the page being hidden or closed, and the service worker. Each place is found by its call or its event name,
// in code and in the strings the plain-TypeScript pages build. A line that is a comment is never a place. Work started
// by a library, a call made through a name the scan does not know (a timer held in a variable and called later), and
// code under `narrow/` are not found, and the list says nothing about them. Node only (tests and CI), never shipped
// to the browser.

import { AUTO_KINDS, type AutoKind, type AutoRow } from "../panel/autoRegister";
import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

export interface AutoPattern {
  kind: AutoKind;
  patterns: readonly RegExp[];
}

const GLOBAL = "(?<![\\w$.])(?:(?:window|globalThis|self)\\.)?";
const listener = (names: string): RegExp => new RegExp(`\\.addEventListener\\(\\s*(["'\`])(?:${names})\\1`, "g");

export const AUTO_CATALOGUE: readonly AutoPattern[] = [
  { kind: "timer", patterns: [new RegExp(`${GLOBAL}(?:setTimeout|setInterval)\\s*\\(`, "g")] },
  { kind: "frame", patterns: [new RegExp(`${GLOBAL}(?:requestAnimationFrame|requestIdleCallback)\\s*\\(`, "g")] },
  { kind: "observer", patterns: [/\bnew\s+(?:Mutation|Intersection|Resize|Performance)Observer\s*\(/g] },
  { kind: "network", patterns: [listener("online|offline")] },
  { kind: "storage-event", patterns: [listener("storage")] },
  { kind: "page-event", patterns: [listener("visibilitychange|pagehide|pageshow|beforeunload|unload|freeze|resume")] },
  { kind: "channel", patterns: [/\bnew\s+(?:BroadcastChannel|MessageChannel|SharedWorker)\s*\(/g] },
  { kind: "worker", patterns: [/\bnew\s+Worker\s*\(/g] },
  {
    kind: "service-worker",
    patterns: [/\b(?:navigator|nav)\.serviceWorker\b/g, /["']serviceWorker["']\s+in\s+navigator/g, new RegExp("\\bself\\.addEventListener\\(\\s*([\"'`])(?:install|activate|fetch|push|sync|periodicsync|message)\\1", "g")],
  },
];

export interface FoundAuto {
  kind: AutoKind;
  path: string;
  /** 1-based line of each place, in order */
  lines: number[];
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

function inComment(text: string, index: number): boolean {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\/\/|\*|\/\*)/.test(text.slice(start, index + 1));
}

/** Every place work starts by itself, grouped by file and kind, in the order of the paths and then the catalogue. */
export function scanAuto(files: readonly SourceFile[], catalogue: readonly AutoPattern[] = AUTO_CATALOGUE): FoundAuto[] {
  const out: FoundAuto[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path)) continue;
    for (const { kind, patterns } of catalogue) {
      const hits = new Set<number>();
      for (const re of patterns) {
        for (const m of file.text.matchAll(new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`))) {
          if (m.index === undefined || inComment(file.text, m.index)) continue;
          hits.add(m.index);
        }
      }
      if (hits.size > 0) out.push({ kind, path: file.path, lines: [...hits].sort((a, b) => a - b).map((i) => lineOf(file.text, i)) });
    }
  }
  return out;
}


export interface AutoComparison {
  /** Found in a file, in no row */
  unlisted: FoundAuto[];
  /** In a row, none found in that file */
  gone: Array<{ kind: AutoKind; path: string }>;
  /** In a row and found, in a different number of places */
  wrongCount: Array<{ kind: AutoKind; path: string; listed: number; found: number }>;
}

const idOf = (kind: string, path: string): string => `${kind}\u0000${path}`;

/** Differences between what the scan found and the rows, both ways. */
export function compareAuto(found: readonly FoundAuto[], rows: readonly AutoRow[]): AutoComparison {
  const out: AutoComparison = { unlisted: [], gone: [], wrongCount: [] };
  const foundBy = new Map(found.map((f) => [idOf(f.kind, f.path), f]));
  const listed = new Set(rows.map((r) => idOf(r.kind, r.path)));
  for (const f of found) if (!listed.has(idOf(f.kind, f.path))) out.unlisted.push(f);
  for (const r of rows) {
    const f = foundBy.get(idOf(r.kind, r.path));
    if (f === undefined) out.gone.push({ kind: r.kind, path: r.path });
    else if (f.lines.length !== r.uses) out.wrongCount.push({ kind: r.kind, path: r.path, listed: r.uses, found: f.lines.length });
  }
  return out;
}

export function isCleanAuto(c: AutoComparison): boolean {
  return c.unlisted.length === 0 && c.gone.length === 0 && c.wrongCount.length === 0;
}

const plural = (n: number): string => (n === 1 ? "place" : "places");

/** One line for each difference, for the failure message. Empty when the comparison is clean. */
export function formatAutoComparison(c: AutoComparison): string {
  const out: string[] = [];
  for (const u of c.unlisted) out.push(`${u.path}:${u.lines[0] ?? 0}: ${u.lines.length} ${u.kind} ${plural(u.lines.length)} found and no row lists them`);
  for (const g of c.gone) out.push(`${g.path}: the ${g.kind} row finds nothing in the file`);
  for (const w of c.wrongCount) out.push(`${w.path}: the ${w.kind} row says ${w.listed} ${plural(w.listed)} but ${w.found} found`);
  return out.join("\n");
}

/** How many places of each kind the scan found over all files, in the order of the list of kinds. */
export function totalsByKind(found: readonly FoundAuto[]): Array<{ kind: AutoKind; places: number; files: number }> {
  return AUTO_KINDS.map((kind) => {
    const mine = found.filter((f) => f.kind === kind);
    return { kind, places: mine.reduce((n, f) => n + f.lines.length, 0), files: mine.length };
  }).filter((t) => t.places > 0);
}
