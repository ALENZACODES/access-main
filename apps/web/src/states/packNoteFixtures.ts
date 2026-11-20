/** Builders for the "notes in the pack" tests. Not used by the App. */
import type { PackPlaceRecord } from "./packPlaces";
import { place } from "./placeFixtures";

/** A pack place with a note (the pack's wheelchair description). Pass `null` for no note. */
export function noted(id: string, note: string | null, over: Record<string, unknown> = {}): PackPlaceRecord {
  return place(id, { name: `Place ${id}`, wheelchair_description: note, ...over });
}

export const LONG_NOTE = `${"Level entrance at the side door, ring the bell for staff. ".repeat(6)}Washroom on the second floor.`;

/** A small set that has every case: short, medium and long notes, a repeated note, a missing note, all tags. */
export function noteSet(): PackPlaceRecord[] {
  return [
    noted("a", "Step at the door", { name: "Alpha Cafe", wheelchair: "limited" }),
    noted("b", "Ramp at the side entrance. Ring the bell for staff to help with the door.", { name: "Beta Library", wheelchair: "yes" }),
    noted("c", LONG_NOTE, { name: "Gamma Museum", wheelchair: "yes" }),
    noted("d", null, { name: "Delta Shop", wheelchair: "no" }),
    noted("e", "step at the door", { name: "Epsilon Bar", wheelchair: "no" }),
    noted("f", "Entrée par le côté — sonnez pour la rampe", { name: "Fleur d’Été", wheelchair: "designated" }),
    noted("g", null, { name: null, wheelchair: null }),
    noted("h", "Washrooms are on the second floor of 10 Dundas Street", { name: "Hotel Hall", wheelchair: "UNKNOWN" }),
  ];
}
