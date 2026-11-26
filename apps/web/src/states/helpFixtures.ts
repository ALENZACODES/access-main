/** Help numbers for tests. Not part of the app. */
import type { HelpNumber } from "./packHelp";

export function help(over: Partial<HelpNumber> = {}): HelpNumber {
  return {
    id: "h",
    name: { en: "Health811", fr: "Health811" },
    how: { en: "Call 811 for non-urgent health information.", fr: "Composez le 811 pour de l’information de santé non urgente." },
    contact: "811",
    url: "https://example.org/811",
    sourceName: "Official page, desk check",
    sourceUrl: "https://example.org/811",
    licence: null,
    retrievedOn: "2026-11-13",
    tier: "E",
    ...over,
  };
}
