// Finds the places where the App's code can send text out of the normal flow of the screens: the console, the
// debugger, the browser's dialogs, hooks for errors nobody caught, boundaries that catch errors in the screens,
// the text of a caught error, and the messages of the errors the code makes. It reads text, not a program: a name
// is taken for a caught error when it is bound by `catch (name)` or `.catch((name) =>` anywhere in the same file.

import { readTemplate, userLooking } from "./dgInterp";
import { identTokens, lineOf, skipString, skipTrivia } from "./jsLit";
import type { SourceFile } from "./repoAudit";

export type DgKind = "console" | "debugger" | "dialog" | "error-hook" | "boundary" | "error-text" | "error-stack" | "error-string" | "throw-template";

export const DG_KINDS: readonly DgKind[] = ["console", "debugger", "dialog", "error-hook", "boundary", "error-text", "error-stack", "error-string", "throw-template"];

export interface DgSite {
  path: string;
  line: number;
  kind: DgKind;
  /** What was found: the console method, the hook, the name, the interpolated expressions. */
  detail: string;
  /** For a thrown message with ${ }: the names in it that look like a value a person typed or chose. */
  userNames: string[];
}

type Tok = ReturnType<typeof identTokens>[number];

const DIALOGS = new Set(["alert", "confirm", "prompt"]);
const GLOBALS = new Set(["window", "self", "globalThis", "top", "parent"]);
const HOOK_PROPS = new Set(["onerror", "onunhandledrejection", "onrejectionhandled"]);
const HOOK_EVENTS = new Set(["error", "unhandledrejection", "rejectionhandled", "uncaughtException", "unhandledRejection"]);
const BOUNDARY_NAMES = new Set(["componentDidCatch", "getDerivedStateFromError"]);

