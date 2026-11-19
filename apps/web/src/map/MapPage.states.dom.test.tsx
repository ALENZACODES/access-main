/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor, act } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";

/**
 * The map's load failure, online and offline. The map library is replaced by a
 * stand-in so the test can raise the library's own "error" event.
 */
const flags = vi.hoisted(() => ({ online: true }));
const handlers = vi.hoisted(() => ({ current: {} as Record<string, (event?: unknown) => void> }));

vi.mock("../shell/useOnline.ts", () => ({ useOnline: () => flags.online }));
vi.mock("maplibre-gl/dist/maplibre-gl.css", () => ({}));
vi.mock("./map.css", () => ({}));
vi.mock("maplibre-gl", () => {
  class FakeMap {
    dragPan = { isEnabled: () => false, enable: () => undefined };
    on(event: string, callback: (event?: unknown) => void) { handlers.current[event] = callback; }
    stop() {}
    getCanvas() { return document.createElement("canvas"); }
    isStyleLoaded() { return false; }
    remove() {}
  }
  return { default: undefined, Map: FakeMap, addProtocol: () => undefined, removeProtocol: () => undefined };
});
// The map is only drawn once the pack's tile list has been read; an empty list is enough to start it.
vi.mock("./tileCache.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./tileCache.ts")>()),
  readTileList: async () => ({ files: [], rejected: [] }),
}));
vi.mock("pmtiles", () => {
  class PMTiles { async getMetadata() { return { vector_layers: [] }; } }
  class Protocol { add() {} tile() {} }
  return { PMTiles, Protocol };
});

const { MapPage } = await import("./MapPage.tsx");
const i18n = initI18n();
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

async function page(lang: "en" | "fr" = "en") {
  await i18n.changeLanguage(lang);
  const view = render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><MapPage /></MemoryRouter>
    </I18nextProvider>,
  );
  await waitFor(() => expect(handlers.current.error).toBeTypeOf("function"));
  return view;
}
const raise = () => act(() => { handlers.current.error?.(); });

beforeAll(() => {
  // jsdom has no matchMedia; the page asks for the reduced-motion setting.
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
beforeEach(() => {
  handlers.current = {};
});
afterEach(() => {
  cleanup();
  flags.online = true;
});

describe("map load failure", () => {
  it("online: shows the list-failed alert with Try again, and no bare sentence", async () => {
    const { container } = await page();
    await raise();
    expect(await screen.findByRole("heading", { name: "This list could not be loaded" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("offline: keeps the no-connection-and-no-pack state", async () => {
    flags.online = false;
    await page();
    await raise();
    expect(await screen.findByRole("heading", { name: "No connection and no offline pack" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });
  it("Try again clears the failure, which the earlier retry never did", async () => {
    await page();
    await raise();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "This list could not be loaded" })).toBeNull());
  });
  it("shows the failure again if the map library raises another error", async () => {
    await page();
    await raise();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(document.querySelector(".state-notice")).toBeNull());
    await raise();
    expect(await screen.findByRole("heading", { name: "This list could not be loaded" })).toBeTruthy();
  });
  it("is in French", async () => {
    await page("fr");
    await raise();
    expect(await screen.findByRole("heading", { name: "Cette liste n’a pas pu être chargée" })).toBeTruthy();
  });
});
