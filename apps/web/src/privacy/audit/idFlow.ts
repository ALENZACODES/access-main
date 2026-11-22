// Follows an identifier a short way: the name it is bound to on the line that makes it, and the other lines of the
// same file that use that name together with a store or a network call. It reads one file. It cannot follow a value
// through an object (`id: crypto.randomUUID()`), a function argument or another file, so it says "key" or "none" for
// those instead of a name, and the lines it gives are only the ones it could see.

import { maskCode } from "./idMask";
import type { SourceFile } from "./repoAudit";
import { isIdScanned, scanFile } from "./idScan";
import type { IdKind, IdSite } from "./idScan";

export type Binding = { kind: "name"; name: string } | { kind: "key"; name: string } | { kind: "none" };

export interface IdFlow {
  site: IdSite;
  binding: Binding;
  /** Lines (not the line of the site) that use the name together with a store: put, add, setItem. */
  storedLines: number[];
  /** Lines (not the line of the site) that use the name together with a network call: fetch, send, sendBeacon, postMessage. */
  networkLines: number[];
}

const MAKERS: ReadonlySet<IdKind> = new Set(["uuid", "random-bytes", "math-random", "time-id"]);
const RE_STORE = /\.\s*(?:put|add|bulkPut|setItem)\s*\(/;
const RE_NETWORK = /\bfetch\s*\(|\.\s*(?:send|sendBeacon|postMessage)\s*\(|\bXMLHttpRequest\b|\bWebSocket\b/;

/** What the value made at this index on this line is bound to. */
export function bindingOf(maskedLine: string, column: number): Binding {
  const before = maskedLine.slice(0, column);
  const decl = /(?:^|[\s;(])(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]*)?=\s*[^=]*$/.exec(before);
  if (decl) return { kind: "name", name: decl[1] as string };
  const assign = /(?:^|[\s;(])([A-Za-z_$][\w$.]*)\s*=\s*[^=]*$/.exec(before);
  if (assign && !/^(?:const|let|var)$/.test(assign[1] as string)) return { kind: "name", name: (assign[1] as string).split(".").pop() as string };
  const key = /(?:^|[\s,{(])([A-Za-z_$][\w$]*)\s*:\s*[^:]*$/.exec(before);
  if (key) return { kind: "key", name: key[1] as string };
  return { kind: "none" };
}

function wordRe(name: string): RegExp {
  return new RegExp(`(?<![\\w$.])${name.replace(/[$]/g, "\\$")}(?![\\w$])`);
}

/** Flows for the identifiers made in one file. Only the kinds that make an identifier are followed. */
export function flowsInFile(file: SourceFile): IdFlow[] {
  if (!isIdScanned(file.path)) return [];
  const masked = maskCode(file.text);
  const lines = masked.split("\n");
  const sites = scanFile(file).filter((s) => MAKERS.has(s.kind));
  const out: IdFlow[] = [];
  for (const site of sites) {
    const lineText = lines[site.line - 1] ?? "";
    const column = lineText.search(/crypto|Math|\.\s*(?:randomUUID|getRandomValues)|\bc\s*\./);
    const binding = bindingOf(lineText, column < 0 ? lineText.length : column);
    const stored: number[] = [];
    const network: number[] = [];
    if (binding.kind === "name") {
      const re = wordRe(binding.name);
      lines.forEach((l, i) => {
        if (i + 1 === site.line || !re.test(l)) return;
        if (RE_STORE.test(l)) stored.push(i + 1);
        if (RE_NETWORK.test(l)) network.push(i + 1);
      });
    }
    out.push({ site, binding, storedLines: stored, networkLines: network });
  }
  return out;
}

export function flowsOf(files: readonly SourceFile[]): IdFlow[] {
  return files.flatMap(flowsInFile).sort((a, b) => (a.site.path < b.site.path ? -1 : a.site.path > b.site.path ? 1 : a.site.line - b.site.line));
}

/** The flows whose bound name is used on a line with a network call. */
export function reachingNetwork(flows: readonly IdFlow[]): IdFlow[] {
  return flows.filter((f) => f.networkLines.length > 0);
}

/** The flows that could not be followed: bound to a key, or to nothing. */
export function unfollowed(flows: readonly IdFlow[]): IdFlow[] {
  return flows.filter((f) => f.binding.kind !== "name");
}

export function describeFlow(f: IdFlow): string {
  const b = f.binding.kind === "none" ? "no name" : `${f.binding.kind} ${f.binding.name}`;
  return `${f.site.path}:${f.site.line} ${f.site.detail} -> ${b}; stored ${f.storedLines.join(",") || "-"}; network ${f.networkLines.join(",") || "-"}`;
}
