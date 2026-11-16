/** @vitest-environment jsdom */
import "fake-indexeddb/auto";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, useRoutes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";
import { hubText } from "./i18n.ts";
import { hubRoutes } from "./routes.tsx";
import { ROUTE_REPORTS_KEY, readDeviceReports } from "./RouteReportsPage.tsx";

/**
 * The More routes added for the packages merged on 16 November. Each one is rendered through the real
 * route table, in English and in French, with the real package code from .lanes (npm test syncs it first).
 */
const consent = vi.hoisted(() => ({ status: "denied" as "granted" | "denied" | "unavailable" }));
vi.mock("../features/consent.ts", () => ({ consentStatus: async () => consent.status }));

const i18n = initI18n();

function Table() {
  return useRoutes([{ path: "/more/*", children: hubRoutes }]);
}

async function open(lang: "en" | "fr", path: string) {
  await i18n.changeLanguage(lang);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={[path]}><Table /></MemoryRouter>
    </I18nextProvider>,
  );
}

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
afterEach(() => {
  cleanup();
  localStorage.clear();
  consent.status = "denied";
});

type Key = keyof typeof hubText.en.hub;
/** Path under /more, the catalogue key of its title, and an element only the mounted package renders. */
const NEW_ROUTES: Array<{ path: string; key: Key; mark: string }> = [
  { path: "games", key: "games", mark: "#daily-title" },
  { path: "route-reports", key: "routeReports", mark: "#route-reports-heading" },
  { path: "accessible-taxis", key: "wav", mark: "#wav-finder-heading" },
  { path: "event-organiser", key: "eventOrganiser", mark: "#org-title" },
  { path: "event-plan", key: "eventPlan", mark: "#ep-start" },
  { path: "reports", key: "reports", mark: "#reports-heading" },
];

describe("new More routes mount their package in both languages", () => {
  for (const route of NEW_ROUTES) {
    it(`/more/${route.path}`, async () => {
      const seen: Record<string, string> = {};
      for (const lang of ["en", "fr"] as const) {
        const { container } = await open(lang, `/more/${route.path}`);
        const title = hubText[lang].hub[route.key];
        expect((await screen.findByRole("heading", { level: 1 }, { timeout: 15000 })).textContent).toBe(title);
        await waitFor(() => expect(container.querySelector(route.mark)).not.toBeNull(), { timeout: 15000 });
        // The shell owns the only level-1 heading and the only main landmark.
        expect(container.querySelectorAll("h1")).toHaveLength(1);
        expect(container.querySelector("main")).toBeNull();
        expect(screen.getByRole("link", { name: hubText[lang].hub.back })).toBeTruthy();
        seen[lang] = container.querySelector(route.mark)?.textContent ?? "";
        expect(seen[lang].trim()).not.toBe("");
        cleanup();
      }
      // The package's own text follows the shell language.
      expect(seen.fr).not.toBe(seen.en);
    }, 60000);
  }
});

describe("More index", () => {
  it("links to every route in the table, with a title and a description in both languages", async () => {
    const paths = hubRoutes.flatMap((route) => (typeof route.path === "string" ? [route.path] : []));
    expect(paths).toEqual(expect.arrayContaining(NEW_ROUTES.map((route) => route.path)));
    for (const lang of ["en", "fr"] as const) {
      const { container } = await open(lang, "/more");
      await screen.findByRole("heading", { level: 1, name: hubText[lang].hub.title });
      const hrefs = [...container.querySelectorAll("a[href^='/more/']")].map((link) => link.getAttribute("href"));
      expect(hrefs.sort()).toEqual(paths.map((path) => `/more/${path}`).sort());
      for (const route of NEW_ROUTES) {
        const link = container.querySelector(`a[href='/more/${route.path}']`);
        expect(link?.textContent).toContain(hubText[lang].hub[route.key]);
        expect(link?.textContent).toContain(hubText[lang].hub[`${route.key}Description` as Key]);
      }
      cleanup();
    }
  });
});

