// Blanks what is not code in a source text, so a search for a coordinate write does not find one in a comment or a
// string. The result has the same length and the same line breaks as the text. Comments, the inside of quoted
// strings, the text of template strings and the body of regular expressions become spaces; the code inside ${ } in
// a template stays. A quote that is not closed on its line is read as code (an apostrophe in JSX text), so one stray
// character cannot blank the rest of a file. It reads text; it is not a parser.

const REGEX_AFTER = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

const blank = (out: string[], from: number, to: number): void => {
  for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
};

/** The index after the closing quote, or -1 when the quote is not closed on its line. */
function endOfQuoted(text: string, start: number): number {
  const q = text[start];
  for (let i = start + 1; i < text.length; ) {
    const c = text[i];
    if (c === "\n") return -1;
    if (c === "\\") i += 2;
    else if (c === q) return i + 1;
    else i++;
  }
  return -1;
}

/** The index after a regular expression literal that starts at `start`, or -1 when it is not one. */
function endOfRegex(text: string, start: number): number {
  let inClass = false;
  for (let i = start + 1; i < text.length; ) {
    const c = text[i];
    if (c === "\n") return -1;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      let k = i + 1;
      while (k < text.length && /[a-z]/.test(text[k] as string)) k++;
      return k;
    }
    i++;
  }
  return -1;
}

export function maskCode(text: string): string {
  const out = text.split("");
  const templates: number[] = [];
  let depth = 0;
  let prev = "";
  let i = 0;
  const templateText = (from: number): number => {
    for (let k = from; k < text.length; ) {
      const c = text[k];
      if (c === "\\") k += 2;
      else if (c === "`") {
        blank(out, from, k);
        return k + 1;
      } else if (c === "$" && text[k + 1] === "{") {
        blank(out, from, k);
        templates.push(depth++);
        return k + 2;
      } else k++;
    }
    blank(out, from, text.length);
    return text.length;
  };
  while (i < text.length) {
    const c = text[i] as string;
    const n = text[i + 1];
    if (c === "/" && (n === "/" || n === "*")) {
      const end = n === "/" ? text.indexOf("\n", i) : text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : n === "/" ? end : end + 2;
      blank(out, i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = endOfQuoted(text, i);
      prev = c;
      if (end < 0) i++;
      else {
        blank(out, i + 1, end - 1);
        i = end;
      }
      continue;
    }
    if (c === "`") {
      i = templateText(i + 1);
      prev = "`";
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (templates[templates.length - 1] === depth) {
        templates.pop();
        i = templateText(i + 1);
        prev = "`";
        continue;
      }
    }
    if (c === "/" && n !== ">" && (prev === "" || REGEX_AFTER.has(prev)) && !/\s/.test(n ?? " ")) {
      const end = endOfRegex(text, i);
      if (end > 0) {
        blank(out, i + 1, end - 1);
        prev = "/";
        i = end;
        continue;
      }
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out.join("");
}

/** The 1-based line of an index in a text. */
export function lineAt(text: string, index: number): number {
  let line = 1;
  for (let k = 0; k < index && k < text.length; k++) if (text[k] === "\n") line++;
  return line;
}
