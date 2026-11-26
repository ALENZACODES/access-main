// Finds functions that are written out again in many files, takes their text out of the source, and compiles it, so a
// test can run every copy and check that they all give the same answer. The audit of time found a function that
// writes today's date in the time zone of the device in twenty-one files of the privacy folder; this is how those
// copies are compared. It reads text and uses the TypeScript compiler to remove types. It runs code that is in the
// repository, in tests only.

import ts from "typescript";
import type { SourceFile } from "./repoAudit";
import { lineAt, maskCode } from "./tmMask";

export interface FunctionCopy {
  name: string;
  path: string;
  line: number;
  /** The text of the declaration, from `function` to the closing brace. */
  source: string;
}

/** The index of the "}" that closes the "{" at `open` in masked text, or -1. */
function closingBrace(masked: string, open: number): number {
  let depth = 0;
  for (let i = open; i < masked.length; i++) {
    const c = masked[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * The index of the "{" that opens the body, after the ")" of the parameters. A "{" that follows ":", "|", "&", "<",
 * "," or "(" belongs to an object type in the type of the result, so it is skipped with what it holds.
 */
function bodyStart(masked: string, from: number): number {
  let i = from;
  let prev = "";
  while (i < masked.length) {
    const c = masked[i] as string;
    if (c === "{") {
      if (prev === "" || prev === ")") return i;
      if (/[:|&<,(]/.test(prev)) {
        const close = closingBrace(masked, i);
        if (close < 0) return -1;
        i = close + 1;
        prev = "}";
        continue;
      }
      return i;
    }
    if (c === ";") return -1;
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return -1;
}

/** Declarations of `function name(` in a file, with their text. A name that is also used for something else is found by its declaration only. */
export function extractFunctions(file: SourceFile, name: string): FunctionCopy[] {
  const masked = maskCode(file.text);
  const out: FunctionCopy[] = [];
  const re = new RegExp(`(?:^|[\\s;}])((?:export\\s+)?(?:async\\s+)?function\\s+${name}\\s*\\()`, "g");
  for (const m of masked.matchAll(re)) {
    const start = (m.index ?? 0) + (m[0].length - (m[1] ?? "").length);
    // The body starts at the first "{" after the closing ")" of the parameters and the type of the result.
    let paren = masked.indexOf("(", start);
    let depth = 0;
    let i = paren;
    for (; i < masked.length; i++) {
      if (masked[i] === "(") depth++;
      else if (masked[i] === ")") {
        depth--;
        if (depth === 0) break;
      }
    }
    paren = i;
    const open = bodyStart(masked, paren + 1);
    if (open < 0) continue;
    const close = closingBrace(masked, open);
    if (close < 0) continue;
    out.push({ name, path: file.path, line: lineAt(file.text, start), source: file.text.slice(start, close + 1) });
  }
  return out;
}

/** The text with runs of white space made one space and the ends trimmed, so two copies that differ in layout are equal. */
export function normaliseSource(source: string): string {
  return source.replace(/\s+/g, " ").trim();
}

export interface CopyGroup {
  /** The normalised text shared by the copies. */
  text: string;
  paths: string[];
}

/** Copies grouped by their normalised text, the largest group first, then by text. */
export function groupCopies(copies: readonly FunctionCopy[]): CopyGroup[] {
  const m = new Map<string, string[]>();
  for (const c of copies) {
    const key = normaliseSource(c.source);
    const list = m.get(key) ?? [];
    list.push(c.path);
    m.set(key, list);
  }
  return [...m.entries()].map(([text, paths]) => ({ text, paths: paths.sort() })).sort((a, b) => b.paths.length - a.paths.length || (a.text < b.text ? -1 : 1));
}

/** Turns the text of one declaration into a function that can be called. It has no access to anything else in the repository. */
export function compileCopy<A extends unknown[], R>(copy: FunctionCopy): (...args: A) => R {
  const js = ts.transpileModule(copy.source.replace(/^export\s+/, ""), { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } }).outputText;
  return new Function(`${js}\nreturn ${copy.name};`)() as (...args: A) => R;
}
