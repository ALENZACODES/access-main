import { createBrowserRouter, useOutlet, type RouteObject } from "react-router-dom";
import { Section } from "./modules/Section.tsx";
import { optionalPage, optionalRoutes } from "./modules/optionalRoutes.ts";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { routePage } from "./perf/routeChunks.ts";
import { AppShell } from "./shell/AppShell.tsx";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
const NarrowAuditPage = lazy(() => import("./pages/NarrowAuditPage.tsx").then((module) => ({ default: module.NarrowAuditPage })));
const AccessRehearsalPage = lazy(() => import("./input/rehearsal/AccessRehearsalPage.tsx").then((module) => ({ default: module.AccessRehearsalPage })));
const InputWorkbenchPage = lazy(() => import("./input/switch-workbench/WorkbenchPage.tsx").then((module) => ({ default: module.WorkbenchPage })));
const QuestionPacketPage = lazy(() => import("./question-packet/QuestionPacketPage.tsx").then((module) => ({ default: module.QuestionPacketPage })));
// The local evidence workbench is not requested until the user opens it.
const EvidenceWorkbench = lazy(() => import("./offline/evidence-workbench/EvidenceWorkbench.tsx").then((module) => ({ default: module.EvidenceWorkbench })));

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

function OfflineWithEvidenceWorkbench() {
  const { i18n } = useTranslation();
  const fr = i18n.language.startsWith("fr");
  const [open, setOpen] = useState(false);
  return <>
    <OfflinePackPage />
    <section className="panel stack" aria-labelledby="offline-workbench-entry">
      <h2 id="offline-workbench-entry">{fr ? "Mes notes de preuves hors ligne" : "My offline evidence notes"}</h2>
      <p>{fr ? "Examinez vos notes dans cet atelier. Les observations manquantes restent UNKNOWN. L’exportation est facultative." : "Review notes in this workbench. Missing observations stay UNKNOWN. Export is optional."}</p>
      <button type="button" style={{ minWidth: 44, minHeight: 44 }} aria-expanded={open} aria-controls="offline-evidence-workbench-host" onClick={() => setOpen(value => !value)}>
        {open ? (fr ? "Fermer l’atelier" : "Close workbench") : (fr ? "Ouvrir l’atelier" : "Open workbench")}
      </button>
      <div id="offline-evidence-workbench-host">
        {open ? <Suspense fallback={<p role="status">{fr ? "Chargement…" : "Loading…"}</p>}><EvidenceWorkbench /></Suspense> : null}
      </div>
    </section>
  </>;
}

// Entry files owned by other lanes. A missing file renders a "being connected" page, not a build error.
const MapPage = optionalPage("map");
const ContributePage = optionalPage("contribute");
const MappingDayPage = lazy(() => import("./contribute/MappingDayPage.tsx").then(module => ({ default: module.MappingDayPage })));

function ContributionSection() {
  const eventPage = useOutlet();
  return eventPage ?? <ContributePage />;
}

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
      { path: "offline", element: <Section><OfflineWithEvidenceWorkbench /></Section> },
      { path: "input-workbench", element: <Section><InputWorkbenchPage /></Section> },
      { path: "access-rehearsal", element: <Section><Suspense fallback={<p role="status">Loading…</p>}><AccessRehearsalPage /></Suspense></Section> },
      { path: "question-packet", element: <Section><Suspense fallback={<p role="status">Loading…</p>}><QuestionPacketPage /></Suspense></Section> },
      { path: "places", element: <Section><ModulePage id="places" /></Section> },
      { path: "places/:id", element: <Section><PlaceDetailPage /></Section> },
      { path: "map", element: <Section><MapPage /></Section> },
      { path: "journey", element: <Section><ModulePage id="journey" /></Section> },
      { path: "finders", element: <Section><ModulePage id="finders" /></Section> },
      { path: "navigator", element: <Section><ModulePage id="navigator" /></Section> },
      { path: "games", element: <Section><ModulePage id="games" /></Section> },
      { path: "help", element: <Section><HelpPage /></Section> },
      { path: "help/:id", element: <Section><HelpPage /></Section> },
      { path: "contribute", element: <Section><ContributionSection /></Section>, children: [
        { path: "/contribute/event", element: <Section><MappingDayPage /></Section> },
      ] },
      { path: "settings/*", element: <Section><SettingsRoutes /></Section> },
      { path: "more/*", element: <Section><MoreRoutes /></Section> },
      { path: "dev/narrow", element: <Section><NarrowAuditPage /></Section> },
      { path: "*", element: <NotFoundPage /> },
    ],
  },
];

export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });
