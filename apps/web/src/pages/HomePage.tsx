import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";

/** Simple line icons, drawn here so no image or icon font is loaded. Decorative only. */
function Icon({ children }: { children: ReactNode }) {
  return (
    <span className="tile-icon" aria-hidden="true">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" focusable="false">
        {children}
      </svg>
    </span>
  );
}

const ICONS: Record<string, ReactNode> = {
  places: <><circle cx="11" cy="11" r="7" /><path d="m20 20-4-4" /></>,
  map: <><path d="M9 4 3 6v14l6-2 6 2 6-2V4l-6 2-6-2Z" /><path d="M9 4v14M15 6v14" /></>,
  journey: <><circle cx="6" cy="18" r="2.5" /><circle cx="18" cy="6" r="2.5" /><path d="M8.5 18H15a3 3 0 0 0 0-6H9a3 3 0 0 1 0-6h6.5" /></>,
  finders: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  navigator: <><path d="M4 5h16M4 12h16M4 19h10" /></>,
  games: <><rect x="3" y="7" width="18" height="11" rx="4" /><path d="M8 11v3M6.5 12.5h3" /><circle cx="15.5" cy="12" r="0.8" /><circle cx="17.5" cy="14" r="0.8" /></>,
  help: <><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6" /><circle cx="12" cy="17" r="0.6" /></>,
  data: <><ellipse cx="12" cy="6" rx="7" ry="3" /><path d="M5 6v6c0 1.7 3.1 3 7 3s7-1.3 7-3V6M5 12v6c0 1.7 3.1 3 7 3s7-1.3 7-3v-6" /></>,
  keyboard: <><rect x="2.5" y="6" width="19" height="12" rx="2.5" /><path d="M6 10h.01M9.5 10h.01M13 10h.01M16.5 10h.01M7 14h10" /></>,
  questions: <><path d="M5 4h11l3 3v13H5Z" /><path d="M9 10h6M9 14h6M9 18h3" /></>,
  rehearsal: <><path d="M5 12a7 7 0 1 0 2-5" /><path d="M5 3v4h4" /><path d="M12 8v4l3 2" /></>,
};

const AREAS = [
  ["/places", "nav.places", "areas.places", "places"],
  ["/map", "nav.map", "areas.map", "map"],
  ["/journey", "nav.journey", "areas.journey", "journey"],
  ["/finders", "nav.finders", "areas.finders", "finders"],
  ["/navigator", "nav.navigator", "areas.navigator", "navigator"],
  ["/help", "nav.help", "areas.help", "help"],
  ["/games", "nav.games", "areas.games", "games"],
  ["/data-status", "nav.data", "areas.data", "data"],
] as const;

export function HomePage() {
  const { t, i18n } = useTranslation();
  const { profile, ready } = useProfileState();
  const french = i18n.language.startsWith("fr");
  useDocumentTitle(t("appName"));

  const tools = [
    ["/input-workbench", "keyboard",
      french ? "Atelier clavier et contacteur" : "Keyboard and switch workbench",
      french ? "Examiner les commandes et les annonces dans une séance locale." : "Review controls and announcements in a local session."],
    ["/question-packet", "questions",
      french ? "Fiche de questions sur l’accessibilité" : "Accessibility questions packet",
      french ? "Préparez des questions et suivez les réponses consignées, sans envoi automatique." : "Prepare accessibility questions and record reported answers without automatic uploads."],
    ["/access-rehearsal", "rehearsal",
      french ? "Répétition d’accessibilité" : "Access rehearsal",
      french ? "Parcours au clavier et par balayage, sans transmission de données." : "Practice keyboard and switch journeys without sending data."],
  ] as const;

  return (
    <div className="stack">
      <section className="home-hero" aria-labelledby="home-title">
        <h1 id="home-title">{t("appName")}</h1>
        <p className="lead">{t("home.lead")}</p>
        <p className="hero-notes">{t("noEndorsement")} {t("noMedical")}</p>
      </section>
      <section className="stack" aria-labelledby="areas-title">
        <h2 id="areas-title">{t("home.areasTitle")}</h2>
        <ul className="card-list tile-grid">
          {AREAS.map(([to, title, body, icon]) => (
            <li key={to}>
              <Link className="card" to={to}>
                <Icon>{ICONS[icon]}</Icon>
                <span className="card-title">{t(title)}</span>
                <span>{t(body)}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
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
      <section className="stack" aria-labelledby="tools-title">
        <h2 id="tools-title">{french ? "Outils de préparation" : "Practice and preparation tools"}</h2>
        <ul className="card-list tile-grid">
          {tools.map(([to, icon, title, body]) => (
            <li key={to}>
              <Link className="card" to={to}>
                <Icon>{ICONS[icon]}</Icon>
                <span className="card-title">{title}</span>
                <span>{body}</span>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
