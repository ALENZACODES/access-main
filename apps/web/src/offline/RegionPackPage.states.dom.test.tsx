/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";

/** The offline packs page: a list that cannot be read, and a list with nothing in it. */
const source = vi.hoisted(() => ({ manifest: vi.fn(), regions: vi.fn() }));
vi.mock("../../../../packages/data-client/src/index.ts", async (original) => ({
  ...(await original<typeof import("../../../../packages/data-client/src/index.ts")>()),
  createPackSource: () => source,
}));
vi.mock("../shell/useOnline.ts", () => ({ useOnline: () => true }));

const { OfflineRegionPage } = await import("./RegionPackPage.tsx");
const i18n = initI18n();
const manifest = { version: 1, builtAt: "2026-11-13T00:00:00Z", sourceCommit: "x", sources: [], regions: [], tranches: {}, search: {}, tiles: {}, counts: { records: 0, byTranche: {}, bySource: {} } };
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

async function page(lang: "en" | "fr" = "en") {
  await i18n.changeLanguage(lang);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><OfflineRegionPage /></MemoryRouter>
    </I18nextProvider>,
  );
}

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
beforeEach(() => {
  source.manifest.mockResolvedValue(manifest);
  source.regions.mockResolvedValue([]);
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("offline packs page: the list cannot be read", () => {
  it("shows the list-unavailable alert with Try again and Open help, not a bare sentence", async () => {
    source.manifest.mockRejectedValueOnce(new Error("manifest 500"));
    const { container } = await page();
    expect(await screen.findByRole("heading", { name: "The offline packs could not be listed" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Check the connection");
    expect(screen.getByRole("link", { name: "Open help" }).getAttribute("href")).toBe("/help");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("reads the list again on Try again, and then shows what it finds", async () => {
    source.manifest.mockRejectedValueOnce(new Error("manifest 500"));
    await page();
    fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
    await waitFor(() => expect(source.manifest).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(screen.queryByRole("heading", { name: "The offline packs could not be listed" })).toBeNull());
  });
  it("is in French", async () => {
    source.manifest.mockRejectedValueOnce(new Error("x"));
    await page("fr");
    expect(await screen.findByRole("heading", { name: "Les packs hors ligne n’ont pas pu être listés" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });
  it("does not show the empty-list state while the list could not be read", async () => {
    source.manifest.mockRejectedValue(new Error("x"));
    await page();
    await screen.findByRole("alert");
    expect(screen.queryByRole("heading", { name: "No offline packs are listed" })).toBeNull();
  });
});

describe("offline packs page: nothing to download", () => {
  it("says no packs are listed, as a polite status with a link to help", async () => {
    const { container } = await page();
    expect(await screen.findByRole("heading", { name: "No offline packs are listed" })).toBeTruthy();
    expect(document.querySelector(".state-notice")!.getAttribute("data-state-role")).toBe("status");
    expect(screen.getByRole("link", { name: "Open help" }).getAttribute("href")).toBe("/help");
    expect(screen.queryByRole("alert")).toBeNull();
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("is in French", async () => {
    await page("fr");
    expect(await screen.findByRole("heading", { name: "Aucun pack hors ligne n’est répertorié" })).toBeTruthy();
  });
  it("shows no empty state when a region is listed", async () => {
    source.regions.mockResolvedValue([{ id: "toronto", label: { en: "Toronto", fr: "Toronto" }, cells: [], bytes: 1024, downloaded: false, missingCells: [], builtAt: "2026-11-13", count: 0 }]);
    await page();
    await screen.findByRole("heading", { name: "Toronto" });
    expect(screen.queryByRole("heading", { name: "No offline packs are listed" })).toBeNull();
  });
});
