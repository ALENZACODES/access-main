import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FINDER_KINDS, type FinderKind, type ModuleId, type ModuleResult } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { ResultItems, statusKey } from "../modules/ResultItems.tsx";
import { StubNote } from "../modules/StubNote.tsx";
import { modules } from "../modules/stubs.ts";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";

const COPY: Record<ModuleId, { title: string; body: string }> = {
  places: { title: "modules.placesTitle", body: "modules.placesBody" },
  journey: { title: "modules.journeyTitle", body: "modules.journeyBody" },
  finders: { title: "modules.findersTitle", body: "modules.findersBody" },
  navigator: { title: "modules.navigatorTitle", body: "modules.navigatorBody" },
  games: { title: "modules.gamesTitle", body: "modules.gamesBody" },
  help: { title: "modules.helpTitle", body: "help.privacyBody" },
};

const KIND_KEY: Record<FinderKind, string> = {
  washroom: "modules.kindWashroom",
  parking: "modules.kindParking",
  charging: "modules.kindCharging",
  repair: "modules.kindRepair",
  "adult-change": "modules.kindChange",
};


export function ModulePage({ id }: { id: Exclude<ModuleId, "help"> }) {
  const { t, i18n } = useTranslation();
  const { profile } = useProfileState();
  const online = useOnline();
  const [text, setText] = useState("");
  const [origin, setOrigin] = useState("");
  const [destination, setDestination] = useState("");
  const [kind, setKind] = useState<FinderKind>("washroom");
  const [submitted, setSubmitted] = useState({ text: "", origin: "", destination: "", kind: "washroom" as FinderKind });
  const [result, setResult] = useState<ModuleResult<unknown> | null>(null);
  const copy = COPY[id];
  useDocumentTitle(t(copy.title));

  useEffect(() => {
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
    void pending.then((value) => setResult(value as ModuleResult<unknown>));
  }, [id, i18n.language, online, profile, submitted]);

  const canSearch = result?.availability === "ready";
  const hasSearch = id === "places" || id === "finders" || id === "journey";

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
          className="stack"
          aria-describedby={result?.availability === "stub" ? `${id}-search-unavailable` : undefined}
          onSubmit={(event) => {
            event.preventDefault();
            if (!canSearch) return;
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
      {result ? <ResultItems id={id} items={result.items} /> : null}
      <p>{t("data.liveBody")}</p>
    </div>
  );
}
