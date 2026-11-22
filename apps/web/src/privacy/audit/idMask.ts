// Blanks the parts of a source text that are not code: comments, the text of strings, the text of templates (but not
// the expressions inside them) and regular expressions. The result has the same length and the same line breaks as
// the text, so an index or a line number found in the result is the same in the text. A scan that reads the result
// cannot be fooled by a sentence or a string that only mentions a name. It is a small reader, not a parser: a slash
// after a closing bracket is taken as division, and a slash after most other characters starts a regular expression.

const BLANK = " ";

function blank(s: string): string {
  return s.replace(/[^\n]/g, BLANK);
}

/** Whether a slash after this word is a division. Words like return and typeof are followed by a value, not a division. */
const VALUE_WORDS = new Set(["return", "typeof", "instanceof", "in", "of", "new", "delete", "void", "throw", "case", "do", "else", "yield", "await"]);

function lastSignificant(out: string): { ch: string; word: string } {
  let i = out.length - 1;
  while (i >= 0 && /\s/.test(out[i] as string)) i--;
  if (i < 0) return { ch: "", word: "" };
  const ch = out[i] as string;
  if (!/[\w$]/.test(ch)) return { ch, word: "" };
  let j = i;
  while (j >= 0 && /[\w$]/.test(out[j] as string)) j--;
  return { ch, word: out.slice(j + 1, i + 1) };
}

function slashStartsRegex(out: string): boolean {
  const { ch, word } = lastSignificant(out);
  if (ch === "") return true;
  if (ch === "<" && out.endsWith("<")) return false;
  if (word !== "") return VALUE_WORDS.has(word);
  return !/[)\]}]/.test(ch);
}

/** The end index (exclusive) of a regular expression that starts at i, or -1 when it does not end on its line. */
function regexEnd(s: string, i: number): number {
  let inClass = false;
  for (let j = i + 1; j < s.length; j++) {
    const c = s[j] as string;
    if (c === "\n") return -1;
    if (c === "\\") j++;
    else if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      let k = j + 1;
      while (k < s.length && /[a-z]/.test(s[k] as string)) k++;
      return k;
    }
  }
  return -1;
}

interface Reader {
  s: string;
  i: number;
  out: string[];
}

function readQuoted(r: Reader, quote: string): void {
  const start = r.i;
  const outStart = r.out.length;
  r.out.push(quote);
  r.i++;
  while (r.i < r.s.length) {
    const c = r.s[r.i] as string;
    if (c === "\\") {
      r.out.push(blank(r.s.slice(r.i, r.i + 2)));
      r.i += 2;
    } else if (c === quote) {
      r.out.push(quote);
      r.i++;
      return;
    } else if (c === "\n" && quote !== "`") {
      // A string does not run past the end of its line, so this quote was not a string (an apostrophe in the text of a
      // JSX element, say). Read the line again as code.
      r.out.length = outStart;
      r.out.push(quote);
      r.i = start + 1;
      return;
    } else {
      r.out.push(c === "\n" ? "\n" : BLANK);
      r.i++;
    }
  }
  if (quote !== "`" && r.i >= r.s.length) {
    r.out.length = outStart;
    r.out.push(quote);
    r.i = start + 1;
  }
}

function readTemplate(r: Reader): void {
  r.out.push("`");
  r.i++;
  while (r.i < r.s.length) {
    const c = r.s[r.i] as string;
    if (c === "\\") {
      r.out.push(blank(r.s.slice(r.i, r.i + 2)));
      r.i += 2;
    } else if (c === "`") {
      r.out.push("`");
      r.i++;
      return;
    } else if (c === "$" && r.s[r.i + 1] === "{") {
      r.out.push("${");
      r.i += 2;
      readCode(r, true);
    } else {
      r.out.push(c === "\n" ? "\n" : BLANK);
      r.i++;
    }
  }
}

/** Reads code. Inside a template expression it stops after the brace that closes the expression. */
function readCode(r: Reader, inTemplate: boolean): void {
  let depth = 0;
  while (r.i < r.s.length) {
    const c = r.s[r.i] as string;
    const next = r.s[r.i + 1];
    if (c === "/" && next === "/") {
      const end = r.s.indexOf("\n", r.i);
      const stop = end < 0 ? r.s.length : end;
      r.out.push(blank(r.s.slice(r.i, stop)));
      r.i = stop;
    } else if (c === "/" && next === "*") {
      const end = r.s.indexOf("*/", r.i + 2);
      const stop = end < 0 ? r.s.length : end + 2;
      r.out.push(blank(r.s.slice(r.i, stop)));
      r.i = stop;
    } else if (c === '"' || c === "'") {
      readQuoted(r, c);
    } else if (c === "`") {
      readTemplate(r);
    } else if (c === "/" && next !== ">" && slashStartsRegex(r.out.join(""))) {
      const end = regexEnd(r.s, r.i);
      if (end < 0) {
        r.out.push(c);
        r.i++;
      } else {
        const close = r.s.lastIndexOf("/", end - 1);
        r.out.push("/", blank(r.s.slice(r.i + 1, close)), r.s.slice(close, end));
        r.i = end;
      }
    } else if (inTemplate && c === "}" && depth === 0) {
      r.out.push("}");
      r.i++;
      return;
    } else {
      if (c === "{") depth++;
      else if (c === "}") depth--;
      r.out.push(c);
      r.i++;
    }
  }
}

/** The text with comments, strings, templates' own text and regular expressions blanked. Same length, same lines. */
export function maskCode(text: string): string {
  const r: Reader = { s: text, i: 0, out: [] };
  readCode(r, false);
  return r.out.join("");
}

/** The 1-based line of an index. */
export function lineAt(text: string, index: number): number {
  let n = 1;
  for (let i = 0; i < index && i < text.length; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
}
