// Reads the shipped packs from a checkout and audits each. Node only (tests and CI), never shipped.

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { hostsOf, type PkRead } from "./pkCompare";
import { PK_REGISTER } from "./pkRegister";
import { auditPack } from "./pkRules";
import { isRecord, parseJson, walkPack } from "./pkWalk";

export const PACKS_FOLDER = "apps/web/public/packs";

/** The bytes of a file as a count, read through the one typed form of readFileSync by its text. */
export function byteLength(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0) ?? 0;
    n += c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4;
  }
  return n;
}

export interface PkLoaded {
  packs: PkRead[];
  /** The folders found under the packs folder, with how many files each holds. */
  folders: Array<{ id: string; files: string[] }>;
}

/** The pack's addresses: every text under a key that holds one. */
export function urlsIn(value: unknown): string[] {
  return walkPack(value)
    .leaves.filter((l) => (l.key === "url" || l.key.endsWith("_url")) && l.text !== "")
    .map((l) => l.text);
}

export function loadPacks(root: string): PkLoaded {
  const base = join(root, PACKS_FOLDER);
  const loaded: PkLoaded = { packs: [], folders: [] };
  if (!existsSync(base)) return loaded;
  for (const id of readdirSync(base).sort()) {
    const dir = join(base, id);
    if (!statSync(dir).isDirectory()) continue;
    const files = readdirSync(dir).sort();
    loaded.folders.push({ id, files });
    const manifestText = existsSync(join(dir, "manifest.json")) ? readFileSync(join(dir, "manifest.json"), "utf8") : "";
    const contentText = existsSync(join(dir, "content.json")) ? readFileSync(join(dir, "content.json"), "utf8") : "";
    const manifest = parseJson(manifestText);
    const content = parseJson(contentText);
    const measured = contentText === "" ? null : { bytes: byteLength(contentText), sha256: createHash("sha256").update(contentText, "utf8").digest("hex") };
    const hosts = hostsOf([...urlsIn(manifest), ...urlsIn(content)]);
    const sources = isRecord(manifest) && Array.isArray(manifest["source_dates"]) ? manifest["source_dates"].filter(isRecord).map((s) => ({ name: String(s["source_name"]), licence: String(s["licence"]) })) : [];
    const known = PK_REGISTER.find((r) => r.id === id)?.hosts ?? [];
    loaded.packs.push({ id, hosts, sources, findings: auditPack({ manifest, content, measured }, { hosts: known }) });
  }
  return loaded;
}
