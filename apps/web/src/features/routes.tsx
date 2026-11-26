import { Suspense, type ReactNode } from "react";
import { Link, type RouteObject } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { registerFeatureTranslations } from "./i18n.ts";
import { Message } from "./Message.tsx";
import { routePage } from "../perf/routeChunks.ts";

registerFeatureTranslations();

const entries = ["controls", "consent", "caregiver", "sync", "advocacy", "sources"] as const;
export type Entry = (typeof entries)[number];

function SettingsIndex(): ReactNode {
  const { t } = useTranslation();
  return <><h1>{t("features.title")}</h1><p>{t("features.description")}</p>
    <nav aria-label={t("features.title")}><ul className="card-list tile-grid hub-grid">
      <li className="card link-card">
        <Link className="card-title" to="/profile">{t("features.profile")}</Link>
        <p>{t("features.profileDesc")}</p>
      </li>
      {entries.map((entry) => <li key={entry} className="card link-card">
        <Link className="card-title" to={`/settings/${entry}`}>{t(`features.${entry}`)}</Link>
        <p>{t(`features.${entry}Desc`)}</p>
      </li>)}</ul></nav>
  </>;
}


// One shared chunk (features/featureScreens.tsx) for all settings feature pages.
const pages = {
  controls: routePage("/settings", (module) => module.ControlsPage),
  consent: routePage("/settings", (module) => module.ConsentPage),
  caregiver: routePage("/settings", (module) => module.CaregiverPage),
  sync: routePage("/settings", (module) => module.SyncPage),
  advocacy: routePage("/settings", (module) => module.AdvocacyPage),
  sources: routePage("/settings", (module) => module.SourcesPage),
};

export const featureRoutes: RouteObject[] = [
  { index: true, element: <SettingsIndex /> },
  ...entries.map((entry) => {
    const Page = pages[entry];
    return { path: entry, element: <Suspense fallback={<Message name="pending" />}><Page /></Suspense> };
  }),
];
