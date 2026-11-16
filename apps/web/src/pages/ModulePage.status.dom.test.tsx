/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { Provenance } from "@access/shared";
import { initI18n } from "../i18n/index.ts";

/**
 * Status sentences on ModulePage: an empty ready list, a finder search with
 * zero hits, and a non-empty ready list, in English and French.
 */

const ready = (moduleId: string, items: unknown[] = [], messageKey = "modules.ready") => ({
  moduleId,
  availability: "ready" as const,
  items,
  messageKey,
  asOf: null,
  liveStatus: "unavailable" as const,
});

const placesSearch = vi.fn();
const findersSearch = vi.fn();

vi.mock("../modules/linked.ts", () => ({
  getModules: () => ({
    places: { search: placesSearch },
    journey: { plan: async () => ready("journey") },
    finders: { search: findersSearch },
    navigator: { list: async () => ready("navigator") },
    games: { list: async () => ready("games") },
  }),
}));
vi.mock("../profile/ProfileProvider.tsx", () => ({ useProfileState: () => ({ profile: null }) }));

const { ModulePage } = await import("./ModulePage.tsx");
const i18n = initI18n();

const PROVENANCE: Provenance = {
  source_name: "Synthetic test source",
  source_url: null,
  licence: "UNKNOWN",
  licence_url: null,
  source_date: "2026-11-01",
  retrieved_at: "2026-11-13T12:00:00.000Z",
  tier: 0,
  prototype_label: "SEEDED-OPEN-DATA",
  freshness: "unknown",
};

const SENTENCES = {
  en: {
    empty: "No records are shown.",
    noMatches: "No matching records were found. The search ran on the linked part of the App. Unknown stays unknown.",
    ready:
      "These records come from the linked part of the App. Each one shows its source, licence, date, and tier. Unknown stays unknown.",
  },
  fr: {
    empty: "Aucune fiche n’est affichée.",
    noMatches:
      "Aucune fiche correspondante n’a été trouvée. La recherche a porté sur la partie liée de the App. L’inconnu reste inconnu.",
    ready:
      "Ces fiches viennent de la partie liée de the App. Chacune indique sa source, sa licence, sa date et son niveau. L’inconnu reste inconnu.",
  },
} as const;

async function view(lang: "en" | "fr", id: "places" | "finders") {
  await i18n.changeLanguage(lang);
  document.documentElement.lang = lang;
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter>
        <ModulePage id={id} />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
beforeEach(() => {
  placesSearch.mockReset();
  findersSearch.mockReset();
});
afterEach(cleanup);

describe("ModulePage status sentences", () => {
  for (const lang of ["en", "fr"] as const) {
    it(`renders empty, no-matches, and ready sentences in ${lang}`, async () => {
      const copy = SENTENCES[lang];

      placesSearch.mockImplementation(async () => ready("places", []));
      await view(lang, "places");
      expect(await screen.findByText(copy.empty)).toBeTruthy();
      expect(screen.queryByText(copy.ready)).toBeNull();
      expect(screen.queryByText(copy.noMatches)).toBeNull();
      cleanup();

      findersSearch.mockImplementation(async () => ready("finders", [], "finder.shell.noMatches"));
      await view(lang, "finders");
      expect(await screen.findByText(copy.noMatches)).toBeTruthy();
      expect(screen.queryByText(copy.ready)).toBeNull();
      expect(screen.queryByText(copy.empty)).toBeNull();
      cleanup();

      placesSearch.mockImplementation(async () =>
        ready("places", [{ id: "p1", name: "Synthetic place", provenance: PROVENANCE }]),
      );
      await view(lang, "places");
      expect(await screen.findByText(copy.ready)).toBeTruthy();
      expect(screen.queryByText(copy.empty)).toBeNull();
      expect(screen.queryByText(copy.noMatches)).toBeNull();
    });
  }
});
