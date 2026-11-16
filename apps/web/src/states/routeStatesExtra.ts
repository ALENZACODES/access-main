/** State wiring for the routes added after the first four (see routeStates.ts). */
import { createRouteStates } from "./routeStates";

export type ExtraRouteId = "compare" | "sources" | "settings" | "report";

export const EXTRA_ROUTES = createRouteStates<ExtraRouteId>({
  compare: { label: { en: "Compare", fr: "Comparer" }, empty: null, errors: ["offline", "data-load-failed"] },
  sources: { label: { en: "Sources", fr: "Sources" }, empty: null, errors: ["offline", "data-load-failed"] },
  settings: { label: { en: "Settings", fr: "Paramètres" }, empty: null, errors: ["data-load-failed"] },
  report: { label: { en: "Suggest a correction", fr: "Proposer une correction" }, empty: null, errors: ["offline", "data-load-failed"] },
});
