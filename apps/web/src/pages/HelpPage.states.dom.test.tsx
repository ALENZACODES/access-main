/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
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

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
beforeEach(() => {
  list.mockImplementation(async () => result("ready", [{ id: "h1", title: { en: "Using the App", fr: "Utiliser l’App" } }]));
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  flags.online = true;
});

describe("help page states", () => {
  it("shows no state before a search, even with an empty list", async () => {
    list.mockImplementation(async () => result("ready"));
    await page();
    await screen.findByText("0 results");
    expect(document.querySelector(".state-notice")).toBeNull();
  });
  it("shows the no-articles state after a search finds nothing, and Clear the search empties the field and searches again", async () => {
    list.mockImplementation(async (ctx: { query: string }) => result("ready", ctx.query === "" ? [{ id: "h1" }] : []));
    const { container } = await page();
    await ask("Text to look for", "Search", "zzqx");
    expect(await screen.findByRole("heading", { name: "No help articles match this search" })).toBeTruthy();
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    await waitFor(() => expect(document.querySelector(".state-notice")).toBeNull());
    expect((screen.getByLabelText("Text to look for") as HTMLInputElement).value).toBe("");
    expect(list).toHaveBeenLastCalledWith(expect.objectContaining({ query: "" }));
  });
  it("shows the same state in French", async () => {
    list.mockImplementation(async (ctx: { query: string }) => result("ready", ctx.query === "" ? [{ id: "h1" }] : []));
    await page("fr");
    await ask("Texte à chercher", "Rechercher", "zzqx");
    expect(await screen.findByRole("heading", { name: "Aucun article d’aide ne correspond à cette recherche" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Effacer la recherche" })).toBeTruthy();
  });
  it("shows a list failure as an alert with a Try again that loads the list again", async () => {
    list.mockImplementationOnce(async () => result("error"));
    const { container } = await page();
    expect(await screen.findByRole("heading", { name: "This list could not be loaded" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("could not be opened on this device");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() => expect(document.querySelector(".state-notice")).toBeNull());
    expect(list).toHaveBeenCalledTimes(2);
  });
  it("treats a thrown error like a failed list, not a blank page", async () => {
    list.mockImplementationOnce(async () => { throw new Error("chunk failed"); });
    await page();
    expect(await screen.findByRole("heading", { name: "This list could not be loaded" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
  });
  it("shows no state for a help module that is not connected", async () => {
    list.mockImplementation(async () => result("stub"));
    await page();
    await screen.findByText("0 results");
    expect(document.querySelector(".state-notice")).toBeNull();
  });
  it("ignores a late answer from a search that was replaced", async () => {
    let finish: (v: unknown) => void = () => undefined;
    list.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
    list.mockImplementation(async () => result("ready", [{ id: "h2" }]));
    const view = await page();
    view.unmount();
    finish(result("error"));
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.querySelector(".state-notice")).toBeNull();
  });
});
