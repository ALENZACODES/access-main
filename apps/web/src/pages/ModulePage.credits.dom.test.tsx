/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { initI18n } from "../i18n/index.ts";

/**
 * Wiring: the places page also credits the records of the pack stored on this device: source, licence, dates and tiers.
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

describe("data credits on the places page", () => {
  it("lists the pack's sources with licence, dates and tiers and the OpenStreetMap credit", async () => {
    getPack.mockResolvedValue({ id: "toronto", content });
    await page("places");
    expect(await screen.findByRole("heading", { level: 2, name: "Sources of the records saved on this device" })).toBeTruthy();
    // The pack list already carries the credit once; the credits do not repeat it.
    expect(screen.getAllByText("© OpenStreetMap contributors")).toHaveLength(1);
    expect(screen.getByRole("link", { name: "ODbL 1.0" }).getAttribute("href")).toBe("https://opendatacommons.org/licenses/odbl/1-0/");
    expect(screen.getByText(/^Tier 0: \d+/)).toBeTruthy();
  });
  it("shows how old the saved places are, above the credits", async () => {
    getPack.mockResolvedValue({ id: "toronto", content });
    await page("places");
    const fresh = await screen.findByRole("heading", { level: 2, name: "How old the saved places are" });
    const credits = screen.getByRole("heading", { level: 2, name: "Sources of the records saved on this device" });
    expect(fresh.compareDocumentPosition(credits) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("shows no freshness when no pack is stored", async () => {
    getPack.mockResolvedValue(null);
    await page("places");
    await waitFor(() => expect(getPack).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "How old the saved places are" })).toBeNull();
  });
  it("is in French", async () => {
    getPack.mockResolvedValue({ id: "toronto", content });
    await page("places", "fr");
    expect(await screen.findByRole("heading", { level: 2, name: "Sources des enregistrements sur cet appareil" })).toBeTruthy();
  });
  it("shows no credits when no pack is stored", async () => {
    getPack.mockResolvedValue(null);
    await page("places");
    await waitFor(() => expect(getPack).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Sources of the records saved on this device" })).toBeNull();
  });
  it("shows no credits when the pack holds no readable place", async () => {
    getPack.mockResolvedValue({ id: "x", content: { places: [null, 5, { id: "" }] } });
    await page("places");
    await waitFor(() => expect(getPack).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Sources of the records saved on this device" })).toBeNull();
  });
  it("is not shown on the other module pages", async () => {
    getPack.mockResolvedValue({ id: "toronto", content });
    await page("finders");
    await screen.findByRole("heading", { level: 1 });
    expect(screen.queryByRole("heading", { name: "Sources of the records saved on this device" })).toBeNull();
  });
});
