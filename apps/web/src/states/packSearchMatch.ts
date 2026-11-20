/** Whether a pack place passes a parsed search. Pure: it reads the place and changes nothing. */
import { normalizeText } from "./filters";
import type { PackPlaceRecord } from "./packPlaces";
import type { ParsedSearch, SearchTerm } from "./packSearchParse";

/** The text the plain words are looked for in: name, address and kind, as the list has always done. */
function anyText(p: PackPlaceRecord): string {
  return normalizeText([p.name, p.address, p.category].filter(Boolean).join(" "));
}

function fieldText(p: PackPlaceRecord, field: "name" | "address" | "kind" | "note"): string {
  switch (field) {
    case "name":
      return normalizeText(p.name ?? "");
    case "address":
      return normalizeText(p.address ?? "");
    case "kind":
      // "fast_food" is read as "fast food", and the typed value is too.
      return normalizeText((p.category ?? "").replace(/_/g, " "));
    case "note":
      return normalizeText(p.note ?? "");
  }
}

function hasDetail(p: PackPlaceRecord, key: "note" | "address" | "name" | "kind" | "tag" | "source" | "location"): boolean {
  switch (key) {
    case "note":
      return p.note !== null;
    case "address":
      return p.address !== null;
    case "name":
      return p.name !== null;
    case "kind":
      return p.category !== null;
    case "tag":
      return p.tag !== "unknown";
    case "source":
      return p.provenance !== null;
    case "location":
      return p.location !== null;
  }
}

export function matchSearchTerm(p: PackPlaceRecord, term: SearchTerm): boolean {
  let hit: boolean;
  if (term.type === "tag") hit = p.tag === term.value;
  else if (term.type === "has") hit = hasDetail(p, term.key);
  else hit = (term.field === "any" ? anyText(p) : fieldText(p, term.field)).includes(term.field === "kind" ? term.value.replace(/_/g, " ") : term.value);
  return term.negated ? !hit : hit;
}

export function matchPackSearch(p: PackPlaceRecord, parsed: ParsedSearch): boolean {
  return parsed.clauses.every((c) => c.alternatives.some((t) => matchSearchTerm(p, t)));
}

export function filterBySearch(places: readonly PackPlaceRecord[], parsed: ParsedSearch): PackPlaceRecord[] {
  return parsed.clauses.length === 0 ? [...places] : places.filter((p) => matchPackSearch(p, parsed));
}
