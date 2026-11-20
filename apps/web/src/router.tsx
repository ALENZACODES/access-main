import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { Section } from "./modules/Section.tsx";
import { optionalPage, optionalRoutes } from "./modules/optionalRoutes.ts";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { routePage } from "./perf/routeChunks.ts";
import { AppShell } from "./shell/AppShell.tsx";
import { lazy, Suspense } from "react";
const NarrowAuditPage = lazy(() => import("./pages/NarrowAuditPage.tsx").then((module) => ({ default: module.NarrowAuditPage })));
const AccessRehearsalPage = lazy(() => import("./input/rehearsal/AccessRehearsalPage.tsx").then((module) => ({ default: module.AccessRehearsalPage })));
const InputWorkbenchPage = lazy(() => import("./input/switch-workbench/WorkbenchPage.tsx").then((module) => ({ default: module.WorkbenchPage })));

// Every route in the integration contract is lazy, so none is on the first-install path.
// Home and onboarding stay in the entry chunk: they are the first screens. The rest
// share route chunks with the nav-link preload in perf/routeChunks.ts.
const AboutPage = routePage("/about", (module) => module.AboutPage);
const ProfilePage = routePage("/profile", (module) => module.ProfilePage);
const ModulePage = routePage("/places", (module) => module.ModulePage);
const PlaceDetailPage = routePage("/place", (module) => module.PlaceDetailPage);
const HelpPage = routePage("/help", (module) => module.HelpPage);
const DataStatusPage = routePage("/data-status", (module) => module.DataStatusPage);
const BuildCardPage = routePage("/build-card", (module) => module.BuildCardPage);
const OfflinePackPage = routePage("/offline", (module) => module.OfflinePackPage);

// Entry files owned by other lanes. A missing file renders a "being connected" page, not a build error.
const MapPage = optionalPage("map");
const ContributePage = optionalPage("contribute");
const SettingsRoutes = optionalRoutes("settings");
const MoreRoutes = optionalRoutes("more");

export const routes: RouteObject[] = [
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "about", element: <Section><AboutPage /></Section> },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "profile", element: <Section><ProfilePage /></Section> },
      { path: "data-status", element: <Section><DataStatusPage /></Section> },
      { path: "build-card", element: <Section><BuildCardPage /></Section> },
      { path: "offline", element: <Section><OfflinePackPage /></Section> },
      { path: "access-rehearsal", element: <Section><Suspense fallback={<p role="status">Loading…</p>}><AccessRehearsalPage /></Suspense></Section> },
      { path: "input-workbench", element: <Section><Suspense fallback={<p role="status">Loading…</p>}><InputWorkbenchPage /></Suspense></Section> },
      { path: "places", element: <Section><ModulePage id="places" /></Section> },
      { path: "places/:id", element: <Section><PlaceDetailPage /></Section> },
      { path: "map", element: <Section><MapPage /></Section> },
      { path: "journey", element: <Section><ModulePage id="journey" /></Section> },
      { path: "finders", element: <Section><ModulePage id="finders" /></Section> },
      { path: "navigator", element: <Section><ModulePage id="navigator" /></Section> },
      { path: "games", element: <Section><ModulePage id="games" /></Section> },
      { path: "help", element: <Section><HelpPage /></Section> },
      { path: "help/:id", element: <Section><HelpPage /></Section> },
      { path: "contribute", element: <Section><ContributePage /></Section> },
      { path: "settings/*", element: <Section><SettingsRoutes /></Section> },
      { path: "more/*", element: <Section><MoreRoutes /></Section> },
      { path: "dev/narrow", element: <Section><NarrowAuditPage /></Section> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });
