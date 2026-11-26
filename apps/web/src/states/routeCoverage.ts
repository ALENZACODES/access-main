/**
 * Which mechanism gives each live route its error and empty states.
 *
 * `routeCoverage.test.ts` reads `router.tsx` and fails when a route is missing
 * from this table, when a "states" route points at a state set that does not
 * exist, or when the page file does not use the shared components. A new route
 * therefore cannot ship without saying how its failures are shown.
 */
import type { RouteId } from "./routeStates";

export type Mechanism =
  /** Shared state components: stateCopy + routeStates + StateNotice. */
  | "states"
  /** The shell's own error states (shell/errorStates.ts), each with next actions. */
  | "shell"
  /** Nothing to load or fail: static copy. */
  | "static"
  /** A form that reports its own field errors. */
  | "form"
  /** Owned by another lane: a pending section until its entry file exists. */
  | "other-lane";

export interface RouteCoverage {
  /** The page component's file, relative to apps/web/src. */
  readonly file: string | null;
  readonly mechanism: Mechanism;
  /** For "states": the state set in routeStates.ts. */
  readonly stateRoute?: RouteId;
  /** For "shell": ids from shell/errorStates.ts. */
  readonly shellStates?: readonly string[];
  readonly why: string;
}

/** Keyed by the `path` in router.tsx ("" is the index route). */
export const ROUTE_COVERAGE: Readonly<Record<string, RouteCoverage>> = {
  "": { file: "pages/HomePage.tsx", mechanism: "static", why: "Shows a checking status, then static links." },
  about: { file: "pages/AboutPage.tsx", mechanism: "static", why: "Static copy." },
  onboarding: { file: "pages/OnboardingPage.tsx", mechanism: "form", why: "Field errors with an error summary." },
  profile: { file: "pages/ProfilePage.tsx", mechanism: "shell", shellStates: ["profileSaveFailed", "storageUnavailable"], why: "Save failure uses the shell state with a link." },
  "data-status": { file: "pages/DataStatusPage.tsx", mechanism: "shell", shellStates: ["storageUnavailable"], why: "Storage failure uses the shell state with retry." },
  "build-card": { file: "pages/BuildCardPage.tsx", mechanism: "static", why: "Reads build information compiled into the app." },
  offline: { file: "offline/RegionPackPage.tsx", mechanism: "states", stateRoute: "offline", why: "Pack list failure and an empty list." },
  "access-rehearsal": { file: "input/rehearsal/AccessRehearsalPage.tsx", mechanism: "form", why: "Device-local step editor reports missing bilingual fields next to the editable inputs and provides retry by editing and saving." },
  "input-workbench": { file: "input/switch-workbench/WorkbenchPage.tsx", mechanism: "form", why: "Bilingual control form shows local field validation and allows correction before saving." },
  "question-packet": { file: "question-packet/QuestionPacketPage.tsx", mechanism: "form", why: "Device-local question form uses a shared StateNotice with correction guidance and a help link for invalid fields." },
  places: { file: "pages/ModulePage.tsx", mechanism: "states", stateRoute: "search", why: "Search, offline and load failures." },
  "places/:id": { file: "pages/PlaceDetailPage.tsx", mechanism: "states", stateRoute: "place", why: "Not found and load failures." },
  map: { file: "map/MapPage.tsx", mechanism: "states", stateRoute: "map", why: "Empty view and load failures." },
  journey: { file: "pages/ModulePage.tsx", mechanism: "states", stateRoute: "journey", why: "No route and load failures." },
  finders: { file: "pages/ModulePage.tsx", mechanism: "states", stateRoute: "finders", why: "No results and load failures." },
  navigator: { file: "pages/ModulePage.tsx", mechanism: "states", stateRoute: "navigator", why: "Empty list and load failures." },
  games: { file: "pages/ModulePage.tsx", mechanism: "states", stateRoute: "games", why: "Empty list and game load failures." },
  help: { file: "pages/HelpPage.tsx", mechanism: "states", stateRoute: "help", why: "No matching articles and load failures." },
  "help/:id": { file: "pages/HelpPage.tsx", mechanism: "states", stateRoute: "help", why: "Same page as help." },
  contribute: { file: null, mechanism: "other-lane", why: "Entry file is owned by another lane." },
  "/contribute/event": { file: "contribute/MappingDayPage.tsx", mechanism: "form", why: "Local draft review reports storage and export failures and lets the contributor retry." },
  "settings/*": { file: null, mechanism: "other-lane", why: "Route table is owned by another lane." },
  "more/*": { file: null, mechanism: "other-lane", why: "Route table is owned by another lane." },
  "dev/narrow": { file: null, mechanism: "other-lane", why: "Audit page owned by the narrow-route lane." },
  "*": { file: "pages/NotFoundPage.tsx", mechanism: "shell", shellStates: ["notFound"], why: "Unknown address, with links home and to help." },
};

/**
 * Files that still render a bare `role="alert"` paragraph. Each needs a reason that
 * names the next action the person has. A file not listed here may not add one
 * (see the test), and a file listed here must still contain one.
 */
export const BARE_ALERT_ALLOWLIST: Readonly<Record<string, string>> = {
  "pages/OnboardingPage.tsx": "Form error summary; each field error is next to the field.",
  "input/rehearsal/AccessRehearsalPage.tsx": "Missing bilingual step fields show an alert beside the editable inputs; the person can correct the fields and choose Save step again.",
  "pages/OfflinePackPage.tsx": "Legacy page, not routed; the routed page is offline/RegionPackPage.tsx.",
  "pages/ProfilePage.tsx": "Save failure; the shell state's link to data status sits beside it.",
  "offline/RegionPackPage.tsx": "Download result text names its cause; the region card keeps Download, Resume and Delete.",
  "recovery/RecoveryNotice.tsx": "The notice itself lists Try again and Dismiss.",
  "recovery/CorruptPackNotice.tsx": "The notice itself lists Download again and Dismiss.",
  "map/MapPage.tsx": "Map library notice; the list beside the map still works.",
  "hub/PackageView.tsx": "Other lane: tool boundary fallback.",
  "hub/SafetyPage.tsx": "Other lane: tool boundary fallback.",
  "hub/ReportsPage.tsx": "Other lane: report page message.",
  "hub/RouteReportsPage.tsx": "Other lane: report page message.",
  "hub/WavPage.tsx": "Other lane: file check message.",
  "recovery/RecoveryQueuePanel.tsx": "Other lane: input error beside its field.",
  "recovery/RecoveryCaseJournal.tsx": "Other lane: a blocked comparison message beside the comparison.",
  "recovery/RecoveryTaskBoard.tsx": "Other lane: a merge conflict message beside the merge preview.",
  "features/featureScreens.tsx": "Other lane: settings screens.",
};