/** Files this scan reads: the App's own code, not its tests and not the tools that build it. */
export function isScanned(path: string): boolean {
  if (!/\.(?:ts|tsx|js|jsx|mjs|cjs|mts|cts)$/.test(path)) return false;
  if (/(?:^|\/)(?:node_modules|dist|e2e)\//.test(path)) return false;
  if (/\.(?:test|spec)\.[cm]?[jt]sx?$/.test(path)) return false;
  if (/(?:^|\/)(?:test|tests|__tests__|fixtures)\//.test(path)) return false;
  return /^apps\/web\/src\//.test(path);
}

const nextCharAfter = (s: string, tok: Tok): number => skipTrivia(s, tok.end);

/** The names that a file binds as a caught error. */
export function caughtNames(s: string, toks: readonly Tok[]): Set<string> {
  const names = new Set<string>();
  toks.forEach((t) => {
    if (t.name !== "catch") return;
    const i = nextCharAfter(s, t);
    if (s[i] === "(" && t.prev !== ".") {
      // catch (name) or catch (name: unknown)
      const m = /^\(\s*([A-Za-z_$][\w$]*)/.exec(s.slice(i, i + 80));
      if (m?.[1]) names.add(m[1]);
      return;
    }
    // .catch((name) => ...) and .catch(name => ...): the `catch` is a method, so its token follows a dot.
    if (t.prev === ".") {
      const j = skipTrivia(s, t.end);
      if (s[j] !== "(") return;
      const m = /^\(\s*\(?\s*([A-Za-z_$][\w$]*)\s*(?::[^)=]*)?\)?\s*=>/.exec(s.slice(j, j + 120));
      if (m?.[1]) names.add(m[1] as string);
    }
  });
  return names;
}

/** The first argument of the call whose `(` is at `open`: its start index, or -1. */
function firstArg(s: string, open: number): number {
  const i = skipTrivia(s, open + 1);
  return i < s.length && s[i] !== ")" ? i : -1;
}

/** Everything the scan looks for, in the file. */
export function scanFile(f: SourceFile): DgSite[] {
  const s = f.text;
  const toks = identTokens(s);
  const caught = caughtNames(s, toks);
  const out: DgSite[] = [];
  const add = (t: Tok, kind: DgKind, detail: string, userNames: string[] = []): void => void out.push({ path: f.path, line: lineOf(s, t.start), kind, detail, userNames });
  const wordBefore = (k: number): Tok | undefined => (k > 0 ? toks[k - 1] : undefined);
  const isCaught = (tok: Tok | undefined): tok is Tok => tok !== undefined && tok.prev !== "." && caught.has(tok.name);
  const joinedBy = (a: Tok | undefined, b: Tok, sep: string): boolean => a !== undefined && s.slice(a.end, b.start).replace(/\s+/g, "") === sep;

  toks.forEach((t, k) => {
    const prevTok = wordBefore(k);
    // A word that is a key in an object (`reportError: "..."`) is a name, not a call.
    if (s[nextCharAfter(s, t)] === ":" && (t.prev === "{" || t.prev === ",")) return;
    if (t.name === "console" && t.prev !== ".") {
      const j = nextCharAfter(s, t);
      const m = /^\??\.\s*([A-Za-z_$][\w$]*)/.exec(s.slice(j, j + 60));
      add(t, "console", m?.[1] ?? "console");
    } else if (t.name === "debugger" && t.prev !== ".") add(t, "debugger", "debugger");
    else if (DIALOGS.has(t.name)) {
      const j = nextCharAfter(s, t);
      const viaGlobal = t.prev === "." && prevTok !== undefined && GLOBALS.has(prevTok.name) && joinedBy(prevTok, t, ".");
      const declared = prevTok?.name === "function";
      if (s[j] === "(" && (t.prev !== "." || viaGlobal) && !declared) add(t, "dialog", t.name);
    } else if (HOOK_PROPS.has(t.name) && t.prev === "." && prevTok !== undefined && GLOBALS.has(prevTok.name)) add(t, "error-hook", `${prevTok.name}.${t.name}`);
    else if (t.name === "reportError" && t.prev !== ".") add(t, "error-hook", "reportError");
    else if ((t.name === "addEventListener" || t.name === "on") && t.prev === ".") {
      const j = nextCharAfter(s, t);
      if (s[j] === "(") {
        const a = firstArg(s, j);
        const q = a >= 0 ? s[a] : "";
        if (a >= 0 && (q === '"' || q === "'")) {
          const e = skipString(s, a);
          const ev = e > 0 ? s.slice(a + 1, e - 1) : "";
          if (HOOK_EVENTS.has(ev)) add(t, "error-hook", `${t.name}("${ev}")`);
        }
      }
    } else if (BOUNDARY_NAMES.has(t.name)) add(t, "boundary", t.name);
    else if (t.name === "message" && t.prev === "." && isCaught(prevTok) && joinedBy(prevTok, t, ".")) {
      // Comparing the text with a fixed one, or testing it, does not put it anywhere.
      const after = s.slice(nextCharAfter(s, t), nextCharAfter(s, t) + 16);
      if (!/^(?:[!=]==?|\.(?:includes|startsWith|endsWith|match|test|length)\b)/.test(after)) add(t, "error-text", `${prevTok.name}.message`);
    }
    else if (t.name === "stack" && t.prev === "." && isCaught(prevTok) && joinedBy(prevTok, t, ".")) add(t, "error-stack", `${prevTok.name}.stack`);
    else if (t.name === "String" && t.prev !== ".") {
      const j = nextCharAfter(s, t);
      const m = s[j] === "(" ? /^\(\s*([A-Za-z_$][\w$]*)\s*\)/.exec(s.slice(j, j + 60)) : null;
      if (m?.[1] && caught.has(m[1])) add(t, "error-string", `String(${m[1]})`);
    } else if (t.name === "toString" && t.prev === "." && isCaught(prevTok) && joinedBy(prevTok, t, ".")) add(t, "error-string", `${prevTok.name}.toString`);
    else if (/^(?:[A-Z]\w*)?Error$/.test(t.name) && prevTok?.name === "new" && t.prev !== ".") {
      const j = nextCharAfter(s, t);
      if (s[j] !== "(") return;
      const a = firstArg(s, j);
      if (a < 0 || s[a] !== "`") return;
      const tpl = readTemplate(s, a);
      if (tpl.exprs.length > 0) add(t, "throw-template", `${t.name}: ${tpl.exprs.join(" | ")}`, [...new Set(tpl.exprs.flatMap(userLooking))]);
    }
  });
  return out.sort((a, b) => a.line - b.line || (a.kind < b.kind ? -1 : a.kind > b.kind ? 1 : 0));
}

/** Every site in the files that are scanned, in path and line order. */
export function scanDiagnostics(files: readonly SourceFile[]): DgSite[] {
  const out: DgSite[] = [];
  for (const f of [...files].filter((x) => isScanned(x.path)).sort((a, b) => (a.path < b.path ? -1 : 1))) out.push(...scanFile(f));
  return out;
}

/** How many `throw` statements the files hold, for the report: the denominator of the thrown messages. */
export function countThrows(files: readonly SourceFile[]): number {
  let n = 0;
  for (const f of files) {
    if (!isScanned(f.path)) continue;
    for (const t of identTokens(f.text)) if (t.name === "throw" && t.prev !== ".") n += 1;
  }
  return n;
}
