/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { initI18n } from "../i18n/index.ts";

/**
 * Wiring: the places page shows the places from the pack stored on this device.
 * Storage and the modules are replaced so the test sees only this behaviour.
 */
const ready = (moduleId: string, items: unknown[] = []) => ({ moduleId, availability: "ready", items, messageKey: "modules.ready", asOf: null, liveStatus: "unavailable" });
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
const content = JSON.parse(contentText) as { places: unknown[] };

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

describe("places page with a stored pack", () => {
  it("lists every place in the stored pack, online or offline", async () => {
    for (const online of [true, false]) {
      flags.online = online;
      getPack.mockResolvedValue({ pack_id: "toronto", content });
      await page("places");
      await waitFor(() => expect(document.querySelectorAll(".pack-place h3")).toHaveLength(content.places.length));
      expect(screen.getByRole("heading", { level: 2, name: "Places saved on this device" })).toBeTruthy();
      cleanup();
    }
  });
  it("reads the pack named toronto", async () => {
    getPack.mockResolvedValue({ pack_id: "toronto", content });
    await page("places");
    await waitFor(() => expect(getPack).toHaveBeenCalledWith("toronto"));
  });
  it("is in French when the app is", async () => {
    getPack.mockResolvedValue({ pack_id: "toronto", content });
    await page("places", "fr");
    expect(await screen.findByRole("heading", { level: 2, name: "Lieux enregistrés sur cet appareil" })).toBeTruthy();
  });
  it("shows nothing extra when no pack is stored, or when reading it fails", async () => {
    getPack.mockResolvedValue(null);
    await page("places");
    await waitFor(() => expect(getPack).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { level: 2, name: "Places saved on this device" })).toBeNull();
    cleanup();
    getPack.mockRejectedValue(new Error("storage unavailable"));
    await page("places");
    await waitFor(() => expect(getPack).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { level: 2, name: "Places saved on this device" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
  it("shows a load problem for a stored pack that is damaged", async () => {
    getPack.mockResolvedValue({ pack_id: "toronto", content: { places: [{ id: "" }, 5] } });
    await page("places");
    expect(await screen.findByText("2 records in the pack could not be shown because they were incomplete.")).toBeTruthy();
  });
  it("does not read the pack, or show its places, on other module pages", async () => {
    getPack.mockResolvedValue({ pack_id: "toronto", content });
    await page("finders");
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(screen.queryByRole("heading", { level: 2, name: "Places saved on this device" })).toBeNull();
    expect(getPack).not.toHaveBeenCalled();
  });
});
