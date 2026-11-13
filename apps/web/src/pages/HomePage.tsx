import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";

const AREAS = [
  ["/places", "nav.places", "areas.places"],
  ["/journey", "nav.journey", "areas.journey"],
  ["/finders", "nav.finders", "areas.finders"],
  ["/navigator", "nav.navigator", "areas.navigator"],
  ["/games", "nav.games", "areas.games"],
  ["/help", "nav.help", "areas.help"],
  ["/data-status", "nav.data", "areas.data"],
] as const;

export function HomePage() {
  const { t } = useTranslation();
  const { profile, ready } = useProfileState();
  useDocumentTitle(t("appName"));

  return (
    <div className="stack">
      <h1>{t("appName")}</h1>
      <p className="lead">{t("home.lead")}</p>
      <p>{t("noEndorsement")}</p>
      <p>{t("noMedical")}</p>
      <section className="panel" aria-labelledby="setup-title">
        <h2 id="setup-title">{t("home.setupTitle")}</h2>
        {!ready ? <p role="status">{t("home.checking")}</p> : null}
        {ready && !profile ? (
          <>
            <p>{t("home.setupBody")}</p>
            <p className="button-row">
              <Link className="btn btn-primary" to="/onboarding">{t("home.setupLink")}</Link>
              <Link className="btn btn-secondary" to="/places">{t("home.skipSetup")}</Link>
            </p>
          </>
        ) : null}
        {ready && profile ? (
          <>
            <p>{t("home.hasProfile")}</p>
            <Link className="text-link" to="/profile">{t("home.editProfile")}</Link>
          </>
        ) : null}
      </section>
      <section className="stack" aria-labelledby="areas-title">
        <h2 id="areas-title">{t("home.areasTitle")}</h2>
        <ul className="card-list">
          {AREAS.map(([to, title, body]) => (
            <li key={to}>
              <Link className="card" to={to}>
                <span className="card-title">{t(title)}</span>
                <span>{t(body)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
