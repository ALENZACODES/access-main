import type { PlacesModule } from "@access/shared";

/**
 * The place page types, taken from the contract on PlacesModule.get so they stay
 * in step with packages/shared without a second copy.
 */
export type PlaceDetail = Awaited<ReturnType<PlacesModule["get"]>>["items"][number];
export type PackRecord = PlaceDetail["record"];
export type PackSourceEntry = PlaceDetail["sources"][number];
