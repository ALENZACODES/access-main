/** @vitest-environment jsdom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";

/**
 * P4 wiring: the Day 22 states render on the live module page with a ready
 * module, and their next actions work. Modules are replaced so the states can
 * be reached whether or not the lane packages are pinned in this build.
 */

const ready = (moduleId: string, items: unknown[] = []) => ({ moduleId, availability: "ready", items, messageKey: "modules.ready", asOf: null, liveStatus: "unavailable" });
const gamesList = vi.fn();
const placesSearch = vi.fn();

vi.mock("../modules/linked.ts", () => ({
  getModules: () => ({
    places: { search: placesSearch },
    journey: { plan: async () => ready("journey") },
    finders: { search: async () => ready("finders") },
    navigator: { list: async () => ready("navigator") },
    games: { list: gamesList },
  }),
}));
vi.mock("../profile/ProfileProvider.tsx", () => ({ useProfileState: () => ({ profile: null }) }));

const { ModulePage } = await import("./ModulePage.tsx");
const i18n = initI18n();

async function view(lang: "en" | "fr", id: "places" | "journey" | "finders" | "games") {
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
  placesSearch.mockImplementation(async () => ready("places"));
  gamesList.mockImplementation(async () => ready("games", [{ id: "g1" }]));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function search(label: string, button: string, value: string) {
  fireEvent.change(await screen.findByLabelText(label), { target: { value } });
  await waitFor(() => expect((screen.getByRole("button", { name: button }) as HTMLButtonElement).disabled).toBe(false));
  await act(async () => { fireEvent.submit(screen.getByRole("button", { name: button }).closest("form") as HTMLFormElement); });
}

describe("Day 22 states on the module page", () => {
  it("no state before the person searches", async () => {
    await view("en", "places");
    await screen.findByText("0 results");
    expect(document.querySelector(".state-notice")).toBeNull();
  });

  it("place search with no results offers Clear the search, which empties the field", async () => {
    const { container } = await view("en", "places");
    await search("Search places by name", "Search", "zzqx");
    expect(await screen.findByRole("heading", { name: "No places match this search" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    await waitFor(() => expect(document.querySelector(".state-notice")).toBeNull());
    expect((screen.getByLabelText("Search places by name") as HTMLInputElement).value).toBe("");
    const results = await axe.run(container, { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } });
    expect(results.violations).toEqual([]);
  });

  it("finder with no results, in French", async () => {
    await view("fr", "finders");
    await search("Texte à chercher", "Rechercher", "zzqx");
    expect(await screen.findByRole("heading", { name: "Rien de ce type n’a été trouvé" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Effacer la recherche" })).toBeTruthy();
  });

  it("journey with no route moves focus to the start field on Change the trip", async () => {
    await view("en", "journey");
    fireEvent.change(await screen.findByLabelText("To"), { target: { value: "B" } });
    await search("From", "Plan this journey", "A");
    expect(await screen.findByRole("heading", { name: "No route found for this trip" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Change the trip" }));
    expect(document.activeElement).toBe(screen.getByLabelText("From"));
    expect(screen.getByRole("link", { name: "Open help" }).getAttribute("href")).toBe("/help");
  });

  it("game load failure is an alert with a working Try again", async () => {
    gamesList.mockImplementationOnce(async () => { throw new Error("chunk failed"); });
    await view("en", "games");
    expect(await screen.findByRole("heading", { name: "This game did not load" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Its files could not be opened on this device.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(document.querySelector(".state-notice")).toBeNull());
    expect(gamesList).toHaveBeenCalledTimes(2);
  });
});
