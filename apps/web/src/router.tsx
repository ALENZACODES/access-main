import { lazy } from "react";
import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { Section } from "./modules/Section.tsx";
import { optionalPage, optionalRoutes } from "./modules/optionalRoutes.ts";
import { AboutPage } from "./pages/AboutPage.tsx";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { ProfilePage } from "./pages/ProfilePage.tsx";
import { AppShell } from "./shell/AppShell.tsx";

// Every route in the integration contract is lazy, so none is on the first-install path.
const ModulePage = lazy(() => import("./pages/ModulePage.tsx").then((module) => ({ default: module.ModulePage })));
const PlaceDetailPage = lazy(() => import("./pages/PlaceDetailPage.tsx").then((module) => ({ default: module.PlaceDetailPage })));
const HelpPage = lazy(() => import("./pages/HelpPage.tsx").then((module) => ({ default: module.HelpPage })));
const DataStatusPage = lazy(() => import("./pages/DataStatusPage.tsx").then((module) => ({ default: module.DataStatusPage })));
const BuildCardPage = lazy(() => import("./pages/BuildCardPage.tsx").then((module) => ({ default: module.BuildCardPage })));
const OfflinePackPage = lazy(() => import("./pages/OfflinePackPage.tsx").then((module) => ({ default: module.OfflinePackPage })));

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
      { path: "about", element: <AboutPage /> },
      { path: "onboarding", element: <OnboardingPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "data-status", element: <Section><DataStatusPage /></Section> },
      { path: "build-card", element: <Section><BuildCardPage /></Section> },
      { path: "offline", element: <Section><OfflinePackPage /></Section> },
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
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });
