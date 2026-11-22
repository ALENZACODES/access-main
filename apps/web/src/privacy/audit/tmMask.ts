// Blanks what is not code in a source text, so a search for a clock call does not find one in a comment or in a
// string. The result has the same length and the same line breaks as the text. Comments, the inside of quoted
// strings, the text of template strings and regular expression bodies become spaces; the code inside ${ } in a
// template stays. A quote that is not closed on its line is read as code (an apostrophe in JSX text), so one
// stray character cannot blank the rest of a file. It is a reader of text, not a parser.

const REGEX_AFTER = new Set(["(", ",", "=", ":", "[", "!", "&", "|", "?", "{", "}", ";", "+", "-", "*", "%", "<", ">", "~", "^"]);

function blank(out: string[], from: number, to: number): void {
  for (let k = from; k < to && k < out.length; k++) if (out[k] !== "\n") out[k] = " ";
}

/** The index just after the closing quote, or -1 when the quote is not closed on its line. */
function endOfQuoted(text: string, start: number): number {
  const q = text[start];
  let i = start + 1;
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") return -1;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === q) return i + 1;
    i++;
  }
  return -1;
}

/** The index just after a regular expression literal that starts at `start`, or -1 when it is not one. */
function endOfRegex(text: string, start: number): number {
  let i = start + 1;
  let inClass = false;
  while (i < text.length) {
    const c = text[i];
    if (c === "\n") return -1;
    if (c === "\\") {
      i += 2;
      continue;
    }
    if (c === "[") inClass = true;
    else if (c === "]") inClass = false;
    else if (c === "/" && !inClass) {
      i++;
      while (i < text.length && /[a-z]/.test(text[i] as string)) i++;
      return i;
    }
    i++;
  }
  return -1;
}

export function maskCode(text: string): string {
  const out = text.split("");
  // A stack of open template strings: each entry is the brace depth inside the ${ } that is open.
  const templates: number[] = [];
  let depth = 0;
  let prev = "";
  let i = 0;
  const readTemplateText = (from: number): number => {
    let k = from;
    while (k < text.length) {
      const c = text[k];
      if (c === "\\") {
        k += 2;
        continue;
      }
      if (c === "`") {
        blank(out, from, k);
        return k + 1;
      }
      if (c === "$" && text[k + 1] === "{") {
        blank(out, from, k);
        templates.push(depth);
        depth++;
        return k + 2;
      }
      k++;
    }
    blank(out, from, text.length);
    return text.length;
  };
  while (i < text.length) {
    const c = text[i] as string;
    const n = text[i + 1];
    if (c === "/" && n === "/") {
      const end = text.indexOf("\n", i);
      const stop = end < 0 ? text.length : end;
      blank(out, i, stop);
      i = stop;
      continue;
    }
    if (c === "/" && n === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? text.length : end + 2;
      blank(out, i, stop);
      i = stop;
      continue;
    }
    if (c === '"' || c === "'") {
      const end = endOfQuoted(text, i);
      if (end < 0) {
        prev = c;
        i++;
        continue;
      }
      blank(out, i + 1, end - 1);
      prev = c;
      i = end;
      continue;
    }
    if (c === "`") {
      i = readTemplateText(i + 1);
      prev = "`";
      continue;
    }
    if (c === "{") depth++;
    if (c === "}") {
      depth--;
      if (templates.length > 0 && templates[templates.length - 1] === depth) {
        templates.pop();
        i = readTemplateText(i + 1);
        prev = "`";
        continue;
      }
    }
    if (c === "/" && n !== ">" && (prev === "" || REGEX_AFTER.has(prev) || prev === "n") && !/\s/.test(n ?? " ")) {
      // A slash after an operator, a bracket or the word return starts a regular expression.
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
