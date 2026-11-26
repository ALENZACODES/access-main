/**
 * Share a view of the pack places page as text: the search words, the wheelchair tag, the kind and the
 * source filters become a short "view code" that can be pasted into a message and read back on another
 * device. The code holds nothing about the person. It leaves out the starting point a person typed, and
 * the distance band that depends on it. A line that cannot be read is left out and listed, never guessed
 * at. Pressing the button is what applies a view.
 */
import { kindKey } from "./packCategories";
import { EMPTY_FACETS, FACET_IDS, type FacetId, type FacetSelection, selectFacet } from "./packFacets";
import { type TagFilter, TAG_FILTERS } from "./packPlacesView";
import { SEARCH_MAX_CHARS } from "./packSearchParse";

export const VIEW_CODE_HEADER = "VIEW v1";
/** A pasted code is cut here, so a very large paste cannot make the page slow. */
export const MAX_VIEW_CODE_CHARS = 2000;
export const MAX_VIEW_CODE_LINES = 20;

export const VIEW_KEYS = ["search", "tag", "kind", ...FACET_IDS] as const;
export type ViewKey = (typeof VIEW_KEYS)[number];

export interface ViewParts {
  readonly text: string;
  readonly tag: TagFilter;
  /** A kind key from packCategories, or null for every kind. */
  readonly kind: string | null;
  readonly facets: FacetSelection;
}

export const EMPTY_VIEW_PARTS: ViewParts = { text: "", tag: "any", kind: null, facets: EMPTY_FACETS };

// eslint-disable-next-line no-control-regex -- control characters are exactly what is removed
const CONTROL = /[\u0000-\u001F\u007F\u2028\u2029\u202A-\u202E\u2066-\u2069]/g;
const oneLine = (s: string): string => s.replace(CONTROL, " ").replace(/\s+/g, " ").trim();

/** What a view holds for one key, as one line of text. Empty when the key is not set. The search is cut to the search limit. */
const valueOf = (v: ViewParts, k: ViewKey): string => (k === "search" ? oneLine(v.text).slice(0, SEARCH_MAX_CHARS) : k === "tag" ? (v.tag === "any" ? "" : v.tag) : oneLine((k === "kind" ? v.kind : v.facets[k]) ?? ""));

/** The keys a view sets, in code order. */
export const viewKeys = (v: ViewParts): ViewKey[] => VIEW_KEYS.filter((k) => valueOf(v, k) !== "");

export const viewIsEmpty = (v: ViewParts): boolean => viewKeys(v).length === 0;

/** One line for each thing the view sets. */
export const viewToCode = (v: ViewParts): string => `${[VIEW_CODE_HEADER, ...viewKeys(v).map((k) => `${k}: ${valueOf(v, k)}`)].join("\n")}\n`;

export interface ParsedView {
  /** False when nothing in the paste could be used; the view is then the default one. */
  readonly ok: boolean;
  /** The view the code sets. Anything the code leaves out is the default, so applying it clears the rest. */
  readonly view: ViewParts;
  readonly applied: readonly ViewKey[];
  /** The key of each line that was not used, as written. */
  readonly ignored: readonly string[];
}

const LINE = /^\s*([^\s:]+)\s*:\s?(.*)$/;
const HEADER = /^\s*VIEW\s+v(\d+)\s*$/i;

export function parseViewCode(raw: string): ParsedView {
  const lines = raw.slice(0, MAX_VIEW_CODE_CHARS).split(/\r\n|\r|\n/).map((l) => l.replace(CONTROL, " ")).filter((l) => l.trim() !== "");
  const head = HEADER.exec(lines[0] ?? "");
  // A header from another version is not read at all.
  const body = head !== null && head[1] !== "1" ? [] : lines.slice(head === null ? 0 : 1, MAX_VIEW_CODE_LINES + 1);
  const view: { -readonly [K in keyof ViewParts]: ViewParts[K] } = { ...EMPTY_VIEW_PARTS };
  const applied: ViewKey[] = [];
  const ignored: string[] = [];
  for (const line of body) {
    const m = LINE.exec(line);
    const key = m === null ? line.trim() : m[1]!;
    const name = key.toLowerCase() as ViewKey;
    const value = oneLine(m?.[2] ?? "");
    const lower = value.toLowerCase();
    const facet = (FACET_IDS as readonly string[]).includes(name) ? selectFacet(EMPTY_FACETS, name as FacetId, value)[name as FacetId] : null;
    const good = value === "" || applied.includes(name) ? false : name === "search" ? true : name === "tag" ? lower !== "any" && (TAG_FILTERS as readonly string[]).includes(lower) : name === "kind" ? true : facet !== null;
    if (!good) ignored.push(key);
    else {
      applied.push(name);
      if (name === "search") view.text = value.slice(0, SEARCH_MAX_CHARS);
      else if (name === "tag") view.tag = lower as TagFilter;
      else if (name === "kind") view.kind = kindKey(value);
      else view.facets = { ...view.facets, [name]: facet };
    }
  }
  return { ok: applied.length > 0, view, applied: VIEW_KEYS.filter((k) => applied.includes(k)), ignored };
}
