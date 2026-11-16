import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FINDER_KINDS, type FinderKind, type ModuleId, type ModuleResult, type PlaceHit } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { ResultItems, statusKey } from "../modules/ResultItems.tsx";
import { StubNote } from "../modules/StubNote.tsx";
import { getModules } from "../modules/linked.ts";
import { useLaneStrings } from "../modules/strings.ts";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { getPack } from "../storage/repository.ts";
import { StateNotice, ERROR_KINDS, getRouteEmpty, getRouteError, getState, type EmptyKind, type ErrorKind } from "../states/index.ts";

const COPY: Record<ModuleId, { title: string; body: string }> = {
  places: { title: "modules.placesTitle", body: "modules.placesBody" },
  journey: { title: "modules.journeyTitle", body: "modules.journeyBody" },
  finders: { title: "modules.findersTitle", body: "modules.findersBody" },
  navigator: { title: "modules.navigatorTitle", body: "modules.navigatorBody" },
  games: { title: "modules.gamesTitle", body: "modules.gamesBody" },
  help: { title: "modules.helpTitle", body: "help.privacyBody" },
};

/** The pack the Offline pack page downloads. */
const OFFLINE_PACK_ID = "toronto";

const KIND_KEY: Record<FinderKind, string> = {
  washroom: "modules.kindWashroom",
  parking: "modules.kindParking",
  charging: "modules.kindCharging",
  repair: "modules.kindRepair",
  "adult-change": "modules.kindChange",
};


