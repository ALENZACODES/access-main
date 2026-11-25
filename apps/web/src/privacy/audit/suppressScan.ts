// Finds the places where the code switches off a check: a TypeScript directive (the ignore, nocheck and
// expect-error comments), an ESLint disable directive (whole file, same line or next line) and a use of the type
// `any`. A directive is found by its comment; a use of `any` is found in code, not in comments or strings, by the
// shapes `: any`, `as any`, `<any>`, `any[]` and `, any>`. A check switched off in a way the scan does not know (a
// configuration file's own override, a type held in an alias) is not found, and the list says nothing about it. Node
// only (tests and CI), never shipped to the browser.

import { lexCode, lineAt, lineStarts } from "./lexCode";
import type { SourceFile } from "./repoAudit";

export type SuppressKind = "ts-ignore" | "ts-nocheck" | "ts-expect-error" | "eslint-disable" | "eslint-disable-line" | "eslint-disable-next-line" | "any";

export const SUPPRESS_KINDS: readonly SuppressKind[] = ["ts-ignore", "ts-nocheck", "ts-expect-error", "eslint-disable", "eslint-disable-line", "eslint-disable-next-line", "any"];

export interface Suppression {
  path: string;
  line: number;
  kind: SuppressKind;
  /** The ESLint rules named, in the order written; empty for any other kind. */
  rules: string[];
  /** The reason written after the directive (after "--" for ESLint), or null when there is none. */
  reason: string | null;
  /** The text matched, for a message. */
  detail: string;
}

const CODE_PATH = /\.(?:[cm]?[jt]s|[jt]sx)$/;
const SKIPPED = /(?:^|\/)(?:node_modules|dist|build|coverage|\.lanes|\.lanes-tmp)\//;

/** True for the files the scan reads: JavaScript and TypeScript files outside build and dependency folders. */
export function isScannedFile(path: string): boolean {
  return CODE_PATH.test(path) && !SKIPPED.test(path);
}

const TS_DIRECTIVE = /^\s*@ts-(ignore|nocheck|expect-error)\b\s*[:-]*\s*([\s\S]*)$/;
const ESLINT_DIRECTIVE = /^\s*eslint-(disable-next-line|disable-line|disable)\b([\s\S]*)$/;
const ANY_SHAPES: RegExp[] = [/:\s*any\b(?!\s*[:=]>)/g, /\bas\s+any\b/g, /<any\s*>/g, /\bany\s*\[\s*\]/g, /,\s*any\s*>/g, /<\s*any\s*,/g];

const squeeze = (s: string): string => s.replace(/\s+/g, " ").trim();

/** Reads the directive in the text of a comment, or null when the comment is not one. */
export function readDirective(text: string): { kind: SuppressKind; rules: string[]; reason: string | null } | null {
  const ts = TS_DIRECTIVE.exec(text);
  if (ts !== null) {
    const reason = squeeze(ts[2] as string);
    return { kind: `ts-${ts[1]}` as SuppressKind, rules: [], reason: reason === "" ? null : reason };
  }
  const es = ESLINT_DIRECTIVE.exec(text);
  if (es === null) return null;
  const rest = squeeze(es[2] as string);
  const cut = rest.search(/(?:^|\s)--(?:\s|$)/);
  const rulesPart = cut < 0 ? rest : rest.slice(0, cut);
  const reasonPart = cut < 0 ? "" : rest.slice(cut).replace(/^\s*--\s*/, "").trim();
  const rules = rulesPart.split(",").map((r) => r.trim()).filter((r) => r !== "");
  return { kind: `eslint-${es[1]}` as SuppressKind, rules, reason: reasonPart === "" ? null : reasonPart };
}

/** Every directive and every use of `any` in the files, in path order and then line order. */
export function scanSuppressions(files: readonly SourceFile[]): Suppression[] {
  const out: Suppression[] = [];
  for (const f of [...files].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))) {
    if (!isScannedFile(f.path)) continue;
    const lexed = lexCode(f.text);
    const found: Suppression[] = [];
    for (const c of lexed.comments) {
      const d = readDirective(c.text);
      if (d !== null) found.push({ path: f.path, line: c.line, ...d, detail: squeeze(c.text).slice(0, 80) });
    }
    const starts = lineStarts(f.text);
    const spans: Array<{ start: number; end: number; text: string }> = [];
    for (const re of ANY_SHAPES) {
      re.lastIndex = 0;
      for (const m of lexed.code.matchAll(re)) spans.push({ start: m.index as number, end: (m.index as number) + m[0].length, text: squeeze(m[0]) });
    }
    spans.sort((x, y) => x.start - y.start || y.end - x.end);
    let lastEnd = -1;
    for (const s of spans) {
      if (s.start < lastEnd) continue;
      lastEnd = s.end;
      found.push({ path: f.path, line: lineAt(starts, s.start), kind: "any", rules: [], reason: null, detail: s.text });
    }
    found.sort((a, b) => a.line - b.line || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
    out.push(...found);
  }
  return out;
}

/** The directives and uses counted by path, kind and rule list: one row for each different combination. */
export interface SuppressCount {
  path: string;
  kind: SuppressKind;
  /** The rules joined with ", " in the order written; "" for none. */
  rules: string;
  count: number;
}

export function countSuppressions(found: readonly Suppression[]): SuppressCount[] {
  const map = new Map<string, SuppressCount>();
  for (const s of found) {
    const rules = s.rules.join(", ");
    const id = `${s.path}\u0000${s.kind}\u0000${rules}`;
    const hit = map.get(id);
    if (hit === undefined) map.set(id, { path: s.path, kind: s.kind, rules, count: 1 });
    else hit.count++;
  }
  return [...map.values()].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : a.rules < b.rules ? -1 : a.rules > b.rules ? 1 : 0));
}
