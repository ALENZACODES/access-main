import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModuleResult } from "@access/shared";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { modules } from "../modules/stubs.ts";

export function HelpPage() {
  const { t, i18n } = useTranslation();
  const { profile } = useProfileState();
  const online = useOnline();
  const [count, setCount] = useState<number | null>(null);
  useDocumentTitle(t("modules.helpTitle"));

  useEffect(() => {
    void modules.help
      .list({
        locale: i18n.language.startsWith("fr") ? "fr" : "en",
        offline: !online,
        profile,
        nowIso: new Date().toISOString(),
      })
      .then((result: ModuleResult<unknown>) => setCount(result.items.length));
  }, [i18n.language, online, profile]);

  return (
    <div className="stack">
      <h1>{t("modules.helpTitle")}</h1>
      <section className="stack" aria-labelledby="help-privacy">
        <h2 id="help-privacy">{t("help.privacyTitle")}</h2>
        <p>{t("help.privacyBody")}</p>
      </section>
      <section className="stack" aria-labelledby="help-tiers">
        <h2 id="help-tiers">{t("help.tiersTitle")}</h2>
        <p>{t("help.tiersBody")}</p>
      </section>
      <section className="stack" aria-labelledby="help-language">
        <h2 id="help-language">{t("help.languageTitle")}</h2>
        <p>{t("help.languageBody")}</p>
      </section>
      <section className="stack" aria-labelledby="help-advice">
        <h2 id="help-advice">{t("help.adviceTitle")}</h2>
        <p>{t("help.adviceBody")}</p>
      </section>
      <section className="stack" aria-labelledby="help-articles">
        <h2 id="help-articles">{t("modules.helpArticles")}</h2>
        <p role="status">{count === null ? t("home.checking") : t("modules.resultCount", { count })}</p>
      </section>
    </div>
  );
}
