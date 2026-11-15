import { useEffect, useState } from "react";
import type { UserProfile } from "@access/shared";
import { t, type Lang } from "../i18n/index.ts";
import type { CaregiverService } from "../service.ts";
import { CaregiverPanel } from "./CaregiverPanel.tsx";
import { OwnerPanel } from "./OwnerPanel.tsx";
import "./styles.css";

export interface AppProps {
  service: CaregiverService;
  profile: UserProfile;
  /** True when the profile is the invented demonstration profile. */
  demo?: boolean;
  initialLang?: Lang;
  initialView?: "owner" | "caregiver";
}

export function App({ service, profile, demo = false, initialLang = "en", initialView = "owner" }: AppProps) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [view, setView] = useState<"owner" | "caregiver">(initialView);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t(lang, "app.title");
  }, [lang]);

  return (
    <>
      <a className="skip" href="#main">{t(lang, "app.skip")}</a>
      <header>
        <h1>{t(lang, "app.title")}</h1>
        <div role="group" aria-label={t(lang, "app.language")} className="actions">
          <button type="button" lang="en" aria-pressed={lang === "en"} onClick={() => setLang("en")}>{t(lang, "app.langEn")}</button>
          <button type="button" lang="fr" aria-pressed={lang === "fr"} onClick={() => setLang("fr")}>{t(lang, "app.langFr")}</button>
        </div>
        <div role="group" aria-label={t(lang, "app.view")} className="actions">
          <button type="button" aria-pressed={view === "owner"} onClick={() => setView("owner")}>{t(lang, "app.viewOwner")}</button>
          <button type="button" aria-pressed={view === "caregiver"} onClick={() => setView("caregiver")}>{t(lang, "app.viewCaregiver")}</button>
        </div>
        <p>{t(lang, "app.storageNote")}</p>
        {demo && <p className="demo">{t(lang, "app.demoNotice")}</p>}
      </header>
      <main id="main">
        {view === "owner" ? <OwnerPanel service={service} profile={profile} lang={lang} /> : <CaregiverPanel service={service} lang={lang} />}
      </main>
    </>
  );
}
