import { createBrowserRouter, type RouteObject } from "react-router-dom";
import { lazy, Suspense, useState } from "react";
import { useTranslation } from "react-i18next";
import { Section } from "./modules/Section.tsx";
import { optionalPage, optionalRoutes } from "./modules/optionalRoutes.ts";
import { HomePage } from "./pages/HomePage.tsx";
import { NotFoundPage } from "./pages/NotFoundPage.tsx";
import { OnboardingPage } from "./pages/OnboardingPage.tsx";
import { routePage } from "./perf/routeChunks.ts";
import { AppShell } from "./shell/AppShell.tsx";
const NarrowAuditPage = lazy(() => import("./pages/NarrowAuditPage.tsx").then(m => ({ default: m.NarrowAuditPage })));
const AccessRehearsalPage = lazy(() => import("./input/rehearsal/AccessRehearsalPage.tsx").then(m => ({ default: m.AccessRehearsalPage })));
const EvidenceWorkbench = lazy(() => import("./offline/evidence-workbench/EvidenceWorkbench.tsx").then(m => ({ default: m.EvidenceWorkbench })));
// This binding was missing on PR #236 while its route referenced InputWorkbenchPage.
const InputWorkbenchPage = lazy(() => import("./input/switch-workbench/WorkbenchPage.tsx").then(m => ({ default: m.WorkbenchPage })));
const AboutPage = routePage("/about", m => m.AboutPage);
const ProfilePage = routePage("/profile", m => m.ProfilePage);
const ModulePage = routePage("/places", m => m.ModulePage);
const PlaceDetailPage = routePage("/place", m => m.PlaceDetailPage);
const HelpPage = routePage("/help", m => m.HelpPage);
const DataStatusPage = routePage("/data-status", m => m.DataStatusPage);
const BuildCardPage = routePage("/build-card", m => m.BuildCardPage);
const OfflinePackPage = routePage("/offline", m => m.OfflinePackPage);
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
      <div id="offline-evidence-workbench-host">{open ? <Suspense fallback={<p role="status">{fr ? "Chargement…" : "Loading…"}</p>}><EvidenceWorkbench /></Suspense> : null}</div>
    </section>
  </>;
}
const MapPage = optionalPage("map");
const ContributePage = optionalPage("contribute");
const SettingsRoutes = optionalRoutes("settings");
const MoreRoutes = optionalRoutes("more");
export const routes: RouteObject[] = [{
  path: "/", element: <AppShell />, children: [
    { index: true, element: <HomePage /> },
    { path: "about", element: <Section><AboutPage /></Section> },
    { path: "onboarding", element: <OnboardingPage /> },
    { path: "profile", element: <Section><ProfilePage /></Section> },
    { path: "data-status", element: <Section><DataStatusPage /></Section> },
    { path: "build-card", element: <Section><BuildCardPage /></Section> },
    { path: "offline", element: <Section><OfflineWithEvidenceWorkbench /></Section> },
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
}];
export const router = createBrowserRouter(routes, { basename: import.meta.env.BASE_URL });
