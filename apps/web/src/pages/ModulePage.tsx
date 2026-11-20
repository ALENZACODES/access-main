import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FINDER_KINDS, type FinderKind, type JourneyPlan, type ModuleId, type ModuleResult, type PlaceHit } from "@access/shared";
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
import { JourneyForm, JourneyPlanDetails, type TripRequest } from "./JourneyForm.tsx";
import { DataCredits, PackCompare, PackFreshness, PackPlaces, PackReport, StateNotice, creditRecordsFromPack, escalateView, moduleStateFor, moduleStateView, useFailureStreak, type ModuleAvailability } from "../states/index.ts";

const COPY: Record<ModuleId, { title: string; body: string }> = {
  places: { title: "modules.placesTitle", body: "modules.placesBody" },
  journey: { title: "modules.journeyTitle", body: "modules.journeyBody" },
  finders: { title: "modules.findersTitle", body: "modules.findersBody" },
  navigator: { title: "modules.navigatorTitle", body: "modules.navigatorBody" },
  games: { title: "modules.gamesTitle", body: "modules.gamesBody" },
  help: { title: "modules.helpTitle", body: "help.privacyBody" },
};

/**
 * Empty journey results that are not "no route": the adapter's own sentence
 * (lane-adapters.ts) says why nothing was planned, so the Day 22 no-route
 * notice is not added on top of it.
 */
const JOURNEY_NOT_PLANNED = new Set(["journey.awaiting", "journey.needBoth", "journey.notFound", "journey.ambiguous", "journey.noCoordinates", "journey.noArea"]);

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
  const [kind, setKind] = useState<FinderKind>("washroom");
  const [submitted, setSubmitted] = useState({ text: "", origin: "", destination: "", originId: null as string | null, destinationId: null as string | null, kind: "washroom" as FinderKind });
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
  // Places in the pack stored on this device. A missing, unreadable or unsupported pack shows nothing here.
  const [packPlaces, setPackPlaces] = useState<unknown>(null);
  useEffect(() => {
    if (id !== "places") return;
    let active = true;
    getPack(OFFLINE_PACK_ID).then(
      (pack) => { if (active) setPackPlaces(pack?.content?.places ?? null); },
      () => { if (active) setPackPlaces(null); },
    );
    return () => { active = false; };
  }, [id]);
  const packCredits = useMemo(() => creditRecordsFromPack(packPlaces), [packPlaces]);
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
                originId: submitted.originId,
                destinationId: submitted.destinationId,
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
  // A trip that was not planned (no start, no end, not found) is not "no route": only a planned trip with no items is.
  const tripAsked = asked && !(id === "journey" && result !== null && JOURNEY_NOT_PLANNED.has(result.messageKey));
  const choice = moduleStateFor({
    module: id,
    availability: result ? (result.availability as ModuleAvailability) : "loading",
    itemCount: result?.items.length ?? 0,
    asked: tripAsked,
    online,
    packStored,
  });
  const failures = useFailureStreak(result, result?.availability === "error");
  // The /journey place pickers use the same place search as /places.
  const placeSearch = (query: string) => getModules().places.search({ text: query }, {
    locale,
    offline: !online,
    profile,
    nowIso: new Date().toISOString(),
    query,
  });
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
        <JourneyForm
          canPlan={canSearch}
          formRef={tripForm}
          describedBy={result?.availability === "stub" ? `${id}-search-unavailable` : undefined}
          search={placeSearch}
          onPlan={(trip: TripRequest) => {
            setAsked(true);
            setSubmitted((current) => ({ ...current, ...trip }));
          }}
        />
      ) : null}
      <p role="status">{result ? t("modules.resultCount", { count: result.items.length }) : t("home.checking")}</p>
      {choice ? (
        <StateNotice
          lang={locale}
          view={escalateView(moduleStateView(choice, locale), { failures, online, packStored }, locale)}
          onAction={{
            retry: () => setAttempt((count) => count + 1),
            "clear-search": clearSearch,
            "change-trip": () => tripForm.current?.querySelector("input")?.focus(),
          }}
        />
      ) : null}
      {result ? <ResultItems id={id} items={result.items} /> : null}
      {id === "journey" && result?.availability === "ready" ? <JourneyPlanDetails items={result.items as JourneyPlan[]} /> : null}
      {id === "places" && result && result.items.length > 0 ? (
        <ul className="stack">
          {(result.items as PlaceHit[]).map((item) => (
            <li key={item.id}>
              <Link to={`/places/${encodeURIComponent(item.id)}`}>{t("lanes.openPlace", { name: item.name })}</Link>
            </li>
          ))}
        </ul>
      ) : null}
      {id === "places" && packPlaces !== null ? <PackPlaces places={packPlaces} locale={locale} /> : null}
      {id === "places" && packPlaces !== null ? <PackFreshness places={packPlaces} locale={locale} /> : null}
      {id === "places" && packPlaces !== null ? <PackReport places={packPlaces} locale={locale} /> : null}
      {id === "places" && packPlaces !== null ? <PackCompare places={packPlaces} locale={locale} today={new Date().toISOString().slice(0, 10)} /> : null}
      {id === "places" && packCredits.length > 0 ? <DataCredits records={packCredits} locale={locale} showOsmCredit={false} /> : null}
      <p>{t("data.liveBody")}</p>
    </div>
  );
}
