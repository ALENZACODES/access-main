// A small reader for the part of TypeScript that a build configuration is written in: object and array literals,
// strings, numbers, booleans, regular expressions and calls such as `VitePWA({ ... })`. It reads text and runs nothing.
// What it cannot read as a plain value (a variable, a function, a sum of other values) is kept as written, as a
// reference, a function or an expression, and is never guessed at: a value that is not a literal stays unknown to
// whoever asks. A problem in the text (an unclosed string, a missing comma) is reported with its line and the reader
// carries on; nothing here throws. Node only (tests and CI), never shipped to the browser.

export type JNode =
  | { kind: "obj"; line: number; entries: JEntry[] }
  | { kind: "arr"; line: number; items: JNode[] }
  | { kind: "str"; line: number; value: string }
  | { kind: "num"; line: number; value: number }
  | { kind: "bool"; line: number; value: boolean }
  | { kind: "null"; line: number }
  | { kind: "regex"; line: number; raw: string }
  | { kind: "fn"; line: number; raw: string }
  | { kind: "ref"; line: number; name: string }
  | { kind: "call"; line: number; callee: string; args: JNode[] }
  | { kind: "expr"; line: number; raw: string };

export interface JEntry {
  /** The key as the text of the key; "..." for a spread; "[x]" for a computed key. */
  key: string;
  line: number;
  value: JNode;
  spread: boolean;
}

export interface JProblem {
  line: number;
  message: string;
}

export interface JCall {
  name: string;
  line: number;
  args: JNode[];
  problems: JProblem[];
}

const MAX_DEPTH = 120;
const MAX_NUMERIC = 200;
const REGEX_AFTER = "(,=:[!&|?{;+-*%<>~^";

/** The 1-based line of an index in the text. */
export function lineOf(text: string, index: number): number {
  let line = 1;
  const stop = Math.min(index, text.length);
  for (let i = 0; i < stop; i++) if (text[i] === "\n") line++;
  return line;
}

function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") out.push(i + 1);
  return out;
}

function lineAt(starts: readonly number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] as number) <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

/** The index after a quoted string that starts at `i`, or -1 when it is not closed (a ' or " string ends at the line). */
export function skipString(s: string, i: number): number {
  const q = s[i];
  if (q === "`") return skipTemplate(s, i);
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") j++;
    else if (c === q) return j + 1;
    else if (c === "\n") return -1;
  }
  return -1;
}

/** The index after a template literal that starts at `i`, or -1 when it is not closed. Text inside ${ } is skipped. */
export function skipTemplate(s: string, i: number): number {
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === "\\") j++;
    else if (c === "`") return j + 1;
    else if (c === "$" && s[j + 1] === "{") {
      let depth = 1;
      j += 2;
      while (j < s.length && depth > 0) {
        const k = s[j];
        if (k === "'" || k === '"' || k === "`") {
          const e = skipString(s, j);
          if (e < 0) return -1;
          j = e;
          continue;
        }
        if (k === "{") depth++;
        else if (k === "}") depth--;
        j++;
      }
      if (depth > 0) return -1;
      j--;
    }
  }
  return -1;
}

/** The index after a regular expression (with its flags) that starts at `i`, or -1 when it is not closed on its line. */
export function skipRegex(s: string, i: number): number {
  let inClass = false;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j];
    if (c === "\n") return -1;
    if (c === "\\") j++;
    else if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      j++;
      while (j < s.length && /[a-z]/i.test(s[j] as string)) j++;
      return j;
    }
  }
  return -1;
}

/** The index of the next character that is not white space or a comment. A comment left open runs to the end. */
export function skipTrivia(s: string, from: number, onOpen?: (index: number) => void): number {
  let i = from;
  while (i < s.length) {
    const c = s[i] as string;
    if (c === " " || c === "\t" || c === "\n" || c === "\r" || c === " " || c === "﻿") i++;
    else if (c === "/" && s[i + 1] === "/") {
      const e = s.indexOf("\n", i);
      i = e < 0 ? s.length : e;
    } else if (c === "/" && s[i + 1] === "*") {
      const e = s.indexOf("*/", i + 2);
      if (e < 0) {
        onOpen?.(i);
        return s.length;
      }
      i = e + 2;
    } else return i;
  }
  return i;
}

const regexAllowed = (prev: string): boolean => prev === "" || REGEX_AFTER.includes(prev);

