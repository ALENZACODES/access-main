import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import type { ModuleId, ModuleResult } from "@access/shared";
import { useProfileState } from "../profile/ProfileProvider.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { modules } from "../modules/stubs.ts";

const COPY: Record<ModuleId, { title: string; body: string }> = {
  places: { title: "modules.placesTitle", body: "modules.placesBody" },
  journey: { title: "modules.journeyTitle", body: "modules.journeyBody" },
  finders: { title: "modules.findersTitle", body: "modules.findersBody" },
  navigator: { title: "modules.navigatorTitle", body: "modules.navigatorBody" },
  games: { title: "modules.gamesTitle", body: "modules.gamesBody" },
  help: { title: "modules.helpTitle", body: "help.privacyBody" },
};

export function ModulePage({ id }: { id: Exclude<ModuleId, "help"> }) {
  const { t, i18n } = useTranslation();
  const { profile } = useProfileState();
  const online = useOnline();
  const [result, setResult] = useState<ModuleResult<unknown> | null>(null);
  const copy = COPY[id];
  useDocumentTitle(t(copy.title));

  useEffect(() => {
    const ctx = {
      locale: i18n.language.startsWith("fr") ? "fr" as const : "en" as const,
      offline: !online,
      profile,
      nowIso: new Date().toISOString(),
    };
    const pending =
      id === "places"
        ? modules.places.search({ text: "" }, ctx)
        : id === "journey"
          ? modules.journey.plan(
              {
                originLabel: null,
                destinationLabel: null,
                timing: profile
                  ? {
                      maxTimeBetweenWashroomsMin: profile.max_time_between_washrooms_min,
                      maxContinuousTravelMin: profile.max_continuous_travel_min,
                    }
                  : null,
                routingPreference: profile?.routing_preference ?? null,
                offline: !online,
              },
              ctx,
            )
          : id === "finders"
            ? modules.finders.search({ kind: "washroom", text: "" }, ctx)
            : id === "navigator"
              ? modules.navigator.list(ctx)
              : modules.games.list(ctx);
    void pending.then((value) => setResult(value as ModuleResult<unknown>));
  }, [id, i18n.language, online, profile]);

  return (
    <div className="stack">
      <h1>{t(copy.title)}</h1>
      <p className="lead">{t(copy.body)}</p>
      <p>{t("modules.notConnected")}</p>
      <p role="status">{result ? t("modules.resultCount", { count: result.items.length }) : t("home.checking")}</p>
      <p>{t("data.liveBody")}</p>
    </div>
  );
}
