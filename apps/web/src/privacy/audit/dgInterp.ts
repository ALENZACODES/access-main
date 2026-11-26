// Reads a template literal written in source: the fixed text and the expressions in ${ }. It is given the literal
// as written, from the opening backtick, and never throws.

import { matchClose, skipString } from "./jsLit";

export interface TemplateParts {
  /** The text between the expressions, as written, without reading escapes. */
  text: string[];
  /** The source of each expression in ${ }, trimmed. */
  exprs: string[];
  /** True when the literal is closed. */
  closed: boolean;
  /** The index after the literal in the text it was read from, or the end of the text when it is not closed. */
  end: number;
}

/** Splits the template literal that starts at `from` (which must be a backtick). */
export function readTemplate(s: string, from: number): TemplateParts {
  const out: TemplateParts = { text: [], exprs: [], closed: false, end: s.length };
  if (s[from] !== "`") return out;
  let cur = "";
  for (let j = from + 1; j < s.length; j++) {
    const c = s[j] as string;
    if (c === "\\") {
      cur += c + (s[j + 1] ?? "");
      j++;
    } else if (c === "`") {
      out.text.push(cur);
      out.closed = true;
      out.end = j + 1;
      return out;
    } else if (c === "$" && s[j + 1] === "{") {
      const close = matchClose(s, j + 1);
      if (close < 0) return out;
      out.text.push(cur);
      cur = "";
      out.exprs.push(s.slice(j + 2, close).trim());
      j = close;
    } else cur += c;
  }
  return out;
}

/** The identifier names an expression reads, in order, leaving out strings, member names after a dot and keywords. */
export function namesIn(expr: string): string[] {
  const out: string[] = [];
  let prevDot = false;
  for (let i = 0; i < expr.length; ) {
    const c = expr[i] as string;
    if (c === "'" || c === '"' || c === "`") {
      const e = skipString(expr, i);
      i = e < 0 ? expr.length : e;
      prevDot = false;
      continue;
    }
    if (/[A-Za-z_$]/.test(c)) {
      let j = i + 1;
      while (j < expr.length && /[\w$]/.test(expr[j] as string)) j++;
      const word = expr.slice(i, j);
      if (!prevDot && !KEYWORDS.has(word)) out.push(word);
      prevDot = false;
      i = j;
      continue;
    }
    if (c === ".") prevDot = true;
    else if (c !== " " && c !== "?" && c !== "!") prevDot = false;
    i++;
  }
  return out;
}

const KEYWORDS = new Set(["true", "false", "null", "undefined", "typeof", "instanceof", "new", "in", "of", "void", "this"]);

/** The member names an expression reads after a dot, in order: `a.b.c` gives b and c. */
export function membersIn(expr: string): string[] {
  const out: string[] = [];
  const re = /\??\.\s*([A-Za-z_$][\w$]*)/g;
  let m = re.exec(expr);
  while (m) {
    out.push(m[1] as string);
    m = re.exec(expr);
  }
  return out;
}

/** Names that suggest a value a person typed, chose or that says where they are. */
export const USER_NAMES = /^(?:query|search|q|text|input|note|notes|comment|name|label|title|address|street|email|phone|postal|postcode|zip|city|lat|lon|lng|latitude|longitude|coords?|location|user|username|content|description|draft|answer|reply|freeText)$/i;

/** The names in an expression, and in its members, that look like user values. */
export function userLooking(expr: string): string[] {
  return [...new Set([...namesIn(expr), ...membersIn(expr)].filter((n) => USER_NAMES.test(n)))];
}
