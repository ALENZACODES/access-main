import { Component, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { SHELL_CONTRACT_VERSION } from "@access/shared";
import { BUILD_ID } from "../buildInfo.ts";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { UpdatePrompt } from "./UpdatePrompt.tsx";
import { useApplyPreferences } from "./useApplyPreferences.ts";
import { useOnline } from "./useOnline.ts";

const LINKS = [
  ["/", "nav.home", true],
  ["/places", "nav.places", false],
  ["/journey", "nav.journey", false],
  ["/finders", "nav.finders", false],
  ["/navigator", "nav.navigator", false],
  ["/games", "nav.games", false],
  ["/help", "nav.help", false],
  ["/profile", "nav.settings", false],
  ["/data-status", "nav.data", false],
  ["/about", "nav.about", false],
] as const;

function ShellError({ reset }: { reset: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="stack">
      <h1>{t("error.title")}</h1>
      <p>{t("error.body")}</p>
      <Link className="text-link" to="/" onClick={reset}>{t("error.home")}</Link>
    </div>
  );
}

class Boundary extends Component<{ resetKey: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey: string }) {
    if (prev.resetKey !== this.props.resetKey && this.state.failed) {
      this.setState({ failed: false });
    }
  }

  render() {
    if (this.state.failed) return <ShellError reset={() => this.setState({ failed: false })} />;
    return this.props.children;
  }
}

export function AppShell() {
  const { t, i18n } = useTranslation();
  const { profile, setLanguage } = useProfileState();
  const online = useOnline();
  const location = useLocation();
  const language = i18n.language.startsWith("fr") ? "fr" : "en";
  useApplyPreferences(profile, language);

  return (
    <>
      <a className="skip-link" href="#main">{t("skip")}</a>
      <header className="site-header">
        <div className="header-bar">
          <Link className="app-mark" to="/">{t("appName")}</Link>
          <div className="language-switch" role="group" aria-label={t("language.label")}>
            <button type="button" className="lang-button" aria-pressed={language === "en"} onClick={() => void setLanguage("en")}>
              {t("language.english")}
            </button>
            <button type="button" className="lang-button" aria-pressed={language === "fr"} onClick={() => void setLanguage("fr")}>
              {t("language.french")}
            </button>
          </div>
        </div>
        <nav aria-label={t("nav.primary")}>
          <ul className="nav-list">
            {LINKS.map(([to, key, end]) => (
              <li key={to}>
                <NavLink to={to} end={end} className="nav-link">{t(key)}</NavLink>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      {language === "fr" ? <p className="translation-note" role="note">{t("language.provisional")}</p> : null}
      <main id="main" tabIndex={-1} className="site-main">
        <p className="prototype-banner" role="note">{t("prototypeBanner")}</p>
        <UpdatePrompt />
        <Boundary resetKey={location.pathname}>
          <Outlet />
        </Boundary>
      </main>
      <footer className="site-footer">
        <p>{t("footer.prototype")}</p>
        <p>
          <span>{t("footer.build", { id: BUILD_ID })}</span>
          {" · "}
          <span>{t("footer.contract", { version: SHELL_CONTRACT_VERSION })}</span>
          {" · "}
          <span role="status">{online ? t("footer.online") : t("footer.offline")}</span>
        </p>
        <p>
          <Link className="text-link" to="/help">{t("footer.help")}</Link>
          {" · "}
          <Link className="text-link" to="/profile">{t("footer.privacy")}</Link>
        </p>
        <p>{t("noEndorsement")}</p>
      </footer>
    </>
  );
}
