// Reads the test and lint configuration files as text for the settings that decide which tests and files are checked
// and how a failure is treated: the vitest include and exclude lists, retry, bail, timeouts, passWithNoTests,
// allowOnly, silent; and the ESLint ignore list and any rule set to off or warn. A setting is found by its key in code
// (not in a comment or a string) and its list by the strings between the brackets that follow. A setting built by code
// the scan cannot read (a list made by a function, a key from a variable) is not found, and the list says nothing
// about it. Node only (tests and CI), never shipped to the browser.

import { lexCode, lineAt, lineStarts } from "./lexCode";

export type ConfigCode = "config-retry" | "config-bail" | "config-timeout" | "config-pass-with-no-tests" | "config-allow-only" | "config-silent" | "config-lint-off" | "config-lint-warn";

export const CONFIG_CODES: readonly ConfigCode[] = ["config-retry", "config-bail", "config-timeout", "config-pass-with-no-tests", "config-allow-only", "config-silent", "config-lint-off", "config-lint-warn"];

export interface ConfigFinding {
  code: ConfigCode;
  path: string;
  line: number;
  detail: string;
}

export interface ConfigFacts {
  path: string;
  /** The strings of the list after each key, by key: "include", "exclude", "ignores", "setupFiles". Absent when the key is not written. */
  lists: Record<string, string[]>;
  findings: ConfigFinding[];
}

const LIST_KEYS = ["include", "exclude", "ignores", "setupFiles", "globalSetup"] as const;

/** The index of the bracket in `code` that closes the one at `open`, or -1. */
function closeOf(code: string, open: number): number {
  let depth = 0;
  for (let i = open; i < code.length; i++) {
    const c = code[i];
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** The strings written directly in the list at `open` (not those in lists inside it), read from the original text. */
function stringsIn(text: string, code: string, open: number, close: number): string[] {
  const out: string[] = [];
  let depth = 0;
  for (let i = open; i < close; i++) {
    const c = code[i] as string;
    if (c === "[" || c === "{" || c === "(") depth++;
    else if (c === "]" || c === "}" || c === ")") depth--;
    else if ((c === '"' || c === "'" || c === "`") && depth === 1) {
      let j = i + 1;
      while (j < close && code[j] !== c) j++;
      out.push(text.slice(i + 1, j));
      i = j;
    }
  }
  return out;
}

/** Reads one configuration file. Never throws. */
export function scanConfig(path: string, text: string): ConfigFacts {
  const { code } = lexCode(text);
  const starts = lineStarts(text);
  const lists: Record<string, string[]> = {};
  for (const key of LIST_KEYS) {
    const re = new RegExp(`(?:^|[\\s,{])${key}\\s*:\\s*\\[`, "g");
    const m = re.exec(code);
    if (m === null) continue;
    const open = m.index + m[0].length - 1;
    const close = closeOf(code, open);
    if (close < 0) continue;
    lists[key] = stringsIn(text, code, open, close + 1);
  }
  const findings: ConfigFinding[] = [];
  const at = (index: number): number => lineAt(starts, index);
  const flag = (re: RegExp, code2: ConfigCode, what: (m: RegExpExecArray) => string): void => {
    re.lastIndex = 0;
    for (let m = re.exec(code); m !== null; m = re.exec(code)) findings.push({ code: code2, path, line: at(m.index), detail: what(m) });
  };
  flag(/(?:^|[\s,{])retry\s*:\s*([^,}\n]+)/g, "config-retry", (m) => `retry is set to ${(m[1] as string).trim()}`);
  flag(/(?:^|[\s,{])bail\s*:\s*([^,}\n]+)/g, "config-bail", (m) => `bail is set to ${(m[1] as string).trim()}`);
  flag(/(?:^|[\s,{])(testTimeout|hookTimeout|teardownTimeout)\s*:\s*([^,}\n]+)/g, "config-timeout", (m) => `${m[1]} is set to ${(m[2] as string).trim()}`);
  flag(/(?:^|[\s,{])passWithNoTests\s*:\s*true\b/g, "config-pass-with-no-tests", () => "passWithNoTests is true");
  flag(/(?:^|[\s,{])allowOnly\s*:\s*true\b/g, "config-allow-only", () => "allowOnly is true");
  flag(/(?:^|[\s,{])silent\s*:\s*true\b/g, "config-silent", () => "silent is true: console output of the tests is hidden");
  // A rule set to off or warn: the key is a quoted name, which the code text has blanked, so read these from the original.
  const rule = /(["'])([@\w/.-]+)\1\s*:\s*(?:\[\s*)?(?:(["'])(off|warn)\3|([01]))(?![\w"'])/g;
  for (let m = rule.exec(text); m !== null; m = rule.exec(text)) {
    if (code[m.index] !== m[1]) continue;
    const level = m[4] ?? (m[5] === "0" ? "off" : "warn");
    findings.push({ code: level === "off" ? "config-lint-off" : "config-lint-warn", path, line: at(m.index), detail: `${m[2]} is ${level}` });
  }
  findings.sort((a, b) => a.line - b.line || (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
  return { path, lists, findings };
}
