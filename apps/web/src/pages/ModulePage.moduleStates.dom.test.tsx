/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";

/**
 * Remaining routes, round H: every module page shows a retry state when its list
 * fails to load (not only games), and navigator and games show an empty-list
 * state with wording that does not guess.
 */
const ready = (moduleId: string, items: unknown[] = []) => ({ moduleId, availability: "ready", items, messageKey: "modules.ready", asOf: null, liveStatus: "unavailable" });
const failed = (moduleId: string) => ({ moduleId, availability: "error", items: [], messageKey: "modules.error", asOf: null, liveStatus: "unavailable" });
const fns = { places: vi.fn(), journey: vi.fn(), finders: vi.fn(), navigator: vi.fn(), games: vi.fn() };
const flags = vi.hoisted(() => ({ online: true }));
const getPack = vi.fn();

vi.mock("../storage/repository.ts", () => ({ getPack: (...a: unknown[]) => getPack(...a) }));
vi.mock("../shell/useOnline.ts", () => ({ useOnline: () => flags.online }));
vi.mock("../profile/ProfileProvider.tsx", () => ({ useProfileState: () => ({ profile: null }) }));
vi.mock("../modules/linked.ts", () => ({
  getModules: () => ({
    places: { search: (...a: unknown[]) => fns.places(...a) },
    journey: { plan: (...a: unknown[]) => fns.journey(...a) },
    finders: { search: (...a: unknown[]) => fns.finders(...a) },
    navigator: { list: (...a: unknown[]) => fns.navigator(...a) },
    games: { list: (...a: unknown[]) => fns.games(...a) },
  }),
}));

const { ModulePage } = await import("./ModulePage.tsx");
const i18n = initI18n();
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
type Id = "places" | "journey" | "finders" | "navigator" | "games";

async function page(id: Id, lang: "en" | "fr" = "en") {
  await i18n.changeLanguage(lang);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><ModulePage id={id} /></MemoryRouter>
    </I18nextProvider>,
  );
}

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
beforeEach(() => {
  getPack.mockResolvedValue(null);
  for (const [id, fn] of Object.entries(fns)) fn.mockImplementation(async () => ready(id, [{ id: "x", name: "X" }]));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  flags.online = true;
});

describe("a list that fails to load shows a retry on every module page", () => {
  const modules: Array<[Id, string]> = [
    ["places", "module-load-failed"],
    ["journey", "module-load-failed"],
    ["finders", "module-load-failed"],
    ["navigator", "module-load-failed"],
    ["games", "game-load-failed"],
  ];
  for (const [id, kind] of modules) {
    it(`${id}: ${kind}, with Try again that loads it again`, async () => {
      fns[id].mockImplementationOnce(async () => failed(id));
      const { container } = await page(id);
      const title = kind === "game-load-failed" ? "This game did not load" : "This list could not be loaded";
      expect(await screen.findByRole("heading", { name: title })).toBeTruthy();
      expect(screen.getByRole("alert")).toBeTruthy();
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      const calls = fns[id].mock.calls.length;
      fireEvent.click(screen.getByRole("button", { name: "Try again" }));
      await waitFor(() => expect(fns[id].mock.calls.length).toBeGreaterThan(calls));
      await waitFor(() => expect(document.querySelector(".state-notice")).toBeNull());
    });
  }
  it("shows it in French, and a thrown error counts as a failed list", async () => {
    fns.navigator.mockImplementationOnce(async () => { throw new Error("chunk failed"); });
    await page("navigator", "fr");
    expect(await screen.findByRole("heading", { name: "Cette liste n’a pas pu être chargée" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Aller à l’accueil" }).getAttribute("href")).toBe("/");
  });
  it("keeps the offline-no-pack state for a search module that is offline with no pack", async () => {
    flags.online = false;
    fns.places.mockImplementation(async () => failed("places"));
    await page("places");
    expect(await screen.findByRole("heading", { name: "No connection and no offline pack" })).toBeTruthy();
  });
});

describe("navigator and games show an empty list without a search", () => {
  for (const id of ["navigator", "games"] as const) {
    it(`${id}: Nothing is listed here yet, as a polite status`, async () => {
      fns[id].mockImplementation(async () => ready(id));
      const { container } = await page(id);
      expect(await screen.findByRole("heading", { name: "Nothing is listed here yet" })).toBeTruthy();
      expect(document.querySelector(".state-notice")!.getAttribute("data-state-role")).toBe("status");
      expect(screen.getByText(/does not fill gaps with guesses/)).toBeTruthy();
      expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
  it("is in French", async () => {
    fns.games.mockImplementation(async () => ready("games"));
    await page("games", "fr");
    expect(await screen.findByRole("heading", { name: "Rien n’est encore répertorié ici" })).toBeTruthy();
  });
  it("shows nothing for a list that has items, or for a module that is not connected", async () => {
    await page("navigator");
    await screen.findByText("1 result");
    expect(document.querySelector(".state-notice")).toBeNull();
    cleanup();
    fns.games.mockImplementation(async () => ({ moduleId: "games", availability: "stub", items: [], messageKey: "modules.unavailable", asOf: null, liveStatus: "unavailable" }));
    await page("games");
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
    expect(document.querySelector(".state-notice")).toBeNull();
  });
});
