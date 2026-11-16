import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams } from "react-router-dom";
import type { ModuleResult } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { TextInput } from "../design/fields.tsx";
import { ResultItems, statusKey } from "../modules/ResultItems.tsx";
import { StubNote } from "../modules/StubNote.tsx";
import { modules } from "../modules/stubs.ts";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { bundledHelp } from "../packs/bundledToronto.ts";

export function HelpPage() {
  const { t, i18n } = useTranslation();
  const { id = "" } = useParams();
  const { profile } = useProfileState();
  const online = useOnline();
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ModuleResult<unknown> | null>(null);
  const [packTitle, setPackTitle] = useState<string | null>(null);
  const heading = packTitle ?? t("modules.helpTitle");
  useDocumentTitle(heading);

  useEffect(() => {
    let current = true;
    if (!id) {
      setPackTitle(null);
    } else {
      void bundledHelp(id).then((row) => {
        if (current) setPackTitle(row ? row.name[locale] : null);
      });
    }
    void modules.help
      .list({
        locale: i18n.language.startsWith("fr") ? "fr" : "en",
        offline: !online,
        profile,
        nowIso: new Date().toISOString(),
        query,
      })
      .then((value: ModuleResult<unknown>) => setResult(value));
    return () => {
      current = false;
    };
  }, [id, locale, i18n.language, online, profile, query]);

  return (
    <div className="stack">
      <h1>{heading}</h1>
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
        {result?.availability === "stub" ? <StubNote id="help" search /> : null}
        <form
          className="stack"
          aria-describedby={result?.availability === "stub" ? "help-search-unavailable" : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            if (result?.availability !== "ready") return;
            setQuery(text);
          }}
        >
          <TextInput label={t("modules.searchLabel")} value={text} onChange={setText} isDisabled={result?.availability !== "ready"} />
          <div className="button-row">
            <Button type="submit" isDisabled={result?.availability !== "ready"}>{t("modules.searchAction")}</Button>
          </div>
        </form>
        {result && result.availability !== "stub" ? (
          <p>{t(statusKey(result))}</p>
        ) : null}
        <p role="status">{result ? t("modules.resultCount", { count: result.items.length }) : t("home.checking")}</p>
        {result ? <ResultItems id="help" items={result.items} /> : null}
      </section>
    </div>
  );
}
