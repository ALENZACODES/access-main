// A reader for the part of YAML that GitHub workflow files use: block maps and lists, plain and quoted text, literal and
// folded block text (| and >), one-line [lists] and {maps}, and comments. It does not read anchors, aliases, tags, merge
// keys, several documents or a flow list that runs over more than one line; each of those is reported as a problem, and
// the text is kept as plain text, so a workflow that uses one is flagged and never half read. Node only (tests and CI),
// never shipped.

export interface YEntry {
  key: string;
  value: YNode;
  line: number;
}

export type YNode =
  | { kind: "map"; entries: YEntry[]; line: number }
  | { kind: "seq"; items: YNode[]; line: number }
  | { kind: "scalar"; text: string; quoted: boolean; line: number }
  | { kind: "null"; line: number };

export interface YProblem {
  line: number;
  message: string;
}

export interface YDoc {
  root: YNode;
  problems: YProblem[];
}

/** The text with a trailing comment removed. A # starts a comment at the start or after a blank, and not inside quotes. */
export function stripComment(s: string): string {
  let quote = "";
  for (let i = 0; i < s.length; i += 1) {
    const c = s[i] as string;
    if (quote !== "") {
      if (c === "\\" && quote === '"') i += 1;
      else if (c === quote) quote = "";
    } else if ((c === '"' || c === "'") && (i === 0 || /[\s[{,:-]/.test(s[i - 1] as string))) quote = c;
    else if (c === "#" && (i === 0 || /\s/.test(s[i - 1] as string))) return s.slice(0, i);
  }
  return s;
}

/** Splits "key: rest" at the first colon that is followed by a blank or the end, outside a quoted key. Null when the text is not a key line. */
export function splitKey(text: string): { key: string; rest: string } | null {
  let i = 0;
  let key: string;
  const first = text[0];
  if (first === '"' || first === "'") {
    const j = quotedEnd(text, 0);
    if (j < 0) return null;
    key = unquote(text.slice(0, j + 1));
    i = j + 1;
    while (text[i] === " ") i += 1;
    if (text[i] !== ":") return null;
  } else {
    if (first === undefined || first === "[" || first === "{" || first === "|" || first === ">") return null;
    let j = 0;
    while (j < text.length) {
      if (text[j] === ":" && (j + 1 === text.length || text[j + 1] === " ")) break;
      j += 1;
    }
    if (j >= text.length) return null;
    key = text.slice(0, j).trimEnd();
    i = j;
  }
  if (key === "") return null;
  return { key, rest: text.slice(i + 1).trim() };
}

/** The index of the quote that closes the quoted text starting at `start`, or -1. Inside double quotes a backslash skips a character; inside single quotes two quotes are one. */
export function quotedEnd(s: string, start: number): number {
  const q = s[start];
  let j = start + 1;
  while (j < s.length) {
    const c = s[j];
    if (c === "\\" && q === '"') j += 2;
    else if (c === q) {
      if (q === "'" && s[j + 1] === "'") j += 2;
      else return j;
    } else j += 1;
  }
  return -1;
}

const ESCAPES: Record<string, string> = { n: "\n", t: "\t", r: "\r", "0": "\0", "\\": "\\", '"': '"', "/": "/", " ": " " };

/** The text inside a quoted scalar, with its escapes read. The input starts and ends with the same quote. */
export function unquote(s: string): string {
  const q = s[0];
  const body = s.slice(1, s.endsWith(q ?? "\u0000") && s.length > 1 ? -1 : undefined);
  if (q === "'") return body.replace(/''/g, "'");
  let out = "";
  for (let i = 0; i < body.length; i += 1) {
    const c = body[i] as string;
    if (c !== "\\") {
      out += c;
      continue;
    }
    const n = body[i + 1] ?? "";
    if (n === "u" && /^[0-9a-fA-F]{4}$/.test(body.slice(i + 2, i + 6))) {
      out += String.fromCodePoint(parseInt(body.slice(i + 2, i + 6), 16));
      i += 5;
    } else {
      out += ESCAPES[n] ?? `\\${n}`;
      i += 1;
    }
  }
  return out;
}

interface Ln {
  indent: number;
  text: string;
  line: number;
}

/** Reads the text. It never throws; problems are collected in the result. */
export function parseYaml(source: string): YDoc {
  const raw = source.replace(/\r\n?/g, "\n").split("\n");
  const problems: YProblem[] = [];
  const problem = (line: number, message: string): void => void problems.push({ line, message });
  let pos = 0;
  let over: Ln | null = null;
  let docStarts = 0;

  const peek = (): Ln | null => {
    if (over !== null) return over;
    while (pos < raw.length) {
      const r = raw[pos] as string;
      const t = stripComment(r);
      if (t.trim() === "") {
        pos += 1;
        continue;
      }
      if (/^---(?:\s|$)/.test(t)) {
        docStarts += 1;
        if (docStarts > 1 || pos > 0 && raw.slice(0, pos).some((x) => stripComment(x).trim() !== "")) problem(pos + 1, "more than one document");
        pos += 1;
        continue;
      }
      if (/^\.\.\.\s*$/.test(t)) {
        pos += 1;
        continue;
      }
      const lead = /^[ \t]*/.exec(t)?.[0] ?? "";
      if (lead.includes("\t")) problem(pos + 1, "tab in indentation");
      return { indent: lead.length, text: t.trim(), line: pos + 1 };
    }
    return null;
  };
  const advance = (): void => {
    over = null;
    pos += 1;
  };

  const unsupported = (text: string, line: number): void => {
    if (/^[&*!]/.test(text)) problem(line, `${text[0] === "&" ? "an anchor" : text[0] === "*" ? "an alias" : "a tag"} is not read`);
  };

  /** One-line [..] and {..} as nodes. */
  function flow(text: string, line: number): YNode {
    let i = 0;
    const skip = (): void => {
      while (i < text.length && /\s/.test(text[i] as string)) i += 1;
    };
    const value = (inFlowKey: boolean): YNode => {
      skip();
      const c = text[i];
      if (c === "[") {
        i += 1;
        const items: YNode[] = [];
        for (;;) {
          skip();
          if (i >= text.length) {
            problem(line, "a flow list is not closed on its line");
            break;
          }
          if (text[i] === "]") {
            i += 1;
            break;
          }
          items.push(value(false));
          skip();
          if (text[i] === ",") i += 1;
          else if (i < text.length && text[i] !== "]") {
            problem(line, "unexpected text in a flow list");
            i = text.length;
          }
        }
        return { kind: "seq", items, line };
      }
      if (c === "{") {
        i += 1;
        const entries: YEntry[] = [];
        for (;;) {
          skip();
          if (i >= text.length) {
            problem(line, "a flow map is not closed on its line");
            break;
          }
          if (text[i] === "}") {
            i += 1;
            break;
          }
          const k = value(true);
          skip();
          let v: YNode = { kind: "null", line };
          if (text[i] === ":") {
            i += 1;
            v = value(false);
          }
          entries.push({ key: k.kind === "scalar" ? k.text : "", value: v, line });
          skip();
          if (text[i] === ",") i += 1;
          else if (i < text.length && text[i] !== "}") {
            problem(line, "unexpected text in a flow map");
            i = text.length;
          }
        }
        return { kind: "map", entries, line };
      }
      if (c === '"' || c === "'") {
        const end = quotedEnd(text, i);
        const j = end < 0 ? text.length : end;
        const lit = text.slice(i, end < 0 ? text.length : j + 1);
        i = Math.min(j + 1, text.length);
        return { kind: "scalar", text: unquote(lit), quoted: true, line };
      }
      let j = i;
      while (j < text.length && !(",]}".includes(text[j] as string) || (inFlowKey && text[j] === ":" ) || (text[j] === ":" && (text[j + 1] === " " || j + 1 === text.length)))) j += 1;
      const lit = text.slice(i, j).trim();
      i = j;
      return { kind: "scalar", text: lit, quoted: false, line };
    };
    const node = value(false);
    skip();
    if (i < text.length) problem(line, "text after a flow collection");
    return node;
  }

  /** The value after "key:" or "- " on the same line: text, quoted text, a flow collection or a block scalar. */
  function inline(rest: string, parentIndent: number, line: number): YNode {
    if (/^[|>][+-]?\d?$/.test(rest)) return blockScalar(rest, parentIndent, line);
    if (rest.startsWith("[") || rest.startsWith("{")) return flow(rest, line);
    if (rest.startsWith('"') || rest.startsWith("'")) {
      const j = quotedEnd(rest, 0);
      if (j < 0) {
        problem(line, "a quoted text is not closed on its line");
        return { kind: "scalar", text: rest, quoted: false, line };
      }
      if (rest.slice(j + 1).trim() !== "") problem(line, "text after a quoted text");
      return { kind: "scalar", text: unquote(rest.slice(0, j + 1)), quoted: true, line };
    }
    unsupported(rest, line);
    return { kind: "scalar", text: rest, quoted: false, line };
  }

  function blockScalar(header: string, parentIndent: number, line: number): YNode {
    const folded = header[0] === ">";
    const chomp = header.includes("-") ? "strip" : header.includes("+") ? "keep" : "clip";
    advance();
    const lines: string[] = [];
    let blockIndent = -1;
    while (pos < raw.length) {
      const r = raw[pos] as string;
      if (r.trim() === "") {
        lines.push("");
        pos += 1;
        continue;
      }
      const ind = /^ */.exec(r)?.[0].length ?? 0;
      if (blockIndent < 0) {
        if (ind <= parentIndent) break;
        blockIndent = ind;
      } else if (ind < blockIndent) break;
      lines.push(r.slice(blockIndent));
      pos += 1;
    }
    // Blank lines that trail the block belong to the chomping, not to the text.
    let trailing = 0;
    while (lines.length > 0 && lines[lines.length - 1] === "") {
      lines.pop();
      trailing += 1;
    }
    let body: string;
    if (folded) {
      body = lines.reduce((acc, l, i) => (i === 0 ? l : l === "" ? `${acc}\n` : lines[i - 1] === "" || l.startsWith(" ") ? `${acc}${acc.endsWith("\n") ? "" : "\n"}${l}` : `${acc} ${l}`), "");
    } else body = lines.join("\n");
    if (lines.length > 0) body += chomp === "strip" ? "" : chomp === "keep" ? "\n".repeat(trailing + 1) : "\n";
    return { kind: "scalar", text: body, quoted: false, line };
  }

  function block(minIndent: number): YNode {
    const l = peek();
    if (l === null || l.indent < minIndent) return { kind: "null", line: l?.line ?? raw.length };
    if (l.text === "-" || l.text.startsWith("- ")) return seq(l.indent);
    if (splitKey(l.text) !== null) return map(l.indent);
    // A lone scalar line.
    advance();
    return inline(l.text, l.indent - 1, l.line);
  }

  function map(indent: number): YNode {
    const first = peek();
    const entries: YEntry[] = [];
    const seen = new Set<string>();
    for (;;) {
      const l = peek();
      if (l === null || l.indent !== indent) {
        if (l !== null && l.indent > indent) {
          problem(l.line, "unexpected indentation");
          advance();
          continue;
        }
        break;
      }
      const kv = splitKey(l.text);
      if (kv === null) {
        if (l.text === "-" || l.text.startsWith("- ")) break;
        problem(l.line, "expected a key");
        advance();
        continue;
      }
      if (seen.has(kv.key)) problem(l.line, `the key ${kv.key} is written twice`);
      seen.add(kv.key);
      if (kv.rest === "") {
        advance();
        const n = peek();
        let value: YNode;
        if (n !== null && n.indent > indent) value = block(n.indent);
        else if (n !== null && n.indent === indent && (n.text === "-" || n.text.startsWith("- "))) value = seq(indent);
        else value = { kind: "null", line: l.line };
        entries.push({ key: kv.key, value, line: l.line });
      } else {
        if (/^[|>][+-]?\d?$/.test(kv.rest)) {
          const v = blockScalar(kv.rest, indent, l.line);
          entries.push({ key: kv.key, value: v, line: l.line });
        } else {
          advance();
          entries.push({ key: kv.key, value: inline(kv.rest, indent, l.line), line: l.line });
        }
      }
    }
    return { kind: "map", entries, line: first?.line ?? 0 };
  }

  function seq(indent: number): YNode {
    const first = peek();
    const items: YNode[] = [];
    for (;;) {
      const l = peek();
      if (l === null || l.indent !== indent || !(l.text === "-" || l.text.startsWith("- "))) {
        if (l !== null && l.indent > indent) {
          problem(l.line, "unexpected indentation");
          advance();
          continue;
        }
        break;
      }
      const rest = l.text === "-" ? "" : l.text.slice(2).trimStart();
      const offset = l.text.length - rest.length;
      if (rest === "") {
        advance();
        const n = peek();
        items.push(n !== null && n.indent > indent ? block(n.indent) : { kind: "null", line: l.line });
      } else if (rest === "-" || rest.startsWith("- ")) {
        problem(l.line, "a list inside a list on one line is not read");
        advance();
        items.push({ kind: "scalar", text: rest, quoted: false, line: l.line });
      } else if (splitKey(rest) !== null && !/^[|>][+-]?\d?$/.test(rest) && !rest.startsWith("[") && !rest.startsWith("{")) {
        over = { indent: indent + offset, text: rest, line: l.line };
        items.push(map(indent + offset));
      } else if (/^[|>][+-]?\d?$/.test(rest)) {
        items.push(blockScalar(rest, indent, l.line));
      } else {
        advance();
        items.push(inline(rest, indent, l.line));
      }
    }
    return { kind: "seq", items, line: first?.line ?? 0 };
  }

  const start = peek();
  if (start === null) return { root: { kind: "null", line: 1 }, problems };
  const root = block(start.indent);
  const rest = peek();
  if (rest !== null) problem(rest.line, "text that could not be placed");
  return { root, problems };
}

/** The node under a key of a map, or undefined. */
export function get(node: YNode | undefined, key: string): YNode | undefined {
  if (node === undefined || node.kind !== "map") return undefined;
  return node.entries.find((e) => e.key === key)?.value;
}

/** The line a key of a map is written on, or undefined. */
export function lineOfKey(node: YNode | undefined, key: string): number | undefined {
  if (node === undefined || node.kind !== "map") return undefined;
  return node.entries.find((e) => e.key === key)?.line;
}

/** The text of a scalar node, or null for anything else. */
export function text(node: YNode | undefined): string | null {
  return node !== undefined && node.kind === "scalar" ? node.text : null;
}

export function keys(node: YNode | undefined): string[] {
  return node !== undefined && node.kind === "map" ? node.entries.map((e) => e.key) : [];
}

export function items(node: YNode | undefined): YNode[] {
  return node !== undefined && node.kind === "seq" ? node.items : [];
}

/** The scalar texts of a list, or of a single scalar as a list of one. Items that are not scalars are left out. */
export function texts(node: YNode | undefined): string[] {
  if (node === undefined) return [];
  if (node.kind === "scalar") return [node.text];
  return items(node).flatMap((n) => (n.kind === "scalar" ? [n.text] : []));
}
