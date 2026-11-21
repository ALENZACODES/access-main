/** Shared builders for the pack search tests. Not used by the App. */
import { place } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";

/** Eight places chosen so that every operator has something to find and something to leave out. */
export function searchPlaces(): PackPlaceRecord[] {
  return [
    place("a", { name: "Alpha Cafe", category: "cafe", address: "1 Main Street", wheelchair: "yes", wheelchair_description: "Ramp at the side door" }),
    place("b", { name: "Beta Bar", category: "bar", address: "2 Main Street", wheelchair: "limited" }),
    place("c", { name: "Gamma Fast Food", category: "fast_food", address: "10 Dundas Street East", wheelchair: "no", wheelchair_description: "No steps; washroom upstairs" }),
    place("d", { name: "Delta Restaurant", category: "restaurant", address: null, wheelchair: null }),
    place("e", { name: null, category: "pharmacy", address: "5 King Street", wheelchair: "designated" }),
    place("f", { name: "Café Étoile", category: "cafe", address: "7 rue Principale", wheelchair: "yes" }),
    place("g", { name: "Main Street Books", category: null, address: "3 Queen Street", wheelchair: "limited" }),
    place("h", { name: "Hotel", category: "hotel", address: "9 Bay Street", wheelchair: "yes", provenance: null, lat: null, lon: null }),
  ];
}

export const idsOf = (list: readonly { id: string }[]): string[] => list.map((p) => p.id);
