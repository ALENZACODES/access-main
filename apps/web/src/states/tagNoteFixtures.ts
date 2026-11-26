/** Shared builders for the tags-and-notes tests. Not used by the App. */
import { place } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";

/** Places whose tag and note give each reading a case to find and a case to leave out. */
export function tagNotePlaces(): PackPlaceRecord[] {
  return [
    place("a", { name: "Alpha Cafe", wheelchair: "yes", wheelchair_description: "Two steps at the front door" }),
    place("b", { name: "Beta Bar", wheelchair: "yes", wheelchair_description: "Step-free entrance on the side" }),
    place("c", { name: "Gamma Grill", wheelchair: "designated", wheelchair_description: "Stairs only, ramp at the back" }),
    place("d", { name: "Delta Diner", wheelchair: "no", wheelchair_description: "Elevator out of service" }),
    place("e", { name: "Epsilon Eatery", wheelchair: "no", wheelchair_description: "No ramp and no lift" }),
    place("f", { name: null, wheelchair: null, wheelchair_description: "Ramp at the side door" }),
    place("g", { name: "Zeta Zone", wheelchair: "limited", wheelchair_description: "Steps and a ramp" }),
    place("h", { name: "Eta Hall", wheelchair: "yes", wheelchair_description: "Washrooms on the second floor" }),
    place("i", { name: "Theta Tea", wheelchair: "yes" }),
    place("j", { name: "Iota Inn", wheelchair: "yes", wheelchair_description: "Entrée avec des marches" }),
    place("k", { name: "Kappa Kiosk", wheelchair: "yes", wheelchair_description: "Sans marches à l’entrée" }),
  ];
}
