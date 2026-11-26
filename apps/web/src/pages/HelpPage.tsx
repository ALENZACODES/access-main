import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { torontoContent } from "../packs/bundledToronto.ts";
import { tierMessageKey, type PackHelpNumber, type ModuleResult } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { TextInput } from "../design/fields.tsx";
import { ResultItems, statusKey } from "../modules/ResultItems.tsx";
import { StubNote } from "../modules/StubNote.tsx";
import { modules } from "../modules/stubs.ts";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { getPack } from "../storage/repository.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { StateNotice } from "../states/StateNotice.tsx";
import { SuggestionList } from "../states/SuggestionList.tsx";
import { escalateView } from "../states/retryPolicy.ts";
import { helpTitleHints, titledItems } from "../states/hints.ts";
import { moduleStateFor, moduleStateView, type ModuleAvailability } from "../states/moduleStates.ts";
import { useFailureStreak } from "../states/useFailureStreak.ts";
import { HelpNumbers } from "../states/HelpNumbers.tsx";

export function HelpPage() {
  const { t, i18n } = useTranslation();
  const { profile } = useProfileState();
  const online = useOnline();
  const [text, setText] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<ModuleResult<unknown> | null>(null);
  const [attempt, setAttempt] = useState(0);
  const locale = i18n.language.startsWith("fr") ? ("fr" as const) : ("en" as const);
  const { id } = useParams();
  const [contact, setContact] = useState<PackHelpNumber | null>(null);
  // Every help contact the App ships with, each linking to its own page.
  const [contacts, setContacts] = useState<PackHelpNumber[]>([]);
  useEffect(() => {
    let active = true;
    void torontoContent().then(
      (content) => { if (active) setContacts(content?.help_numbers ?? []); },
      () => { if (active) setContacts([]); },
    );
    return () => { active = false; };
  }, []);
  const selected = contact?.id === id ? contact : null;
  const heading = selected?.name[locale] ?? t("modules.helpTitle");
  useDocumentTitle(heading);

  useEffect(() => {
    if (!id) return;
    let active = true;
    void torontoContent().then((content) => {
      if (active) setContact(content?.help_numbers.find((row) => row.id === id) ?? null);
    }, () => { if (active) setContact(null); });
    return () => { active = false; };
  }, [id]);

  useEffect(() => {
    let active = true;
    void modules.help
      .list({
        locale,
        offline: !online,
        profile,
        nowIso: new Date().toISOString(),
        query,
      })
      .then(
        (value: ModuleResult<unknown>) => { if (active) setResult(value); },
        // A help list that fails to load is an error state with a retry, not a blank.
        () => { if (active) setResult({ moduleId: "help", availability: "error", items: [], messageKey: "modules.error", asOf: null, liveStatus: "unavailable" }); },
      );
    return () => { active = false; };
  }, [locale, online, profile, query, attempt]);

  const choice = moduleStateFor({
    module: "help",
    availability: result ? (result.availability as ModuleAvailability) : "loading",
    itemCount: result?.items.length ?? 0,
    asked: query.trim() !== "",
    online,
    packStored: null,
  });
  const clearSearch = () => {
    setText("");
    setQuery("");
  };
  const failures = useFailureStreak(result, result?.availability === "error");

  // Help numbers in the pack stored on this device. A missing, unreadable or unsupported pack shows nothing here.
  const [packHelp, setPackHelp] = useState<unknown>(null);
  useEffect(() => {
    let active = true;
    getPack("toronto").then(
      (pack) => { if (active) setPackHelp(pack?.content?.help_numbers ?? null); },
      () => { if (active) setPackHelp(null); },
    );
    return () => { active = false; };
  }, []);

  // Titles of every article, read once the search finds nothing, so close titles can be offered.
  const [allTitles, setAllTitles] = useState<ReturnType<typeof titledItems>>([]);
  const noMatches = choice?.type === "empty" && query.trim() !== "";
  useEffect(() => {
    if (!noMatches) return;
    let active = true;
    void modules.help
      .list({ locale, offline: !online, profile, nowIso: new Date().toISOString(), query: "" })
      .then(
        (value: ModuleResult<unknown>) => { if (active) setAllTitles(titledItems(value.items, locale)); },
        () => { if (active) setAllTitles([]); },
      );
    return () => { active = false; };
  }, [noMatches, locale, online, profile]);
  const hints = noMatches ? helpTitleHints(query, allTitles) : [];
  const pick = (label: string) => {
    setText(label);
    setQuery(label);
  };

  return (
    <div className="stack">
      <h1>{heading}</h1>
      {selected ? (
        <div className="stack">
          <p>{selected.how[locale]}</p>
          <p>{selected.contact}</p>
          <p>{t("offline.helpSource", { date: selected.provenance.retrieved_at })} {t(tierMessageKey(selected.provenance.tier))}</p>
        </div>
      ) : null}
      {contacts.length > 0 ? (
        <section className="stack" aria-labelledby="help-contacts">
          <h2 id="help-contacts">{t("help.contactsTitle")}</h2>
          <ul className="stack">
            {contacts.map((row) => (
              <li key={row.id}>
                <Link to={`/help/${encodeURIComponent(row.id)}`} style={{ minHeight: 44, display: "inline-flex", alignItems: "center" }} aria-current={row.id === id ? "page" : undefined}>
                  {row.name[locale] || row.name.en}
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
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
        {choice ? (
          <StateNotice
            lang={locale}
            view={escalateView(moduleStateView(choice, locale), { failures, online, packStored: null }, locale)}
            onAction={{ retry: () => setAttempt((count) => count + 1), "clear-search": clearSearch }}
          />
        ) : null}
        <SuggestionList hints={hints} locale={locale} onPick={pick} />
        {result ? <ResultItems id="help" items={result.items} /> : null}
      </section>
      {packHelp !== null ? <HelpNumbers numbers={packHelp} locale={locale} /> : null}
    </div>
  );
}
