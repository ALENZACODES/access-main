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
}

declare module "@access/event-access" {
  export const DEMONSTRATION_RECORDS: readonly unknown[];
}

declare module "@hub/handoff-fixtures" {
  export const demonstrationRecords: readonly unknown[];
  export const demonstrationHandoff: unknown;
}