/** The end of the expression that starts at `from`: the next , ; ) ] or } outside any brackets, strings and regexes. */
export function captureExpr(s: string, from: number, end: number): { end: number; arrow: boolean } {
  let depth = 0;
  let prev = "";
  let arrow = false;
  let j = from;
  let last = from;
  while (j < end) {
    j = skipTrivia(s, j);
    if (j >= end) break;
    const c = s[j] as string;
    if (depth === 0 && (c === "," || c === ";" || c === ")" || c === "]" || c === "}")) break;
    if (c === "'" || c === '"' || c === "`") {
      const e = skipString(s, j);
      if (e < 0) {
        last = end;
        j = end;
        break;
      }
      j = e;
      last = j;
      prev = "a";
      continue;
    }
    if (c === "/" && regexAllowed(prev)) {
      const e = skipRegex(s, j);
      if (e > 0) {
        j = e;
        last = j;
        prev = "a";
        continue;
      }
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") depth--;
    else if (c === "=" && s[j + 1] === ">" && depth === 0) {
      arrow = true;
      j += 2;
      last = j;
      prev = ">";
      continue;
    }
    prev = c;
    j++;
    last = j;
  }
  return { end: Math.min(last, end), arrow };
}

/** The index of the bracket that closes the one at `open`, or -1. Strings, comments and regexes are skipped. */
export function matchClose(s: string, open: number, end: number = s.length): number {
  let depth = 0;
  let prev = "";
  for (let j = open; j < end; ) {
    j = skipTrivia(s, j);
    if (j >= end) break;
    const c = s[j] as string;
    if (c === "'" || c === '"' || c === "`") {
      const e = skipString(s, j);
      if (e < 0) return -1;
      j = e;
      prev = "a";
      continue;
    }
    if (c === "/" && regexAllowed(prev)) {
      const e = skipRegex(s, j);
      if (e > 0) {
        j = e;
        prev = "a";
        continue;
      }
    }
    if (c === "(" || c === "[" || c === "{") depth++;
    else if (c === ")" || c === "]" || c === "}") {
      depth--;
      if (depth === 0) return j;
    }
    prev = c;
    j++;
  }
  return -1;
}

/** The text of a quoted string's inside with its escapes read. An escape that is not known stands for its own letter. */
export function decodeEscapes(body: string): string {
  let out = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i] as string;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = body[i + 1];
    if (n === undefined) break;
    i++;
    if (n === "n") out += "\n";
    else if (n === "t") out += "\t";
    else if (n === "r") out += "\r";
    else if (n === "b") out += "\b";
    else if (n === "f") out += "\f";
    else if (n === "v") out += "\v";
    else if (n === "0") out += "\0";
    else if (n === "\n") continue;
    else if (n === "x" && /^[0-9a-fA-F]{2}$/.test(body.slice(i + 1, i + 3))) {
      out += String.fromCodePoint(parseInt(body.slice(i + 1, i + 3), 16));
      i += 2;
    } else if (n === "u" && /^[0-9a-fA-F]{4}$/.test(body.slice(i + 1, i + 5))) {
      out += String.fromCodePoint(parseInt(body.slice(i + 1, i + 5), 16));
      i += 4;
    } else out += n;
  }
  return out;
}

/** The value of a sum, difference, product or quotient of plain numbers (with brackets), or null for anything else. */
export function evalNumeric(raw: string): number | null {
  if (raw.length === 0 || raw.length > MAX_NUMERIC || !/^[\d\s.*/+\-()]+$/.test(raw)) return null;
  const tokens = raw.match(/\d+\.?\d*|\.\d+|[*/+\-()]/g);
  if (tokens === null || tokens.join("") !== raw.replace(/\s+/g, "")) return null;
  let pos = 0;
  let bad = false;
  const peek = (): string | undefined => tokens[pos];
  const primary = (): number => {
    const t = tokens[pos++];
    if (t === undefined) {
      bad = true;
      return 0;
    }
    if (t === "(") {
      const v = sum();
      if (tokens[pos++] !== ")") bad = true;
      return v;
    }
    if (t === "-") return -primary();
    if (t === "+") return primary();
    const v = Number(t);
    if (!Number.isFinite(v)) bad = true;
    return v;
  };
  const product = (): number => {
    let v = primary();
    while (peek() === "*" || peek() === "/") v = tokens[pos++] === "*" ? v * primary() : v / primary();
    return v;
  };
  const sum = (): number => {
    let v = product();
    while (peek() === "+" || peek() === "-") v = tokens[pos++] === "+" ? v + product() : v - product();
    return v;
  };
  const result = sum();
  if (bad || pos !== tokens.length || !Number.isFinite(result)) return null;
  return result;
}

