/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";

/**
 * Round I: after the second failure in a row a module page adds a count and links
 * to Help, and offers the offline pack page only when offline with no pack.
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

describe("repeated failures on a module page", () => {
  it("adds a count and Open help after the second failure, and counts on", async () => {
    fns.navigator.mockImplementation(async () => failed("navigator"));
    await page("navigator");
    await screen.findByRole("heading", { name: "This list could not be loaded" });
    expect(screen.queryByRole("link", { name: "Open help" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("failed 2 times in a row"));
    expect(screen.getByRole("link", { name: "Open help" }).getAttribute("href")).toBe("/help");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("failed 3 times in a row"));
  });
  it("shows no count when a retry works", async () => {
    fns.games.mockImplementationOnce(async () => failed("games")).mockImplementation(async () => ready("games", [{ id: "g" }]));
    await page("games");
    await screen.findByRole("heading", { name: "This game did not load" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(document.querySelector(".state-notice")).toBeNull());
  });
  it("does not add anything to an empty state", async () => {
    fns.navigator.mockImplementation(async () => ready("navigator", []));
    await page("navigator");
    await waitFor(() => expect(document.querySelector(".state-notice")).not.toBeNull());
    expect(screen.queryByRole("link", { name: "Open help" })).toBeNull();
    expect(document.querySelector(".state-notice")?.textContent).not.toContain("times in a row");
  });
  it("offers the offline pack page when offline with no pack stored and a search keeps failing", async () => {
    flags.online = false;
    getPack.mockResolvedValue(null);
    fns.finders.mockImplementation(async () => failed("finders"));
    await page("finders");
    await screen.findByRole("heading", { name: "No connection and no offline pack" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("2 times in a row"));
    expect(screen.getAllByRole("link", { name: "Download an offline pack" })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Open help" })).toBeTruthy();
  });
  it("reads in French and has no accessibility violations", async () => {
    fns.navigator.mockImplementation(async () => failed("navigator"));
    const { container } = await page("navigator", "fr");
    await screen.findByRole("heading", { name: "Cette liste n’a pas pu être chargée" });
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("échoué 2 fois de suite"));
    expect(screen.getByRole("link", { name: "Ouvrir l’aide" })).toBeTruthy();
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});