export function ModulePage({ id }: { id: Exclude<ModuleId, "help"> }) {
  const { t, i18n } = useLaneStrings();
  const { profile } = useProfileState();
  const online = useOnline();
  const [text, setText] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [kind, setKind] = useState<FinderKind>("washroom");
  const [submitted, setSubmitted] = useState({ text: "", origin: "", destination: "", kind: "washroom" as FinderKind });
  const [result, setResult] = useState<ModuleResult<unknown> | null>(null);
  // Day 22 states: whether the person has asked for something, and a retry counter.
  const [asked, setAsked] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const tripForm = useRef<HTMLFormElement>(null);
  // Offline, the "no offline pack" state is shown only when this device really has none.
  const [packStored, setPackStored] = useState<boolean | null>(null);
  useEffect(() => {
    if (online) return;
    let active = true;
    void getPack(OFFLINE_PACK_ID).then((pack) => { if (active) setPackStored(pack !== null); });
    return () => { active = false; };
  }, [online]);
  const copy = COPY[id];
  useDocumentTitle(t(copy.title));

  useEffect(() => {
    const modules = getModules();
    const ctx = {
      locale: i18n.language.startsWith("fr") ? "fr" as const : "en" as const,
      offline: !online,
      profile,
      nowIso: new Date().toISOString(),
      query: submitted.text,
    };
    const pending =
      id === "places"
        ? modules.places.search({ text: submitted.text }, ctx)
        : id === "journey"
          ? modules.journey.plan(
              {
                originLabel: submitted.origin || null,
                destinationLabel: submitted.destination || null,
                routingPreference: profile?.routing_preference ?? null,
                offline: !online,
              },
              ctx,
            )
          : id === "finders"
            ? modules.finders.search({ kind: submitted.kind, text: submitted.text }, ctx)
            : id === "navigator"
              ? modules.navigator.list(ctx)
              : modules.games.list(ctx);
    let active = true;
    void pending.then(
      (value) => { if (active) setResult(value as ModuleResult<unknown>); },
      // A module that fails to load is an error state with a retry, not a silent blank.
      () => { if (active) setResult({ moduleId: id, availability: "error", items: [], messageKey: "modules.error", asOf: null, liveStatus: "unavailable" }); },
    );
    return () => { active = false; };
  }, [id, i18n.language, online, profile, submitted, attempt]);

  const canSearch = result?.availability === "ready";
  const hasSearch = id === "places" || id === "finders" || id === "journey";
  const locale = i18n.language.startsWith("fr") ? "fr" as const : "en" as const;
  const stateKind: ErrorKind | EmptyKind | null = !result
    ? null
    : hasSearch && !online && packStored === false && result.availability !== "ready"
      ? "offline-no-pack"
      : id === "games" && result.availability === "error"
        ? "game-load-failed"
        : asked && result.availability === "ready" && result.items.length === 0
          ? id === "places" ? "search-no-results" : id === "finders" ? "finder-no-results" : id === "journey" ? "journey-no-route" : null
          : null;
  const clearSearch = () => {
    setText("");
    setAsked(false);
    setSubmitted((current) => ({ ...current, text: "" }));
  };

  return (
    <div className="stack">
      <h1>{t(copy.title)}</h1>
      <p className="lead">{t(copy.body)}</p>
      {id === "places" || id === "journey" ? <p>{t("modules.noMap")}</p> : null}
      {result?.availability === "stub" ? <StubNote id={id} search={hasSearch} /> : (
        <p>{result ? t(statusKey(result)) : t("home.checking")}</p>
      )}
      {id === "places" || id === "finders" ? (
        <form
          className="stack"
          aria-describedby={result?.availability === "stub" ? `${id}-search-unavailable` : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSearch) return;
            setAsked(true);
            setSubmitted((current) => ({ ...current, text, kind }));
          }}
        >
          {id === "finders" ? (
            <ChoiceGroup
              label={t("modules.finderKind")}
              value={kind}
              isDisabled={!canSearch}
              onChange={(value) => {
                if ((FINDER_KINDS as readonly string[]).includes(value)) setKind(value as FinderKind);
              }}
              options={FINDER_KINDS.map((value) => ({ value, label: t(KIND_KEY[value]) }))}
            />
          ) : null}
          <TextInput label={t("modules.searchLabel")} value={text} onChange={setText} isDisabled={!canSearch} />
          <div className="button-row">
            <Button type="submit" isDisabled={!canSearch}>{t("modules.searchAction")}</Button>
          </div>
        </form>
      ) : null}
      {id === "journey" ? (
        <form
          ref={tripForm}
          className="stack"
          aria-describedby={result?.availability === "stub" ? `${id}-search-unavailable` : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSearch) return;
            setAsked(true);
            setSubmitted((current) => ({ ...current, origin, destination }));
          }}
        >
          <TextInput label={t("modules.origin")} value={origin} onChange={setOrigin} isDisabled={!canSearch} />
          <TextInput label={t("modules.destination")} value={destination} onChange={setDestination} isDisabled={!canSearch} />
          <div className="button-row">
            <Button type="submit" isDisabled={!canSearch}>{t("modules.plan")}</Button>
          </div>
        </form>
      ) : null}
      <p role="status">{result ? t("modules.resultCount", { count: result.items.length }) : t("home.checking")}</p>
      {stateKind ? (
        <StateNotice
          lang={locale}
          view={
            (id === "places" || id === "finders" || id === "journey")
              ? (
                  (ERROR_KINDS as string[]).includes(stateKind)
                    ? getRouteError(id === "places" ? "search" : id, stateKind as ErrorKind, locale)
                    : getRouteEmpty(id === "places" ? "search" : id, locale) ?? getState(stateKind, locale)
                )
              : getState(stateKind, locale)
          }
          onAction={{
            retry: () => setAttempt((count) => count + 1),
            "clear-search": clearSearch,
            "change-trip": () => tripForm.current?.querySelector("input")?.focus(),
          }}
        />
      ) : null}
      {result ? <ResultItems id={id} items={result.items} /> : null}
      {id === "places" && result && result.items.length > 0 ? (
        <ul className="stack">
          {(result.items as PlaceHit[]).map((item) => (
            <li key={item.id}>
              <Link to={`/places/${encodeURIComponent(item.id)}`}>{t("lanes.openPlace", { name: item.name })}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      <p>{t("data.liveBody")}</p>
    </div>
  );
}
