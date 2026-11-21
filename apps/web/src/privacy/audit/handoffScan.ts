// Finds the links in the App's own source that open another app, and compares them with the list in
// panel/handoffRegister.ts. A link is found when a scheme name and a colon start a string or a template: a quote
// or backtick, then `mailto:`, `tel:`, `geo:` and so on. Words that only mention a scheme (a comment, a sentence
// in a message, a regular expression) are not links and are not found. Navigation to an address built at run
// time is found by its call: location.assign, location.replace, a write to location or location.href through window,
// document, globalThis or self (or location.href alone), and window.open. A local variable called location is not a hand-off. A link
// built from parts the scan cannot join (a scheme held in a variable) is not found, and the list says nothing
// about it. Node only (tests and CI), never shipped to the browser.

import type { HandoffRow, SchemeId } from "../panel/handoffRegister";
import type { SourceFile } from "./repoAudit";
import { isScannedSource } from "./storageKeys";

export interface SchemePattern {
  id: SchemeId;
  patterns: readonly RegExp[];
}

const link = (name: string): RegExp => new RegExp(`(?<=["'\`])${name}:`, "g");

export const SCHEME_CATALOGUE: readonly SchemePattern[] = [
  { id: "mailto", patterns: [link("mailto")] },
  { id: "tel", patterns: [link("tel")] },
  { id: "sms", patterns: [link("sms")] },
  { id: "geo", patterns: [link("geo")] },
  { id: "webcal", patterns: [link("webcals?")] },
  { id: "maps", patterns: [link("maps")] },
  { id: "intent", patterns: [link("intent")] },
  { id: "whatsapp", patterns: [link("whatsapp")] },
  { id: "facetime", patterns: [link("facetime(?:-audio)?")] },
  {
    id: "navigation",
    patterns: [
      /(?<![\w$])(?:(?:window|document|globalThis|self)\.)?location\.(?:assign|replace)\s*\(/g,
      /\b(?:window|document|globalThis|self)\.location(?:\.href)?\s*=(?!=)/g,
      /(?<![\w$.])location\.href\s*=(?!=)/g,
      /\b(?:window|globalThis|self)\.open\s*\(/g,
    ],
  },
];

/** The places in one file where one kind of link is made. */
export interface FoundHandoff {
  scheme: SchemeId;
  path: string;
  /** 1-based line of each place, in order */
  lines: number[];
}

function lineOf(text: string, index: number): number {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (text.charCodeAt(i) === 10) line += 1;
  return line;
}

/** True when the match starts on a line that is a comment, so documentation never counts as a link. */
function inComment(text: string, index: number): boolean {
  const start = text.lastIndexOf("\n", index - 1) + 1;
  return /^\s*(\/\/|\*|\/\*)/.test(text.slice(start, index + 1));
}

/** Every place that makes a link, ordered by scheme then path. */
export function scanHandoffs(files: readonly SourceFile[], catalogue: readonly SchemePattern[] = SCHEME_CATALOGUE): FoundHandoff[] {
  const out: FoundHandoff[] = [];
  for (const file of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedSource(file.path)) continue;
    for (const entry of catalogue) {
      const at = new Set<number>();
      for (const re of entry.patterns) {
        const global = new RegExp(re.source, re.flags.includes("g") ? re.flags : `${re.flags}g`);
        for (const m of file.text.matchAll(global)) {
          if (m.index === undefined || inComment(file.text, m.index)) continue;
          at.add(m.index);
        }
      }
      if (at.size > 0) out.push({ scheme: entry.id, path: file.path, lines: [...at].sort((a, b) => a - b).map((i) => lineOf(file.text, i)) });
    }
  }
  return out.sort((a, b) => `${a.scheme} ${a.path}`.localeCompare(`${b.scheme} ${b.path}`));
}

export interface HandoffComparison {
  /** Found in the source, in no row */
  unlisted: FoundHandoff[];
  /** In a row, not found in that file */
  gone: Array<{ scheme: SchemeId; path: string }>;
  /** In a row and found, with a different number of places */
  wrongCount: Array<{ scheme: SchemeId; path: string; listed: number; found: number }>;
}

export function compareHandoffs(found: readonly FoundHandoff[], rows: readonly HandoffRow[]): HandoffComparison {
  const key = (s: string, p: string): string => `${s} ${p}`;
  const foundBy = new Map(found.map((f) => [key(f.scheme, f.path), f]));
  const listed = new Set(rows.map((r) => key(r.scheme, r.path)));
  const out: HandoffComparison = { unlisted: [], gone: [], wrongCount: [] };
  for (const f of found) if (!listed.has(key(f.scheme, f.path))) out.unlisted.push(f);
  for (const r of rows) {
    const f = foundBy.get(key(r.scheme, r.path));
    if (f === undefined) out.gone.push({ scheme: r.scheme, path: r.path });
    else if (f.lines.length !== r.uses) out.wrongCount.push({ scheme: r.scheme, path: r.path, listed: r.uses, found: f.lines.length });
  }
  return out;
}

export function isClean(c: HandoffComparison): boolean {
  return c.unlisted.length === 0 && c.gone.length === 0 && c.wrongCount.length === 0;
}

/** One line for each difference, for the failure message. Empty when the comparison is clean. */
export function formatHandoffComparison(c: HandoffComparison): string {
  const out: string[] = [];
  for (const f of c.unlisted) out.push(`${f.path}:${f.lines[0]}: a ${f.scheme} link (${f.lines.length} place${f.lines.length === 1 ? "" : "s"}) is in no row`);
  for (const g of c.gone) out.push(`${g.path}: the row for ${g.scheme} finds no such link`);
  for (const w of c.wrongCount) out.push(`${w.path}: the row says ${w.listed} ${w.scheme} link${w.listed === 1 ? "" : "s"} but ${w.found} found`);
  return out.join("\n");
}
