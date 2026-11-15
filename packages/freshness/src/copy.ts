import type { AccessibilityFact, FreshnessResult } from "./classes";

export type Language = "en" | "fr";

export const COPY = {
  en: {
    current: "Last checked",
    needsCheck: "Needs check",
    unknown: "Unknown",
    lastChecked: "Last checked",
    expiresAt: "Check by",
    source: "Source",
    licence: "Licence",
    retrieved: "Retrieved",
    tier: "Evidence tier",
    taskList: "Fields needing a check",
    noTasks: "No expired fields in this list",
    expiredReason: "Previously checked information has expired",
    osmAttribution: "\u00A9 OpenStreetMap contributors, ODbL",
  },
  fr: {
    current: "Derni\u00e8re v\u00e9rification",
    needsCheck: "\u00c0 v\u00e9rifier",
    unknown: "Inconnu",
    lastChecked: "Derni\u00e8re v\u00e9rification",
    expiresAt: "\u00c0 v\u00e9rifier avant le",
    source: "Source",
    licence: "Licence",
    retrieved: "R\u00e9cup\u00e9r\u00e9 le",
    tier: "Niveau de preuve",
    taskList: "Champs \u00e0 v\u00e9rifier",
    noTasks: "Aucun champ expir\u00e9 dans cette liste",
    expiredReason: "La p\u00e9riode de validit\u00e9 de la derni\u00e8re v\u00e9rification est d\u00e9pass\u00e9e",
    osmAttribution: "\u00A9 OpenStreetMap contributors, ODbL",
  },
} as const;

export interface BadgePresentation {
  label: string;
  state: FreshnessResult["state"];
  verified: boolean;
}

export function formatDate(
  isoDate: string | null | undefined,
  language: Language,
): string {
  if (!isoDate) return COPY[language].unknown;

  const date = new Date(isoDate);
  if (!Number.isFinite(date.getTime())) return COPY[language].unknown;

  return new Intl.DateTimeFormat(
    language === "fr" ? "fr-CA" : "en-CA",
    {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "UTC",
      timeZoneName: "short",
    },
  ).format(date);
}

/**
 * This is presentation metadata, not an alteration of the field.
 *
 * Expired or unknown fields never receive a verified indicator.
 * Only pre-existing evidence tiers 2 and 3 may qualify.
 */
export function badgeFor(
  result: FreshnessResult,
  fact: AccessibilityFact | null | undefined,
  language: Language,
): BadgePresentation {
  const copy = COPY[language];

  if (result.state === "unknown") {
    return {
      label: copy.unknown,
      state: "unknown",
      verified: false,
    };
  }

  if (result.state === "needs-check") {
    return {
      label: copy.needsCheck,
      state: "needs-check",
      verified: false,
    };
  }

  if (!result.lastChecked) {
    return {
      label: copy.unknown,
      state: "unknown",
      verified: false,
    };
  }

  return {
    label: `${copy.current} ${formatDate(result.lastChecked, language)}`,
    state: "current",
    verified: fact?.tier === 2 || fact?.tier === 3,
  };
}
