// Reads the text of a pack file (the manifest or the content) without assuming its shape. It lists every text value
// with where it is written, the name of its key and the language it is in when the file says so. It never throws.

export type PkLang = "en" | "fr";

export interface PkLeaf {
  /** Where the value is, for example `places[3].provenance.source_url`. */
  path: string;
  /** The last key. For a value in a list, the key of the list. */
  key: string;
  text: string;
  /** The language the file gives it, or null when it gives none. */
  lang: PkLang | null;
}

export interface PkNumberLeaf {
  path: string;
  key: string;
  value: number;
}

export interface PkWalked {
  leaves: PkLeaf[];
  numbers: PkNumberLeaf[];
  /** Paths whose value is null. */
  nulls: string[];
  /** True when the walk stopped early at the depth or size limit. */
  truncated: boolean;
}

export const MAX_DEPTH = 12;
export const MAX_NODES = 50_000;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

const langOf = (v: unknown): PkLang | null => (v === "en" || v === "fr" ? v : null);

/** A language given by the key itself (`en` or `fr`), or by a sibling `<key>_language` of the same object. */
function ownLang(parent: Record<string, unknown> | null, key: string, inherited: PkLang | null): PkLang | null {
  if (key === "en" || key === "fr") return key;
  if (parent) {
    const sibling = langOf(parent[`${key}_language`]);
    if (sibling) return sibling;
  }
  return inherited;
}

/** Every text and number in the value, in the order written. */
export function walkPack(root: unknown): PkWalked {
  const out: PkWalked = { leaves: [], numbers: [], nulls: [], truncated: false };
  let nodes = 0;
  const visit = (v: unknown, path: string, key: string, parent: Record<string, unknown> | null, lang: PkLang | null, depth: number): void => {
    nodes += 1;
    if (nodes > MAX_NODES || depth > MAX_DEPTH) {
      out.truncated = true;
      return;
    }
    if (typeof v === "string") out.leaves.push({ path, key, text: v, lang: ownLang(parent, key, lang) });
    else if (typeof v === "number") out.numbers.push({ path, key, value: v });
    else if (v === null) out.nulls.push(path);
    else if (Array.isArray(v)) v.forEach((item, i) => visit(item, `${path}[${i}]`, key, null, lang, depth + 1));
    else if (isRecord(v)) {
      for (const k of Object.keys(v)) visit(v[k], path === "" ? k : `${path}.${k}`, k, v, ownLang(parent, key, lang), depth + 1);
    }
  };
  visit(root, "", "", null, null, 0);
  return out;
}

/** Parses JSON, giving null for text that is not JSON. */
export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export { isRecord };
