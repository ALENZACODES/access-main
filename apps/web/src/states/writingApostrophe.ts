/**
 * The apostrophe in names written two ways across one list: the typed straight mark in some names and the curly
 * mark in others ("Joe's" and "Joe’s"). The two look alike but a search for one does not find the other. Only
 * names that use one kind count; a name with both kinds is left out. Neither form is wrong; when both are in
 * use, the names with the less common one are pointed out.
 */
import type { PackPlaceRecord } from "./packPlaces";
import { MIN_STYLE_SAMPLE } from "./writingStyle";

const STRAIGHT = "'";
const CURLY = "’";

export type ApostropheForm = "straight" | "curly";

/** Which kind of apostrophe a name uses, or null when it has none or both. */
export function apostropheForm(name: string | null): ApostropheForm | null {
  if (name === null) return null;
  const s = name.includes(STRAIGHT);
  const c = name.includes(CURLY);
  if (s === c) return null;
  return s ? "straight" : "curly";
}

export interface ApostropheMix {
  readonly straightCount: number;
  readonly curlyCount: number;
  /** The kind fewer names use. A tie reads the straight kind as the minority. */
  readonly minority: ApostropheForm;
  /** Ids of the places whose name uses the minority kind, in pack order. */
  readonly ids: readonly string[];
}

/** Null when only one kind is used, or when fewer than four names use an apostrophe at all. */
export function findApostropheMix(places: readonly PackPlaceRecord[]): ApostropheMix | null {
  const straight: string[] = [];
  const curly: string[] = [];
  for (const p of places) {
    const f = apostropheForm(p.name);
    if (f === "straight") straight.push(p.id);
    else if (f === "curly") curly.push(p.id);
  }
  if (straight.length === 0 || curly.length === 0 || straight.length + curly.length < MIN_STYLE_SAMPLE) return null;
  const minority: ApostropheForm = straight.length <= curly.length ? "straight" : "curly";
  return { straightCount: straight.length, curlyCount: curly.length, minority, ids: minority === "straight" ? straight : curly };
}

/** Id to true for each place pointed out. */
export const apostropheIds = (mix: ApostropheMix | null): Set<string> => new Set(mix?.ids ?? []);
