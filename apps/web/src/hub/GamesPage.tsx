import {
  GamesApp, defaultSettings, deleteGamesData, openGamesDatabase, readRounds, readSettings, writeRound, writeSettings,
  type HubGamesRound, type HubGamesSettings,
} from "@hub/games";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { applyLanguage } from "../i18n/index.ts";
import { PackageView } from "./PackageView";

/** Games records are keyed by one local player. Nothing here identifies a person. */
const PLAYER_ID = "local-player";

type Loaded = { settings: HubGamesSettings; rounds: HubGamesRound[]; saved: boolean };

/**
 * Hosts the games package: settings (text size, contrast, dwell select) and finished rounds are kept in the
 * package's own on-device database. When that database cannot be opened, the games still run and nothing is kept.
 */
export default function GamesPage() {
  const { t, i18n } = useTranslation("hub");
  const language = i18n.resolvedLanguage?.startsWith("fr") ? "fr" as const : "en" as const;
  const db = useRef<IDBDatabase | null>(null);
  const [state, setState] = useState<Loaded | null>(null);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const opened = await openGamesDatabase();
        const [settings, rounds] = await Promise.all([readSettings(opened, PLAYER_ID), readRounds(opened)]);
        if (!active) { opened.close(); return; }
        db.current = opened;
        setState({ settings, rounds, saved: true });
      } catch {
        if (active) setState({ settings: defaultSettings(PLAYER_ID), rounds: [], saved: false });
      }
    })();
    return () => {
      active = false;
      db.current?.close();
      db.current = null;
    };
  }, []);

  if (!state) return <PackageView page="games" component={Loading} />;

  const keep = (work: (opened: IDBDatabase) => Promise<unknown>) => {
    const opened = db.current;
    if (!opened) return;
    void work(opened).catch(() => setState((current) => (current ? { ...current, saved: false } : current)));
  };
  const onSettings = (next: HubGamesSettings) => {
    setState((current) => (current ? { ...current, settings: next } : current));
    keep((opened) => writeSettings(opened, next));
    // The package has its own language button. The shell follows it, so the page never shows two languages.
    if (next.language !== language) void applyLanguage(next.language, true);
  };
  const onRound = (round: HubGamesRound) => {
    setState((current) => (current ? { ...current, rounds: [...current.rounds, round] } : current));
    keep((opened) => writeRound(opened, round));
  };
  const onResetStreak = () => {
    const settings = state.settings;
    setState((current) => (current ? { ...current, rounds: [] } : current));
    keep(async (opened) => {
      await deleteGamesData(opened);
      await writeSettings(opened, settings);
    });
  };

  return (
    <PackageView
      page="games"
      component={GamesApp}
      props={{ settings: { ...state.settings, language }, rounds: state.rounds, onSettings, onRound, onResetStreak }}
    >
      <p>{t("gamesNote")}</p>
      {state.saved ? null : <p role="status">{t("gamesNotSaved")}</p>}
    </PackageView>
  );
}

function Loading() {
  const { t } = useTranslation("hub");
  return <p role="status">{t("loading")}</p>;
}
