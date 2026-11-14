import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { MODULE_IDS, type ModuleId } from "@access/shared";
import { BUILD_ID, CONTRACT_VERSION } from "../buildInfo.ts";
import { moduleStates, offlineReadiness, summarizeEntries, type CardSummary, type ModuleState } from "../buildCard/summary.ts";
import { Button } from "../design/Button.tsx";
import { modules } from "../modules/stubs.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { listCacheEntries } from "../storage/repository.ts";

const PART_KEY: Record<ModuleId, string> = {
  places: "nav.places",
  journey: "nav.journey",
  finders: "nav.finders",
  navigator: "nav.navigator",
  games: "nav.games",
  help: "nav.help",
};

const STATE_KEY: Record<ModuleState, string> = {
  connected: "buildCard.stateConnected",
  "not connected": "buildCard.stateNotConnected",
  error: "buildCard.stateError",
};

const HONESTY = [
  "buildCard.honestyPrototype",
  "buildCard.honestyUnverified",
  "buildCard.honestyOutage",
  "noEndorsement",
  "buildCard.honestyMedical",
  "buildCard.honestyFrench",
] as const;

/** Master plan Day 25: the build card the presenter keeps beside the device. */
export function BuildCardPage() {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const [summary, setSummary] = useState<CardSummary | null>(null);
  const [states, setStates] = useState<Record<ModuleId, ModuleState> | null>(null);
  const [worker, setWorker] = useState<"active" | "inactive" | "unsupported" | "unknown">("unknown");
  useDocumentTitle(t("buildCard.title"));
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";

  useEffect(() => {
    void listCacheEntries().then((entries) => setSummary(summarizeEntries(entries)));
    if (!("serviceWorker" in navigator)) setWorker("unsupported");
    else setWorker(navigator.serviceWorker.controller ? "active" : "inactive");
  }, []);

  useEffect(() => {
    let live = true;
    void moduleStates(modules, locale, new Date().toISOString()).then((result) => {
      if (live) setStates(result);
    });
    return () => {
      live = false;
    };
  }, [locale]);

  const readiness = offlineReadiness(worker);

  return (
    <div className="stack build-card">
      <h1>{t("buildCard.title")}</h1>
      <p className="lead">{t("buildCard.lead")}</p>
      <div className="no-print stack">
        <Button variant="secondary" onPress={() => window.print()}>
          {t("buildCard.print")}
        </Button>
        <p>{t("buildCard.printNote")}</p>
      </div>

      <section className="panel" aria-labelledby="card-build">
        <h2 id="card-build">{t("buildCard.buildTitle")}</h2>
        <p>{t("buildCard.built", { id: BUILD_ID })}</p>
        <p>{t("buildCard.contract", { version: CONTRACT_VERSION })}</p>
        <p>{t("buildCard.language", { language: locale === "fr" ? t("language.french") : t("language.english") })}</p>
      </section>

      <section className="stack" aria-labelledby="card-honesty">
        <h2 id="card-honesty">{t("buildCard.honestyTitle")}</h2>
        <p>{t("buildCard.honestyIntro")}</p>
        <ol>
          {HONESTY.map((key) => (
            <li key={key}>{t(key)}</li>
          ))}
        </ol>
      </section>

      <section className="stack" aria-labelledby="card-counts">
        <h2 id="card-counts">{t("buildCard.countsTitle")}</h2>
        <p>{t("buildCard.countsIntro")}</p>
        {!summary ? <p>{t("home.checking")}</p> : null}
        {summary && summary.total === 0 ? <p>{t("buildCard.countsNone")}</p> : null}
        {summary && summary.total > 0 ? (
          <>
            <p>{t("storage.cacheCount", { count: summary.total })}</p>
            <table className="card-table">
              <caption>{t("buildCard.byKindCaption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("buildCard.kind")}</th>
                  <th scope="col">{t("buildCard.records")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.byKind.map((row) => (
                  <tr key={row.kind}>
                    <th scope="row">{row.kind}</th>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <table className="card-table">
              <caption>{t("buildCard.byTierCaption")}</caption>
              <thead>
                <tr>
                  <th scope="col">{t("buildCard.tier")}</th>
                  <th scope="col">{t("buildCard.records")}</th>
                </tr>
              </thead>
              <tbody>
                {summary.byTier.map((row) => (
                  <tr key={row.tier}>
                    <th scope="row">{row.tier}</th>
                    <td>{row.count}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        ) : null}
      </section>

      <section className="stack" aria-labelledby="card-sources">
        <h2 id="card-sources">{t("buildCard.sourcesTitle")}</h2>
        {summary && summary.sources.length === 0 ? <p>{t("buildCard.sourcesNone")}</p> : null}
        {summary && summary.sources.length > 0 ? (
          <table className="card-table">
            <caption>{t("buildCard.sourcesCaption")}</caption>
            <thead>
              <tr>
                <th scope="col">{t("buildCard.source")}</th>
                <th scope="col">{t("buildCard.licence")}</th>
                <th scope="col">{t("buildCard.sourceDate")}</th>
                <th scope="col">{t("buildCard.records")}</th>
              </tr>
            </thead>
            <tbody>
              {summary.sources.map((row) => (
                <tr key={`${row.source_name}|${row.licence}|${row.source_date}`}>
                  <th scope="row">{row.source_name}</th>
                  <td>{row.licence}</td>
                  <td>{row.source_date || t("buildCard.noDate")}</td>
                  <td>{row.records}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
        {summary && summary.undated > 0 ? <p>{t("buildCard.undated", { count: summary.undated })}</p> : null}
      </section>

      <section className="stack" aria-labelledby="card-verification">
        <h2 id="card-verification">{t("buildCard.verificationTitle")}</h2>
        <p>{t("buildCard.verificationBody")}</p>
        <p>{t("buildCard.verifiedCount", { count: summary?.verifiedClaims ?? 0 })}</p>
      </section>

      <section className="stack" aria-labelledby="card-modules">
        <h2 id="card-modules">{t("buildCard.modulesTitle")}</h2>
        <table className="card-table">
          <caption>{t("buildCard.modulesCaption")}</caption>
          <thead>
            <tr>
              <th scope="col">{t("buildCard.part")}</th>
              <th scope="col">{t("buildCard.state")}</th>
            </tr>
          </thead>
          <tbody>
            {MODULE_IDS.map((id) => (
              <tr key={id}>
                <th scope="row">{t(PART_KEY[id])}</th>
                <td>{states ? t(STATE_KEY[states[id]]) : t("buildCard.stateChecking")}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p>{t("buildCard.journeysNote")}</p>
      </section>

      <section className="stack" aria-labelledby="card-fallback">
        <h2 id="card-fallback">{t("buildCard.fallbackTitle")}</h2>
        <p>
          {readiness === "ready" ? t("buildCard.fallbackReady") : null}
          {readiness === "not ready" ? t("buildCard.fallbackNotReady") : null}
          {readiness === "unknown" ? t("buildCard.fallbackUnknown") : null}
        </p>
        <p>{t("buildCard.fallbackLimit")}</p>
        <p>{t("buildCard.connection", { state: online ? t("footer.online") : t("footer.offline") })}</p>
      </section>
    </div>
  );
}
