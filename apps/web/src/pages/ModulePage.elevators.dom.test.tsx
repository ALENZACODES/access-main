/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { initI18n } from "../i18n/index.ts";

/** Wiring: the places page shows the elevator notices of the pack stored on this device, and only there. */
const ready = (moduleId: string) => ({ moduleId, availability: "ready", items: [], messageKey: "modules.ready", asOf: null, liveStatus: "unavailable" });
const getPack = vi.fn();
const flags = vi.hoisted(() => ({ online: true }));

vi.mock("../storage/repository.ts", () => ({ getPack: (...args: unknown[]) => getPack(...args) }));
vi.mock("../shell/useOnline.ts", () => ({ useOnline: () => flags.online }));
vi.mock("../profile/ProfileProvider.tsx", () => ({ useProfileState: () => ({ profile: null }) }));
vi.mock("../modules/linked.ts", () => ({
  getModules: () => ({
    places: { search: async () => ready("places") },
    journey: { plan: async () => ready("journey") },
    finders: { search: async () => ready("finders") },
    navigator: { list: async () => ready("navigator") },
    games: { list: async () => ready("games") },
  }),
}));

const { ModulePage } = await import("./ModulePage.tsx");
const i18n = initI18n();
const content = JSON.parse(contentText) as { places: unknown[]; elevator_status: unknown[] };

async function page(id: "places" | "finders" | "journey", lang: "en" | "fr" = "en") {
  await i18n.changeLanguage(lang);
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
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  flags.online = true;
});

describe("places page and the elevator notices of the stored pack", () => {
  it("shows the saved notices, online or offline", async () => {
    for (const online of [true, false]) {
      flags.online = online;
      getPack.mockResolvedValue({ pack_id: "toronto", content });
      await page("places");
      await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Saved elevator notices" })).toBeTruthy());
      expect(document.querySelectorAll("[data-elevator-notices] [data-station]")).toHaveLength(content.elevator_status.length);
      cleanup();
    }
  });
  it("shows them in French", async () => {
    getPack.mockResolvedValue({ pack_id: "toronto", content });
    await page("places", "fr");
    await waitFor(() => expect(screen.getByRole("heading", { level: 2, name: "Avis d’ascenseur enregistrés" })).toBeTruthy());
  });
  it("shows nothing when no pack is stored", async () => {
    getPack.mockResolvedValue(null);
    await page("places");
    await waitFor(() => expect(getPack).toHaveBeenCalled());
    expect(document.querySelector("[data-elevator-notices]")).toBeNull();
  });
  it("shows nothing when the pack has no elevator records", async () => {
    getPack.mockResolvedValue({ pack_id: "toronto", content: { places: content.places, elevator_status: [] } });
    await page("places");
    await waitFor(() => expect(document.querySelectorAll(".pack-place").length).toBeGreaterThan(0));
    expect(document.querySelector("[data-elevator-notices]")).toBeNull();
  });
  it("shows nothing when the pack lacks the elevator list", async () => {
    getPack.mockResolvedValue({ pack_id: "toronto", content: { places: content.places } });
    await page("places");
    await waitFor(() => expect(document.querySelectorAll(".pack-place").length).toBeGreaterThan(0));
    expect(document.querySelector("[data-elevator-notices]")).toBeNull();
  });
  it("shows nothing when the pack cannot be read", async () => {
    getPack.mockRejectedValue(new Error("no storage"));
    await page("places");
    await waitFor(() => expect(getPack).toHaveBeenCalled());
    expect(document.querySelector("[data-elevator-notices]")).toBeNull();
  });
  it("is not on the finders or the journey page", async () => {
    getPack.mockResolvedValue({ pack_id: "toronto", content });
    for (const id of ["finders", "journey"] as const) {
      await page(id);
      await waitFor(() => expect(screen.queryAllByRole("heading").length).toBeGreaterThan(0));
      expect(document.querySelector("[data-elevator-notices]")).toBeNull();
      cleanup();
    }
  });
});
