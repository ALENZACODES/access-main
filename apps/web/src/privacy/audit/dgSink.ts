// Finds the places where the App's code writes text into a page as markup: an assignment to innerHTML, outerHTML or
// srcdoc, dangerouslySetInnerHTML, insertAdjacentHTML, createContextualFragment and document.write. A write that
// only empties an element is not a risk and is counted apart. It reads text with a pattern: it says what the written
// value looks like (a call, a template, a literal), not whether the value is safe.

import { lineOf } from "./jsLit";
import type { SourceFile } from "./repoAudit";

export type SinkKind = "assign" | "append" | "react-html" | "adjacent" | "fragment" | "document-write";

export type SinkValue = "empty" | "call" | "template" | "other" | "none";

export interface Sink {
  path: string;
  line: number;
  kind: SinkKind;
  /** For an assignment: what the value looks like. */
  value: SinkValue;
  /** For a value that is a call: the name of the function called. */
  callee: string;
}

export function isSinkScanned(path: string): boolean {
  if (!/\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(path)) return false;
  if (/(?:^|\/)(?:node_modules|dist|e2e)\//.test(path)) return false;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) return false;
  if (/^apps\/web\/src\/privacy\/audit\//.test(path)) return false;
  return /^apps\/web\/src\//.test(path);
}

/** What the right side of an assignment looks like, read from the text up to the end of the statement. */
export function classifyValue(rhs: string): { value: SinkValue; callee: string } {
  const t = rhs.trim();
  if (t === "") return { value: "none", callee: "" };
  if (/^(?:""|'')$/.test(t)) return { value: "empty", callee: "" };
  if (t.startsWith("`")) return { value: "template", callee: "" };
  const call = /^(?:[A-Za-z_$][\w$]*\s*\.\s*)*([A-Za-z_$][\w$]*)\s*\(/.exec(t);
  if (call) return { value: "call", callee: call[1] as string };
  return { value: "other", callee: "" };
}

function statementEnd(text: string, from: number): number {
  let i = from;
  while (i < text.length && text[i] !== ";" && text[i] !== "\n") i++;
  return i;
}

const SINK_RE = /(?:\.\s*(innerHTML|outerHTML|srcdoc)\s*(\+?=)(?![=>])|\bdangerouslySetInnerHTML\b|(?:\bdocument\s*\.\s*(write|writeln)|\.\s*(insertAdjacentHTML|createContextualFragment))\s*\()/g;

/** The text with the lines that are only a comment emptied, so a sentence about innerHTML is not a write. */
export function withoutCommentLines(text: string): string {
  return text
    .split("\n")
    .map((l) => (/^\s*(?:\/\/|\/\*|\*)/.test(l) ? "" : l))
    .join("\n");
}

/**
 * Reads the text with a pattern and not with the lexer, because the lexer can lose its place after a slash that is
 * not a regular expression. The price is that a sink named inside a string is found too, and a comment that shares
 * a line with code is not skipped.
 */
export function scanSinks(files: readonly SourceFile[]): Sink[] {
  const out: Sink[] = [];
  for (const f of files) {
    if (!isSinkScanned(f.path)) continue;
    const text = withoutCommentLines(f.text);
    for (const m of text.matchAll(SINK_RE)) {
      const line = lineOf(text, m.index);
      const whole = m[0];
      if (whole === "dangerouslySetInnerHTML") out.push({ path: f.path, line, kind: "react-html", value: "none", callee: "" });
      else if (m[1] !== undefined) {
        const r = classifyValue(text.slice(m.index + whole.length, statementEnd(text, m.index + whole.length)));
        out.push({ path: f.path, line, kind: m[2] === "+=" ? "append" : "assign", ...r });
      } else if (m[3] !== undefined) out.push({ path: f.path, line, kind: "document-write", value: "none", callee: "" });
      else out.push({ path: f.path, line, kind: (m[4] === "insertAdjacentHTML" ? "adjacent" : "fragment") as SinkKind, value: "none", callee: "" });
    }
  }
  return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : a.line - b.line));
}

/** Sinks that write something: a write that only empties an element is left out. */
export function riskySinks(sinks: readonly Sink[]): Sink[] {
  return sinks.filter((s) => !(s.kind === "assign" && s.value === "empty"));
}

export function countByPath(sinks: readonly Sink[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of sinks) m.set(s.path, (m.get(s.path) ?? 0) + 1);
  return m;
}