describe("games", () => {
  it("offers the 25 games of the pinned package and the dwell setting", async () => {
    const { container } = await open("en", "/more/games");
    await waitFor(() => expect(container.querySelectorAll("button[id^='play-']").length).toBeGreaterThan(0), { timeout: 15000 });
    const { GAME_LIBRARY } = await import("@hub/games");
    expect(GAME_LIBRARY).toHaveLength(25);
    const offered = new Set([...container.querySelectorAll("button[id^='play-']")].map((button) => button.id));
    for (const game of GAME_LIBRARY) expect(offered.has(`play-${game.id}`), game.id).toBe(true);
    expect(container.querySelector("#dwell-enabled, [id*='dwell']")).not.toBeNull();
    expect(screen.getByText(hubText.en.hub.gamesNote)).toBeTruthy();
  }, 60000);
});

describe("accessible taxis", () => {
  it("shows no service and says that an unlisted place is unknown, because the published list is empty", async () => {
    const dataset = (await import("@hub/wav-dataset")).default;
    expect(dataset.records).toEqual([]);
    const { container } = await open("en", "/more/accessible-taxis");
    await waitFor(() => expect(container.querySelector("#wav-finder-heading")).not.toBeNull(), { timeout: 15000 });
    expect(screen.getByText(hubText.en.hub.wavEmpty)).toBeTruthy();
    expect(screen.getByText(hubText.en.hub.wavNote)).toBeTruthy();
    expect(container.querySelectorAll("h3")).toHaveLength(0);
  }, 60000);
});

describe("route condition reports", () => {
  it("shows no report form until a place in the data is given, and never a stored item that fails the package check", async () => {
    localStorage.setItem(ROUTE_REPORTS_KEY, JSON.stringify([{ id: "not-a-report" }, "text"]));
    expect(readDeviceReports(localStorage)).toEqual([]);
    expect(readDeviceReports({ getItem: () => "{broken" })).toEqual([]);
    expect(readDeviceReports(null)).toEqual([]);
    const { container } = await open("en", "/more/route-reports");
    await waitFor(() => expect(container.querySelector("#route-reports-heading")).not.toBeNull(), { timeout: 15000 });
    expect(container.querySelector("#route-report-form-heading")).toBeNull();
    expect(screen.getByText(hubText.en.hub.routeReportsChoosePlace, { exact: false })).toBeTruthy();
    expect(screen.getByRole("link", { name: hubText.en.hub.routeReportsPlaces }).getAttribute("href")).toBe("/places");
    expect(container.querySelectorAll("#route-reports-heading ~ ul li")).toHaveLength(0);
  }, 60000);

  it("says so when the place is not in the data on this device", async () => {
    const { container } = await open("fr", "/more/route-reports?place=no-such-record");
    await waitFor(() => expect(container.querySelector("#route-reports-heading")).not.toBeNull(), { timeout: 15000 });
    await screen.findByText(hubText.fr.hub.routeReportsPlaceMissing, { exact: false }, { timeout: 15000 });
    expect(container.querySelector("#route-report-form-heading")).toBeNull();
  }, 60000);
});

describe("report tables", () => {
  it("labels the demonstration set and does not save files without permission", async () => {
    const created = vi.fn(() => "blob:test");
    Object.assign(URL, { createObjectURL: created, revokeObjectURL: vi.fn() });
    const { container } = await open("en", "/more/reports");
    await waitFor(() => expect(container.querySelector("#reports-heading")).not.toBeNull(), { timeout: 15000 });
    expect(screen.getByText(hubText.en.hub.demonstration)).toBeTruthy();
    expect(screen.getByText(hubText.en.hub.reportsNote)).toBeTruthy();
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) button.click();
    await screen.findByText(hubText.en.hub.reportsExportBlocked, { exact: false });
    expect(created).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: hubText.en.hub.reportsConsentLink }).getAttribute("href")).toBe("/settings/consent");
  }, 60000);
});
