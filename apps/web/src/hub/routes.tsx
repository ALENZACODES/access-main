import { lazy, Suspense, type ReactNode } from "react";
import { type RouteObject } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./i18n";

const HubIndex = lazy(() => import("./HubIndex").then(({ HubIndex }) => ({ default: HubIndex })));
const EmploymentPage = lazy(() => import("./EmploymentPage"));
const HousingPage = lazy(() => import("./HousingPage"));
const SafetyPage = lazy(() => import("./SafetyPage"));
const DiaryPage = lazy(() => import("./DiaryPage"));
const AuditorsPage = lazy(() => import("./AuditorsPage"));
const HandoffPage = lazy(() => import("./HandoffPage"));
const PeersPage = lazy(() => import("./PeersPage"));
const EventsPage = lazy(() => import("./EventsPage"));

function Pending({ children }: { children: ReactNode }) {
  const { t } = useTranslation("hub");
  return <Suspense fallback={<p role="status">{t("loading")}</p>}>{children}</Suspense>;
}

export const hubRoutes: RouteObject[] = [
  { index: true, element: <Pending><HubIndex /></Pending> },
  { path: "employment", element: <Pending><EmploymentPage /></Pending> },
  { path: "housing", element: <Pending><HousingPage /></Pending> },
  { path: "safety", element: <Pending><SafetyPage /></Pending> },
  { path: "diary", element: <Pending><DiaryPage /></Pending> },
  { path: "auditors", element: <Pending><AuditorsPage /></Pending> },
  { path: "handoff", element: <Pending><HandoffPage /></Pending> },
  { path: "peers", element: <Pending><PeersPage /></Pending> },
  { path: "events", element: <Pending><EventsPage /></Pending> },
];
