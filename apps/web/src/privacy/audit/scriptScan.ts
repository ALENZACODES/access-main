// Finds the commands in package.json scripts that would let a failing step pass, switch off a check or fetch code at run
// time: a failure turned into success, a flag that lets an empty test run pass, a retry, a timeout change, a hook
// skipped, a forced install, a program piped into a shell, and a script that runs when the package is installed. It reads
// the text of the scripts; it does not run them, and a command built by another script it calls is not followed. Node
// only (tests and CI), never shipped to the browser.

export type ScriptCode =
  | "script-failure-ignored"
  | "script-no-tests-pass"
  | "script-retry"
  | "script-timeout"
  | "script-hook-skipped"
  | "script-force"
  | "script-fetches"
  | "script-pipe-to-shell"
  | "script-install-lifecycle"
  | "script-unreadable";

export const SCRIPT_CODES: readonly ScriptCode[] = [
  "script-failure-ignored",
  "script-no-tests-pass",
  "script-retry",
  "script-timeout",
  "script-hook-skipped",
  "script-force",
  "script-fetches",
  "script-pipe-to-shell",
  "script-install-lifecycle",
  "script-unreadable",
];

export interface ScriptFinding {
  code: ScriptCode;
  path: string;
  /** The name of the script, or "" for a problem with the whole file. */
  script: string;
  detail: string;
}

const INSTALL_LIFECYCLE = new Set(["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishOnly", "prepack", "postpack"]);

interface Pattern {
  code: ScriptCode;
  re: RegExp;
  what: string;
}

const PATTERNS: Pattern[] = [
  { code: "script-failure-ignored", re: /\|\|\s*(?:true|exit\s+0|:)(?=\s|;|&|\||$)/, what: "a failure is turned into success with ||" },
  { code: "script-failure-ignored", re: /;\s*(?:true|exit\s+0)(?=\s|;|&|\||$)/, what: "a failure is turned into success with ;" },
  { code: "script-failure-ignored", re: /--exit-zero\b/, what: "--exit-zero" },
  { code: "script-failure-ignored", re: /--no-error-on-unmatched-pattern\b/, what: "--no-error-on-unmatched-pattern" },
  { code: "script-failure-ignored", re: /--max-warnings[= ]+(?:[1-9]\d{2,}|-1)\b/, what: "--max-warnings with a number that is no limit" },
  { code: "script-no-tests-pass", re: /--passWithNoTests\b/, what: "--passWithNoTests" },
  { code: "script-no-tests-pass", re: /--allowOnly\b/, what: "--allowOnly" },
  { code: "script-retry", re: /--retr(?:y|ies)\b/, what: "a retry flag" },
  { code: "script-timeout", re: /--(?:testTimeout|hookTimeout|teardownTimeout)\b/, what: "a test timeout flag" },
  { code: "script-timeout", re: /(?:^|\s)timeout\s+\d+/, what: "the timeout command" },
  { code: "script-hook-skipped", re: /--no-verify\b/, what: "--no-verify" },
  { code: "script-hook-skipped", re: /\bHUSKY\s*=\s*0\b/, what: "HUSKY=0" },
  { code: "script-force", re: /(?:^|\s)--force\b/, what: "--force" },
  { code: "script-force", re: /--legacy-peer-deps\b/, what: "--legacy-peer-deps" },
  { code: "script-fetches", re: /(?:^|[\s&|;(])(?:curl|wget)(?=\s)/, what: "curl or wget" },
  { code: "script-pipe-to-shell", re: /\|\s*(?:sudo\s+)?(?:ba|z|da)?sh\b/, what: "a pipe into a shell" },
];

/** The scripts of a package.json as name and command, in the order written; null when the text is not a package file. */
export function readScripts(text: string): Array<[string, string]> | null {
  let v: unknown;
  try {
    v = JSON.parse(text);
  } catch {
    return null;
  }
  if (typeof v !== "object" || v === null || Array.isArray(v)) return null;
  const s = (v as Record<string, unknown>)["scripts"];
  if (s === undefined) return [];
  if (typeof s !== "object" || s === null || Array.isArray(s)) return null;
  return Object.entries(s as Record<string, unknown>).filter((e): e is [string, string] => typeof e[1] === "string");
}

/** The findings for one package.json, in the order of its scripts. */
export function scanScripts(path: string, text: string): ScriptFinding[] {
  const scripts = readScripts(text);
  if (scripts === null) return [{ code: "script-unreadable", path, script: "", detail: "the file is not JSON with an object of scripts" }];
  const out: ScriptFinding[] = [];
  for (const [name, command] of scripts) {
    if (INSTALL_LIFECYCLE.has(name)) out.push({ code: "script-install-lifecycle", path, script: name, detail: `${name} runs when the package is installed or packed: ${command.slice(0, 60)}` });
    for (const p of PATTERNS) if (p.re.test(command)) out.push({ code: p.code, path, script: name, detail: p.what });
  }
  return out;
}
