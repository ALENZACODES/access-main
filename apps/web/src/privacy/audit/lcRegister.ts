// The coordinate writes that are accepted, and why. A row says what was read in the lines named. It does not say
// whether a number belongs to a place in the pack or to a point a person typed, except where the lines show it, and
// it does not say where a written number goes afterwards. Where something was not checked the reason says so.

import type { LcAcceptRow } from "./lcRules";

const R_MAP_CALL = "The place's longitude and latitude are written as an array to pan the map (a call to panMapTo) and to draw the ring around the chosen place on the map, not into text or a file. Not checked: what the map library keeps.";
const R_NEAR_FIELDS = "A point read from the address of the page is written back as the text of two fields, with every decimal it has, so the person sees what was read. Nothing here cuts it to five decimals.";
const R_NEAR_FIELDS_ROUTE = "The point of the near query is written as the text of two fields on the page, with every decimal it has. Not checked: whether those fields are exported.";
const R_GEOJSON_POINT = "pointFeature writes [lon, lat] for each point it is given: the two points typed by the person, the halfway point and each place. The numbers are written as they are, with all their decimals. The halfway point is rounded to five decimals before it gets here; the typed points are not.";
const R_OUTING = "Writes the latitude and longitude of a stop as they are, with all their decimals, in the CSV row and in the GeoJSON of the outing. The numbers come from the stops given to it. Not checked: where the stops come from in every caller.";
const R_PASTED_POINT = "A point the person pasted is written back as the text of the two near fields so they can see and change it. readPoint rounds it to five decimals first. Not checked: what the person types into the fields afterwards.";
const R_CANONICAL = "The fixed text form of a saved place holds its latitude and longitude as they are, with all their decimals. That text is only hashed for the pack fingerprint; it is not shown or saved. Not checked: every later caller of canonicalLine.";
const R_PACK_CSV = "Writes the latitude and longitude of a pack place into a CSV cell as the number is, with all its decimals. The text version of the same place is cut to four decimals.";

export const LC_ACCEPTED: readonly LcAcceptRow[] = [
  { path: "apps/web/src/map/MapPage.tsx", code: "lc-raw", count: 2, reason: R_MAP_CALL },
  { path: "apps/web/src/states/PackPlaces.tsx", code: "lc-raw", count: 2, reason: R_PASTED_POINT },
  { path: "apps/web/src/states/geo.ts", code: "lc-raw", count: 2, reason: R_NEAR_FIELDS },
  { path: "apps/web/src/states/mapRoute.ts", code: "lc-raw", count: 2, reason: R_NEAR_FIELDS_ROUTE },
  { path: "apps/web/src/states/meetUpGeo.ts", code: "lc-raw", count: 1, reason: R_GEOJSON_POINT },
  { path: "apps/web/src/states/outingExport.ts", code: "lc-raw", count: 3, reason: R_OUTING },
  { path: "apps/web/src/states/packCanonical.ts", code: "lc-raw", count: 1, reason: R_CANONICAL },
  { path: "apps/web/src/states/packExport.ts", code: "lc-raw", count: 2, reason: R_PACK_CSV },
];
