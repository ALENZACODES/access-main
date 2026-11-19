/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";

const list = vi.fn();
const flags = vi.hoisted(() => ({ online: true }));
vi.mock("../modules/stubs.ts", () => ({ modules: { help: { list: (...args: unknown[]) => list(...args) } } }));
vi.mock("../profile/ProfileProvider.tsx", () => ({ useProfileState: () => ({ profile: null }) }));
vi.mock("../shell/useOnline.ts", () => ({ useOnline: () => flags.online }));

const { HelpPage } = await import("./HelpPage.tsx");
const i18n = initI18n();
const result = (availability: "ready" | "stub" | "error", items: unknown[] = []) => ({
  moduleId: "help", availability, items, messageKey: "modules.ready", asOf: null, liveStatus: "unavailable",
});

async function page(lang: "en" | "fr" = "en") {
  await i18n.changeLanguage(lang);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><HelpPage /></MemoryRouter>
    </I18nextProvider>,
  );
}
async function ask(label: string, button: string, value: string) {
  fireEvent.change(await screen.findByLabelText(label), { target: { value } });
  await waitFor(() => expect((screen.getByRole("button", { name: button }) as HTMLButtonElement).disabled).toBe(false));
  fireEvent.submit(screen.getByRole("button", { name: button }).closest("form") as HTMLFormElement);
}
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const articles = [
  { id: "h1", title: "Using the App offline" },
  { id: "h2", title: "Choosing a language" },
];
const frArticles = [{ id: "h1", title: "Utiliser l’App hors ligne" }];

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  flags.online = true;
});

/** The list holds every article for an empty query and only exact title matches otherwise. */
function listing(all: typeof articles) {
  list.mockImplementation(async (ctx: { query: string }) =>
    result("ready", ctx.query === "" ? all : all.filter((a) => a.title === ctx.query)));
}

describe("help page: did you mean", () => {
  it("offers a close article title when a search finds nothing, and choosing it searches for it", async () => {
    listing(articles);
    await page();
    await ask("Text to look for", "Search", "languge");
    expect(await screen.findByRole("heading", { name: "No help articles match this search" })).toBeTruthy();
    const pick = await screen.findByRole("button", { name: "Search for Choosing a language" });
    fireEvent.click(pick);
    await waitFor(() => expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ query: "Choosing a language" })));
    expect((screen.getByLabelText("Text to look for") as HTMLInputElement).value).toBe("Choosing a language");
    await waitFor(() => expect(document.querySelector(".state-notice")).toBeNull());
    expect(screen.queryByText("Did you mean one of these?")).toBeNull();
  });
  it("offers nothing when no title is close", async () => {
    listing(articles);
    await page();
    await ask("Text to look for", "Search", "zzqx");
    await screen.findByRole("heading", { name: "No help articles match this search" });
    expect(screen.queryByText("Did you mean one of these?")).toBeNull();
  });
  it("does not offer hints before a search", async () => {
    listing(articles);
    await page();
    await screen.findByText("2 results");
    expect(screen.queryByText("Did you mean one of these?")).toBeNull();
  });
  it("reads the French title and speaks French", async () => {
    listing(frArticles as typeof articles);
    await page("fr");
    await ask("Texte à chercher", "Rechercher", "utilisr lapp hors ligne");
    expect(await screen.findByRole("button", { name: "Chercher Utiliser l’App hors ligne" })).toBeTruthy();
    expect(screen.getByText(/Vouliez-vous dire/)).toBeTruthy();
  });
  it("accepts a title given per language", async () => {
    list.mockImplementation(async (ctx: { query: string }) =>
      result("ready", ctx.query === "" ? [{ id: "h1", title: { en: "Using the App", fr: "Utiliser l’App" } }] : []));
    await page();
    await ask("Text to look for", "Search", "usng the app");
    expect(await screen.findByRole("button", { name: "Search for Using the App" })).toBeTruthy();
  });
  it("shows no hints if reading the full list fails", async () => {
    let blanks = 0;
    list.mockImplementation(async (ctx: { query: string }) => {
      // The first blank query is the page loading; the second is the read for hints.
      if (ctx.query === "") { blanks += 1; if (blanks > 1) throw new Error("failed"); return result("ready", articles); }
      return result("ready", []);
    });
    await page();
    await ask("Text to look for", "Search", "languge");
    await screen.findByRole("heading", { name: "No help articles match this search" });
    expect(screen.queryByText("Did you mean one of these?")).toBeNull();
  });
  it("has no accessibility violations with hints showing", async () => {
    listing(articles);
    const { container } = await page();
    await ask("Text to look for", "Search", "languge");
    await screen.findByRole("button", { name: "Search for Choosing a language" });
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});

describe("help page: repeated failures", () => {
  it("adds a count and Open help after the second failure in a row", async () => {
    list.mockImplementation(async () => result("error"));
    await page();
    await screen.findByRole("heading", { name: "This list could not be loaded" });
    expect(screen.queryByRole("link", { name: "Open help" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("failed 2 times in a row"));
    expect(screen.getByRole("link", { name: "Open help" }).getAttribute("href")).toBe("/help");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("failed 3 times in a row"));
  });
  it("starts counting again after a good result", async () => {
    list.mockImplementationOnce(async () => result("error")).mockImplementationOnce(async () => result("error")).mockImplementation(async () => result("ready", articles));
    await page();
    await screen.findByRole("heading", { name: "This list could not be loaded" });
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("2 times"));
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(document.querySelector(".state-notice")).toBeNull());
    list.mockImplementationOnce(async () => result("error"));
    await ask("Text to look for", "Search", "again");
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("could not be opened"));
    expect(screen.getByRole("alert").textContent).not.toContain("times in a row");
  });
  it("reads the count in French", async () => {
    list.mockImplementation(async () => result("error"));
    await page("fr");
    await screen.findByRole("heading", { name: "Cette liste n’a pas pu être chargée" });
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("échoué 2 fois de suite"));
    expect(screen.getByRole("link", { name: "Ouvrir l’aide" })).toBeTruthy();
  });
});
