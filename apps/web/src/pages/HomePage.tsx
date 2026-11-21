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
  const { t, i18n } = useTranslation();
  const { profile, ready } = useProfileState();
  const french = i18n.language.startsWith("fr");
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
          <li>
            <Link className="card" to="/question-packet" style={{ minHeight: 44 }}>
              <span className="card-title">{french ? "Fiche de questions sur l’accessibilité" : "Accessibility questions packet"}</span>
              <span>{french ? "Préparez des questions et suivez les réponses consignées, sans envoi automatique." : "Prepare accessibility questions and record reported answers without automatic uploads."}</span>
            </Link>
          </li>
          <li>
            <Link className="card" to="/access-rehearsal" style={{ minHeight: 44 }}>
              <span className="card-title">{french ? "Répétition d’accessibilité" : "Access rehearsal"}</span>
              <span>{french ? "Parcours au clavier et par balayage, sans transmission de données." : "Practice keyboard and switch journeys without sending data."}</span>
            </Link>
          </li>
        </ul>
      </section>
    </div>
  );
}
