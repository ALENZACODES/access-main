// Splits the text of a TypeScript or JavaScript file into its comments and its code. The code comes back as text of the
// same length in which every comment and the inside of every string, template and regular expression is replaced by
// spaces (line breaks stay), so a search of it cannot match words that are only written in a comment or a string. The
// reader follows the quotes and slashes; it does not parse the language. Text that is not code (for example the words of
// a page written in JSX, where an apostrophe is not a quote) may be read as a string that runs to the end of the line,
// which hides that line's text and nothing else. Node only (tests and CI), never shipped to the browser.

export interface LexComment {
  kind: "line" | "block";
  /** The index of the first character of the delimiter. */
  start: number;
  /** The index after the last character (after the closing delimiter of a block comment). */
  end: number;
  /** The 1-based line on which the comment starts. */
  line: number;
  /** The text inside the delimiters, as written. */
  text: string;
}

export interface Lexed {
  comments: LexComment[];
  code: string;
}

const REGEX_AFTER = "(,=:[!&|?{};+-*%<>~^";

export function lineStarts(text: string): number[] {
  const out = [0];
  for (let i = 0; i < text.length; i++) if (text[i] === "\n") out.push(i + 1);
  return out;
}

/** The 1-based line of an index, given the starts from lineStarts. */
export function lineAt(starts: readonly number[], index: number): number {
  let lo = 0;
  let hi = starts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if ((starts[mid] as number) <= index) lo = mid;
    else hi = mid - 1;
  }
  return lo + 1;
}

export function lexCode(text: string): Lexed {
  const n = text.length;
  const out = text.split("");
  const comments: LexComment[] = [];
  const starts = lineStarts(text);
  const braces: number[] = [];
  let depth = 0;
  let prev = "";
  let i = 0;

  const blank = (a: number, b: number): void => {
    for (let k = a; k < b; k++) if (out[k] !== "\n") out[k] = " ";
  };

  /** Reads template text from `from` to the closing back-tick or to a ${ ; returns the index to go on from. */
  const templateText = (from: number): number => {
    let k = from;
    while (k < n) {
      const c = text[k] as string;
      if (c === "\\") k += 2;
      else if (c === "`") {
        blank(from, k);
        prev = "a";
        return k + 1;
      } else if (c === "$" && text[k + 1] === "{") {
        blank(from, k);
        braces.push(depth);
        depth++;
        prev = "{";
        return k + 2;
      } else k++;
    }
    blank(from, n);
    return n;
  };

  while (i < n) {
    const c = text[i] as string;
    if (c === "/" && text[i + 1] === "/") {
      let e = text.indexOf("\n", i);
      if (e < 0) e = n;
      comments.push({ kind: "line", start: i, end: e, line: lineAt(starts, i), text: text.slice(i + 2, e) });
      blank(i, e);
      i = e;
    } else if (c === "/" && text[i + 1] === "*") {
      const close = text.indexOf("*/", i + 2);
      const e = close < 0 ? n : close + 2;
      comments.push({ kind: "block", start: i, end: e, line: lineAt(starts, i), text: text.slice(i + 2, close < 0 ? n : close) });
      blank(i, e);
      i = e;
    } else if (c === "'" || c === '"') {
      let k = i + 1;
      while (k < n) {
        const d = text[k] as string;
        if (d === "\\") k += 2;
        else if (d === c || d === "\n") break;
        else k++;
      }
      const stop = Math.min(k, n);
      blank(i + 1, stop);
      i = text[stop] === c ? stop + 1 : stop;
      prev = "a";
    } else if (c === "`") {
      i = templateText(i + 1);
    } else if (c === "/" && (prev === "" || REGEX_AFTER.includes(prev))) {
      let k = i + 1;
      let inClass = false;
      let closed = false;
      while (k < n) {
        const d = text[k] as string;
        if (d === "\n") break;
        if (d === "\\") k += 2;
        else {
          if (d === "[") inClass = true;
          else if (d === "]") inClass = false;
          else if (d === "/" && !inClass) {
            closed = true;
            break;
          }
          k++;
        }
      }
      if (closed) {
        blank(i + 1, k);
        i = k + 1;
        while (i < n && /[a-z]/i.test(text[i] as string)) i++;
        prev = "a";
      } else {
        prev = "/";
        i++;
      }
    } else {
      if (c === "{") depth++;
      else if (c === "}") {
        depth--;
        const top = braces[braces.length - 1];
        if (top !== undefined && depth === top) {
          braces.pop();
          i = templateText(i + 1);
          continue;
        }
      }
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") prev = c;
      i++;
    }
  }
  return { comments, code: out.join("") };
}
