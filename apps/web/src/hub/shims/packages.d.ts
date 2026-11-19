declare module "@access-tools/employment" {
  import type { ComponentType } from "react";
  export const EmploymentView: ComponentType<{ language?: "en" | "fr"; lang?: "en" | "fr" }>;
}

declare module "@access-tools/housing" {
  import type { ComponentType } from "react";
  export const HousingFinder: ComponentType<{ language?: "en" | "fr"; lang?: "en" | "fr" }>;
}

declare module "@access-tools/safety" {
  import type { ComponentType } from "react";
  export const SafetyApp: ComponentType<{ language?: "en" | "fr"; lang?: "en" | "fr" }>;
  export const SafetyPanel: ComponentType<{
    language: "en" | "fr";
    onLanguage: (language: "en" | "fr") => void;
  }>;
}

declare module "@access-tools/diary" {
  import type { ComponentType } from "react";
  export const Diary: ComponentType<{ language?: "en" | "fr"; lang?: "en" | "fr" }>;
}

declare module "@access-tools/auditors" {
  import type { ComponentType } from "react";
  export const App: ComponentType<{ language?: "en" | "fr"; lang?: "en" | "fr" }>;
}

declare module "@access-tools/handoff" {
  import type { ComponentType } from "react";
  export const HandoffAudit: ComponentType<{ language?: "en" | "fr"; lang?: "en" | "fr" }>;
}

declare module "@access/peers" {
  export const PEER_TOPICS: Readonly<Record<string, string>> | readonly string[];
  export interface KeyValueStorage {
    getItem(key: string): string | null;
    setItem(key: string, value: string): void;
    removeItem(key: string): void;
  }
  export class ConnectionRequestStore {
    constructor(storage: KeyValueStorage);
  }
}

declare module "@hub/peers-ui" {
  import type { ComponentType } from "react";
  export const PeerRequestFlow: ComponentType<{ language: "en" | "fr"; store?: unknown; now?: () => string }>;
}

declare module "@access/event-access" {
  export const DEMONSTRATION_RECORDS: readonly unknown[];
}

declare module "@hub/handoff-fixtures" {
  export const demonstrationRecords: readonly unknown[];
  export const demonstrationHandoff: unknown;
}

declare module "@hub/games" {
  import type { ComponentType } from "react";
  export interface HubGamesSettings {
    playerId: string;
    language: "en" | "fr";
    [key: string]: unknown;
  }
  export interface HubGamesRound {
    roundId: string;
    [key: string]: unknown;
  }
  export const GamesApp: ComponentType<{
    settings: HubGamesSettings;
    rounds: HubGamesRound[];
    onSettings: (settings: HubGamesSettings) => void;
    onRound: (round: HubGamesRound) => void;
    onResetStreak: () => void;
  }>;
  export const GAME_LIBRARY: readonly { id: string; name: string }[];
  export function defaultSettings(playerId: string): HubGamesSettings;
  export function openGamesDatabase(): Promise<IDBDatabase>;
  export function readSettings(db: IDBDatabase, playerId: string): Promise<HubGamesSettings>;
  export function writeSettings(db: IDBDatabase, input: unknown): Promise<HubGamesSettings>;
  export function readRounds(db: IDBDatabase): Promise<HubGamesRound[]>;
  export function writeRound(db: IDBDatabase, input: unknown): Promise<HubGamesRound>;
  export function deleteGamesData(db: IDBDatabase): Promise<void>;
}

declare module "@access-maps/conditions" {
  import type { ComponentType } from "react";
  export type HubLocationRef = { type: "feature"; feature_id: string };
  export interface HubRouteReport {
    id: string;
    [key: string]: unknown;
  }
  export interface HubReportGroup {
    id: string;
    [key: string]: unknown;
  }
  export const RouteReportsList: ComponentType<{ groups: readonly HubReportGroup[]; language?: "en" | "fr" }>;
  export const RouteReportForm: ComponentType<{
    language?: "en" | "fr";
    location: HubLocationRef;
    locationLabel: string;
    sourceId: string;
    licence: string;
    reporterRef: string | null;
    newId: () => string;
    onSave: (report: HubRouteReport) => void;
  }>;
  export function corroborateReports(reports: readonly HubRouteReport[], now: Date): HubReportGroup[];
  export function validateReport(input: unknown): { ok: true; report: HubRouteReport } | { ok: false };
  export const WavFinder: ComponentType<{ records: readonly unknown[]; language?: "en" | "fr" }>;
  export function loadWavDataset(input: unknown, kind?: "dataset" | "fixture"): unknown[];
}

declare module "@hub/wav-dataset" {
  const dataset: { format: string; version: number; records: unknown[] };
  export default dataset;
}

declare module "@hub/event-access-ui" {
  import type { ComponentType } from "react";
  export const OrganiserForm: ComponentType<{ lang: "en" | "fr"; today: string }>;
}

declare module "@access/outings" {
  import type { ComponentType } from "react";
  export const EventOutingPlanner: ComponentType<{ lang: "en" | "fr"; today?: string }>;
}

declare module "@hub/advocacy-reports" {
  import type { ComponentType } from "react";
  export interface HubPackFile {
    name: string;
    mime: string;
    content: string;
  }
  export const ReportsPanel: ComponentType<{
    lang: "en" | "fr";
    input: unknown;
    options: unknown;
    logs: unknown;
    onExportFiles?: (files: HubPackFile[]) => void;
  }>;
}

declare module "@hub/advocacy-demo" {
  export const DEMO_REPORT_AS_OF: string;
  export const DEMO_PURPOSE: unknown;
  export const DEMO_REGIONS: readonly unknown[];
  export const DEMO_INPUT_SETS: readonly unknown[];
  export const DEMO_REPORTS: readonly unknown[];
  export const DEMO_CONSENT_LEDGER: readonly unknown[];
  export const DEMO_DELIVERIES: readonly unknown[];
  export const DEMO_CITATIONS: readonly unknown[];
  export const DEMO_REVIEWS: readonly unknown[];
}
