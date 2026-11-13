import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { laneBinding, type ModuleResult } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { TextInput } from "../design/fields.tsx";
import { modules } from "../modules/stubs.ts";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";

export function HelpPage() {
  const { t, i18n } = useTranslation();
  const { profile } = useProfileState();
  const online = useOnline();
  const binding = laneBinding("help");
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ModuleResult<unknown> | null>(null);
  useDocumentTitle(t("modules.helpTitle"));

  useEffect(() => {
    void modules.help
      .list({
        locale: i18n.language.startsWith("fr") ? "fr" : "en",
        offline: !online,
        profile,
        nowIso: new Date().toISOString(),
        query,
      })
      .then((value: ModuleResult<unknown>) => setResult(value));
  }, [i18n.language, online, profile, query]);

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
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            setQuery(text);
          }}
        >
          <TextInput label={t("modules.searchLabel")} value={text} onChange={setText} />
          <div className="button-row">
            <Button type="submit">{t("modules.searchAction")}</Button>
          </div>
        </form>
        {result?.availability === "stub" ? (
          <p>{t("modules.assigned", { packageName: binding.packageName, repository: binding.repository })}</p>
        ) : null}
        <p role="status">{result ? t("modules.resultCount", { count: result.items.length }) : t("home.checking")}</p>
      </section>
    </div>
  );
}