const REF = /^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/;
const CALL = /^([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\(/;

class Reader {
  constructor(
    private readonly s: string,
    private readonly starts: readonly number[],
    public i: number,
    private readonly end: number,
    readonly problems: JProblem[],
  ) {}

  private line(index: number): number {
    return lineAt(this.starts, index);
  }

  private problem(index: number, message: string): void {
    this.problems.push({ line: this.line(index), message });
  }

  private trivia(): number {
    this.i = skipTrivia(this.s, this.i, (at) => this.problem(at, "a comment is not closed"));
    return this.i;
  }

  private expr(start: number): JNode {
    const { end, arrow } = captureExpr(this.s, start, this.end);
    this.i = Math.max(end, start);
    const raw = this.s.slice(start, end).trim();
    return classify(raw, arrow, this.line(start));
  }

  /** The values from here to `to`, separated by commas. */
  list(to: number, depth: number): JNode[] {
    const out: JNode[] = [];
    while (this.trivia() < to) {
      if (this.s[this.i] === ",") {
        this.i++;
        continue;
      }
      const before = this.i;
      out.push(this.value(depth));
      if (this.i <= before) this.i = before + 1;
    }
    return out;
  }

  value(depth: number): JNode {
    const start = this.trivia();
    const line = this.line(start);
    if (start >= this.end) {
      this.problem(start, "a value is missing");
      return { kind: "expr", line, raw: "" };
    }
    if (depth > MAX_DEPTH) {
      this.problem(start, "the text is nested too deeply");
      return this.expr(start);
    }
    const c = this.s[start] as string;
    if (",;)]}".includes(c)) {
      this.problem(start, "a value is missing");
      return { kind: "expr", line, raw: "" };
    }
    let node: JNode | null = null;
    if (c === "{") node = this.object(depth);
    else if (c === "[") node = this.array(depth);
    else if (c === "'" || c === '"') {
      const e = skipString(this.s, start);
      if (e < 0) {
        this.problem(start, "a string is not closed");
        const eol = this.s.indexOf("\n", start);
        this.i = eol < 0 || eol > this.end ? this.end : eol;
        return { kind: "str", line, value: decodeEscapes(this.s.slice(start + 1, this.i)) };
      }
      this.i = e;
      node = { kind: "str", line, value: decodeEscapes(this.s.slice(start + 1, e - 1)) };
    } else if (c === "`") {
      const e = skipTemplate(this.s, start);
      if (e < 0) {
        this.problem(start, "a template is not closed");
        this.i = this.end;
        return { kind: "expr", line, raw: this.s.slice(start, this.end).trim() };
      }
      this.i = e;
      const body = this.s.slice(start + 1, e - 1);
      node = body.includes("${") ? { kind: "expr", line, raw: this.s.slice(start, e) } : { kind: "str", line, value: decodeEscapes(body) };
    } else if (c === "/") {
      const e = skipRegex(this.s, start);
      if (e > 0) {
        this.i = e;
        node = { kind: "regex", line, raw: this.s.slice(start, e) };
      }
    }
    if (node === null) return this.expr(start);
    const next = skipTrivia(this.s, this.i);
    if (next < this.end && !",;)]}".includes(this.s[next] as string)) {
      return this.expr(start);
    }
    return node;
  }

  private object(depth: number): JNode {
    const open = this.i;
    const line = this.line(open);
    this.i++;
    const entries: JEntry[] = [];
    for (;;) {
      const at = this.trivia();
      if (at >= this.end) {
        this.problem(open, "an object is not closed");
        break;
      }
      const c = this.s[at] as string;
      if (c === "}") {
        this.i++;
        break;
      }
      if (c === ",") {
        this.i++;
        continue;
      }
      const entryLine = this.line(at);
      if (c === "." && this.s.startsWith("...", at)) {
        this.i = at + 3;
        entries.push({ key: "...", line: entryLine, value: this.expr(this.trivia()), spread: true });
        continue;
      }
      const key = this.key(at);
      if (key === null) {
        this.problem(at, "a key was expected");
        const e = captureExpr(this.s, at, this.end).end;
        this.i = Math.max(e, at + 1);
        continue;
      }
      const after = this.trivia();
      const d = this.s[after];
      if (d === ":") {
        this.i = after + 1;
        entries.push({ key, line: entryLine, value: this.value(depth + 1), spread: false });
      } else if (d === "(") {
        const e = captureExpr(this.s, after, this.end).end;
        this.i = Math.max(e, after + 1);
        entries.push({ key, line: entryLine, value: { kind: "fn", line: entryLine, raw: `${key}${this.s.slice(after, e)}`.trim() }, spread: false });
      } else if (d === "," || d === "}" || d === undefined) {
        entries.push({ key, line: entryLine, value: { kind: "ref", line: entryLine, name: key }, spread: false });
      } else {
        this.problem(after, "a colon was expected after the key");
        const e = captureExpr(this.s, after, this.end).end;
        this.i = Math.max(e, after + 1);
      }
    }
    return { kind: "obj", line, entries };
  }

  private key(at: number): string | null {
    const c = this.s[at] as string;
    if (c === "'" || c === '"') {
      const e = skipString(this.s, at);
      if (e < 0) return null;
      this.i = e;
      return decodeEscapes(this.s.slice(at + 1, e - 1));
    }
    if (c === "[") {
      const e = matchClose(this.s, at, this.end);
      if (e < 0) return null;
      this.i = e + 1;
      return this.s.slice(at, e + 1);
    }
    const m = /^[\w$]+/.exec(this.s.slice(at, at + 200));
    if (m === null) return null;
    this.i = at + m[0].length;
    const word = m[0];
    if (word === "async" || word === "get" || word === "set") {
      const save = this.i;
      const n = skipTrivia(this.s, this.i);
      const m2 = /^[\w$]+/.exec(this.s.slice(n, n + 200));
      if (m2 !== null && n > save) {
        this.i = n + m2[0].length;
        return m2[0];
      }
    }
    return word;
  }

  private array(depth: number): JNode {
    const open = this.i;
    const line = this.line(open);
    this.i++;
    const items: JNode[] = [];
    for (;;) {
      const at = this.trivia();
      if (at >= this.end) {
        this.problem(open, "a list is not closed");
        break;
      }
      const c = this.s[at] as string;
      if (c === "]") {
        this.i++;
        break;
      }
      if (c === ",") {
        this.i++;
        continue;
      }
      const before = this.i;
      if (c === "." && this.s.startsWith("...", at)) {
        this.i = at + 3;
        items.push(this.expr(this.trivia()));
      } else items.push(this.value(depth + 1));
      if (this.i <= before) this.i = before + 1;
      const n = this.trivia();
      const d = this.s[n];
      if (d !== undefined && d !== "," && d !== "]" && n < this.end) {
        this.problem(n, "a comma was expected");
        const e = captureExpr(this.s, n, this.end).end;
        this.i = Math.max(e, n + 1);
      }
    }
    return { kind: "arr", line, items };
  }
}

function classify(raw: string, arrow: boolean, line: number): JNode {
  if (raw === "true" || raw === "false") return { kind: "bool", line, value: raw === "true" };
  if (raw === "null") return { kind: "null", line };
  if (arrow || /^(?:async\s+)?function\b/.test(raw)) return { kind: "fn", line, raw };
  const n = evalNumeric(raw);
  if (n !== null) return { kind: "num", line, value: n };
  if (REF.test(raw)) return { kind: "ref", line, name: raw };
  const m = CALL.exec(raw);
  if (m !== null) {
    const open = (m[0] as string).length - 1;
    const close = matchClose(raw, open);
    if (close === raw.length - 1) {
      const inner = raw.slice(open + 1, close);
      const r = new Reader(inner, lineStarts(inner), 0, inner.length, []);
      return { kind: "call", line, callee: m[1] as string, args: r.list(inner.length, 1).map((a) => shiftLine(a, line - 1)) };
    }
  }
  return { kind: "expr", line, raw };
}

function shiftLine(n: JNode, by: number): JNode {
  const line = n.line + by;
  if (n.kind === "obj") return { ...n, line, entries: n.entries.map((e) => ({ ...e, line: e.line + by, value: shiftLine(e.value, by) })) };
  if (n.kind === "arr") return { ...n, line, items: n.items.map((x) => shiftLine(x, by)) };
  if (n.kind === "call") return { ...n, line, args: n.args.map((x) => shiftLine(x, by)) };
  return { ...n, line };
}

/** The value that starts at `from` (default: the start of the text) and the problems found while reading it. */
export function parseLiteral(source: string, from = 0): { node: JNode; problems: JProblem[]; end: number } {
  const problems: JProblem[] = [];
  const r = new Reader(source, lineStarts(source), from, source.length, problems);
  const node = r.value(0);
  return { node, problems, end: r.i };
}

interface Tok {
  name: string;
  start: number;
  end: number;
  /** The last significant character before the word, or "" at the start of the text. */
  prev: string;
}

/** The words in the code of the text, in order: not those in comments, strings, templates or regular expressions. */
export function identTokens(s: string): Tok[] {
  const out: Tok[] = [];
  let prev = "";
  for (let i = 0; i < s.length; ) {
    i = skipTrivia(s, i);
    if (i >= s.length) break;
    const c = s[i] as string;
    if (c === "'" || c === '"' || c === "`") {
      const e = skipString(s, i);
      i = e < 0 ? s.length : e;
      prev = "a";
      continue;
    }
    if (c === "/" && regexAllowed(prev)) {
      const e = skipRegex(s, i);
      if (e > 0) {
        i = e;
        prev = "a";
        continue;
      }
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < s.length && /[\w$]/.test(s[j] as string)) j++;
      out.push({ name: s.slice(i, j), start: i, end: j, prev });
      prev = "a";
      i = j;
      continue;
    }
    prev = c;
    i++;
  }
  return out;
}

/** Every call of a function with this name, with its arguments read. A method call (x.name(...)) and a declaration are not calls. */
export function findCalls(source: string, name: string): JCall[] {
  const starts = lineStarts(source);
  const toks = identTokens(source);
  const out: JCall[] = [];
  toks.forEach((t, k) => {
    if (t.name !== name || t.prev === ".") return;
    if (k > 0 && (toks[k - 1] as Tok).name === "function" && (toks[k - 1] as Tok).end <= t.start && /^\s+$/.test(source.slice((toks[k - 1] as Tok).end, t.start))) return;
    const open = skipTrivia(source, t.end);
    if (source[open] !== "(") return;
    const problems: JProblem[] = [];
    let close = matchClose(source, open);
    if (close < 0) {
      problems.push({ line: lineAt(starts, open), message: "a call is not closed" });
      close = source.length;
    }
    const r = new Reader(source, starts, open + 1, close, problems);
    out.push({ name, line: lineAt(starts, t.start), args: r.list(close, 1), problems });
  });
  return out;
}

/** The value of `const name = ...` (or let or var) written in the text, or null when there is none or it has a type. */
export function findDecl(source: string, name: string): { node: JNode; problems: JProblem[] } | null {
  const toks = identTokens(source);
  for (let k = 0; k + 1 < toks.length; k++) {
    const kw = toks[k] as Tok;
    const id = toks[k + 1] as Tok;
    if ((kw.name !== "const" && kw.name !== "let" && kw.name !== "var") || id.name !== name) continue;
    const eq = skipTrivia(source, id.end);
    if (source[eq] !== "=" || source[eq + 1] === "=" || source[eq + 1] === ">") continue;
    const r = parseLiteral(source, eq + 1);
    return { node: r.node, problems: r.problems };
  }
  return null;
}

/** The value of a key of an object. When the key is written twice the last one wins, as in the language. */
export function getKey(node: JNode | undefined, key: string): JNode | undefined {
  if (node === undefined || node.kind !== "obj") return undefined;
  let found: JNode | undefined;
  for (const e of node.entries) if (!e.spread && e.key === key) found = e.value;
  return found;
}

/** The keys that an object writes more than once, in order of their second writing. */
export function duplicateKeys(node: JNode | undefined): string[] {
  if (node === undefined || node.kind !== "obj") return [];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const e of node.entries) {
    if (e.spread) continue;
    if (seen.has(e.key)) out.push(e.key);
    seen.add(e.key);
  }
  return out;
}

/** True when the object has a spread (...x) whose keys are not known to the reader. */
export function hasSpread(node: JNode | undefined): boolean {
  return node !== undefined && node.kind === "obj" && node.entries.some((e) => e.spread);
}

export const strOf = (n: JNode | undefined): string | null => (n !== undefined && n.kind === "str" ? n.value : null);
export const numOf = (n: JNode | undefined): number | null => (n !== undefined && n.kind === "num" ? n.value : null);
export const boolOf = (n: JNode | undefined): boolean | null => (n !== undefined && n.kind === "bool" ? n.value : null);
export const arrOf = (n: JNode | undefined): JNode[] | null => (n !== undefined && n.kind === "arr" ? n.items : null);

/** The text of a node as it was written, as far as it is kept: a string in quotes, a regex, a reference, a function. */
export function showNode(n: JNode | undefined): string {
  if (n === undefined) return "(absent)";
  switch (n.kind) {
    case "str":
      return JSON.stringify(n.value);
    case "num":
      return String(n.value);
    case "bool":
      return String(n.value);
    case "null":
      return "null";
    case "regex":
    case "fn":
    case "expr":
      return n.raw;
    case "ref":
      return n.name;
    case "call":
      return `${n.callee}(…)`;
    case "arr":
      return `[${n.items.length} items]`;
    case "obj":
      return `{${n.entries.length} keys}`;
  }
}
