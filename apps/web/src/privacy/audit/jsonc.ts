// Reads JSON as written in the TypeScript configuration files: comments and a comma before a closing bracket are
// allowed. Comments and such commas are blanked out (line breaks stay, so a line in the blanked text is the same line
// in the file) and the rest goes to JSON.parse. A text that cannot be read is reported, not thrown. Node only (tests and
// CI), never shipped to the browser.

export type JsonVal = null | boolean | number | string | JsonVal[] | { [key: string]: JsonVal };

export interface JsoncResult {
  value: JsonVal | undefined;
  problem: string | null;
  /** The 1-based line the problem is on (1 when it cannot be told). */
  line: number;
}

/** The text with comments and trailing commas replaced by spaces. Strings are left as they are. */
export function stripJsonc(text: string): string {
  const out = text.replace(/^\uFEFF/, "").split("");
  const n = out.length;
  let i = 0;
  let lastComma = -1;
  while (i < n) {
    const c = out[i] as string;
    if (c === '"') {
      i++;
      while (i < n && out[i] !== '"' && out[i] !== "\n") i += out[i] === "\\" ? 2 : 1;
      i++;
      lastComma = -1;
    } else if (c === "/" && out[i + 1] === "/") {
      while (i < n && out[i] !== "\n") out[i++] = " ";
    } else if (c === "/" && out[i + 1] === "*") {
      const end = text.indexOf("*/", i + 2);
      const stop = end < 0 ? n : end + 2;
      for (let k = i; k < stop; k++) if (out[k] !== "\n") out[k] = " ";
      i = stop;
    } else if (c === ",") {
      lastComma = i;
      i++;
    } else if (c === "}" || c === "]") {
      if (lastComma >= 0) out[lastComma] = " ";
      lastComma = -1;
      i++;
    } else {
      if (c !== " " && c !== "\t" && c !== "\n" && c !== "\r") lastComma = -1;
      i++;
    }
  }
  return out.join("");
}

/** Reads the text. The value is undefined when there is a problem. */
export function parseJsonc(text: string): JsoncResult {
  const stripped = stripJsonc(text);
  try {
    return { value: JSON.parse(stripped) as JsonVal, problem: null, line: 1 };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    const at = /position (\d+)/.exec(message);
    const line = at === null ? 1 : stripped.slice(0, Number(at[1])).split("\n").length;
    return { value: undefined, problem: message, line };
  }
}

/** The line of the first key with this name in the text, outside comments, or 0 when there is none. */
export function keyLine(text: string, key: string, from = 0): number {
  const stripped = stripJsonc(text);
  const needle = new RegExp(`"${key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}"\\s*:`, "g");
  needle.lastIndex = from;
  const m = needle.exec(stripped);
  return m === null ? 0 : stripped.slice(0, m.index).split("\n").length;
}

export const isObject = (v: JsonVal | undefined): v is { [key: string]: JsonVal } => typeof v === "object" && v !== null && !Array.isArray(v);
export const isArray = (v: JsonVal | undefined): v is JsonVal[] => Array.isArray(v);
