import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { FINDER_KINDS, laneBinding, type FinderKind, type ModuleId, type ModuleResult } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
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

function itemText(item: unknown): string | null {
  if (!item || typeof item !== "object") return null;
  const record = item as Record<string, unknown>;
  for (const key of ["name", "title", "summary"]) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  return null;
}

export function ModulePage({ id }: { id: Exclude<ModuleId, "help"> }) {
  const { t, i18n } = useTranslation();
  const { profile } = useProfileState();
  const online = useOnline();
  const binding = laneBinding(id);
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

  const items = (result?.items ?? []).map(itemText).filter((label): label is string => Boolean(label));

  return (
    <div className="stack">
      <h1>{t(copy.title)}</h1>
      <p className="lead">{t(copy.body)}</p>
      {id === "places" || id === "journey" ? <p>{t("modules.noMap")}</p> : null}
      {id === "places" || id === "finders" ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted((current) => ({ ...current, text, kind }));
          }}
        >
          {id === "finders" ? (
            <ChoiceGroup
              label={t("modules.finderKind")}
              value={kind}
              onChange={(value) => {
                if ((FINDER_KINDS as readonly string[]).includes(value)) setKind(value as FinderKind);
              }}
              options={FINDER_KINDS.map((value) => ({ value, label: t(KIND_KEY[value]) }))}
            />
          ) : null}
          <TextInput label={t("modules.searchLabel")} value={text} onChange={setText} />
          <div className="button-row">
            <Button type="submit">{t("modules.searchAction")}</Button>
          </div>
        </form>
      ) : null}
      {id === "journey" ? (
        <form
          className="stack"
          onSubmit={(event) => {
            event.preventDefault();
            setSubmitted((current) => ({ ...current, origin, destination }));
          }}
        >
          <TextInput label={t("modules.origin")} value={origin} onChange={setOrigin} />
          <TextInput label={t("modules.destination")} value={destination} onChange={setDestination} />
          <div className="button-row">
            <Button type="submit">{t("modules.plan")}</Button>
          </div>
        </form>
      ) : null}
      <p>
        {result?.availability === "stub"
          ? t("modules.assigned", { packageName: binding.packageName, repository: binding.repository })
          : result
            ? t(result.messageKey)
            : t("home.checking")}
      </p>
      <p role="status">{result ? t("modules.resultCount", { count: result.items.length }) : t("home.checking")}</p>
      {items.length > 0 ? (
        <ul>
          {items.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      ) : null}
      <p>{t("data.liveBody")}</p>
    </div>
  );
}
