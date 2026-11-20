/** Shared builders for the "Words in the notes" tests. Not used by the App. */
import { place } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";

/** A pack place with a note. `null` gives a place with no note. */
export const withNote = (id: string, note: string | null, over: Record<string, unknown> = {}): PackPlaceRecord => place(id, { wheelchair_description: note, ...over });

/** Nine places that between them cover every kind of case the reader has to handle. */
export function topicSet(): PackPlaceRecord[] {
  return [
    withNote("a", "Ramp at the side entrance. Ring the bell for staff to help.", { name: "Alpha Cafe", wheelchair: "yes" }),
    withNote("b", "Two steps at the front door; no ramp.", { name: "Beta Library", wheelchair: "limited" }),
    withNote("c", "No elevator. Stairs only to the second floor.", { name: "Gamma Museum", wheelchair: "no" }),
    withNote("d", null, { name: "Delta Bar", wheelchair: "yes" }),
    withNote("e", "Open daily until late", { name: "Epsilon Shop", wheelchair: null }),
    withNote("f", "Entrée par le côté, sonnez la sonnette. Pas d’escalier.", { name: "Fleur d’Été", wheelchair: "designated" }),
    withNote("g", "Washrooms are on the second floor of 10 Dundas Street", { name: null, wheelchair: "UNKNOWN" }),
    withNote("h", "Parking at the rear. Gravel path, narrow gate.", { name: "Hotel Hall", wheelchair: "yes" }),
    withNote("i", "Salle de bain au sous-sol, ascenseur disponible", { name: "Iota Grill", wheelchair: "yes" }),
  ];
}
