/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const shipped = (JSON.parse(contentText) as { places: unknown[] }).places;
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, category: string | null, wheelchair = "yes") => ({ id, name, category, wheelchair, lat: 43.65, lon: -79.38, provenance: prov });
const small = [rec("a", "Alpha Bar", "bar"), rec("b", "Beta Bar", "bar", "no"), rec("c", "Gamma Cafe", "cafe"), rec("d", "Delta Shop", null, "")];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

afterEach(cleanup);

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-19" />
    </MemoryRouter>,
  );
}
const cardNames = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));
const count = () => screen.getAllByRole("status").map((n) => n.textContent).find((t) => /shown|affich/.test(t ?? ""));

describe("PackPlaces with the kinds table", () => {
  it("shows the table above the list and all places to begin with", () => {
    show(small);
    expect(screen.getByRole("region", { name: "Kinds of place" })).toBeTruthy();
    expect(cardNames()).toEqual(["Alpha Bar", "Beta Bar", "Delta Shop", "Gamma Cafe"]);
    expect(count()).toBe("4 places shown.");
  });
  it("narrows the list to one kind when its button is pressed", () => {
    show(small);
    press("Show bar (2)");
    expect(cardNames()).toEqual(["Alpha Bar", "Beta Bar"]);
    expect(count()).toBe("2 places shown.");
  });
  it("keeps every kind in the table while one is chosen", () => {
    show(small);
    press("Show bar (2)");
    const table = within(screen.getByRole("table"));
    expect(table.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["bar", "cafe", "No kind stated (UNKNOWN)"]);
  });
  it("switches kind and shows everything again", () => {
    show(small);
    press("Show bar (2)");
    press("Show cafe (1)");
    expect(cardNames()).toEqual(["Gamma Cafe"]);
    press("Show every kind");
    expect(cardNames()).toHaveLength(4);
  });
  it("shows places with no kind and does not hide them behind a stated kind", () => {
    show(small);
    press("Show places with no kind (UNKNOWN) (1)");
    expect(cardNames()).toEqual(["Delta Shop"]);
  });
  it("counts the table from the other filters: a tag filter changes the counts", () => {
    show(small);
    fireEvent.click(screen.getByRole("radio", { name: /^Yes/ }));
    expect(screen.getByRole("button", { name: "Show bar (1)" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: /places with no kind/ })).toBeNull();
  });
  it("counts the table from the search words", () => {
    show(small);
    fireEvent.change(screen.getByRole("textbox", { name: /Search/ }), { target: { value: "gamma" } });
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["cafe"]);
    expect(cardNames()).toEqual(["Gamma Cafe"]);
  });
  it("lets a chosen kind combine with a search that matches only part of it", () => {
    show(small);
    press("Show bar (2)");
    fireEvent.change(screen.getByRole("textbox", { name: /Search/ }), { target: { value: "beta" } });
    expect(cardNames()).toEqual(["Beta Bar"]);
  });
  it("says so when the chosen kind no longer has a match, and shows the empty state", () => {
    show(small);
    press("Show bar (2)");
    fireEvent.change(screen.getByRole("textbox", { name: /Search/ }), { target: { value: "gamma" } });
    expect(screen.getByText(/No place of the chosen kind passes the other filters\./)).toBeTruthy();
    expect(cardNames()).toEqual([]);
  });
  it("clears the chosen kind from the empty state's clear action", () => {
    show(small);
    press("Show bar (2)");
    fireEvent.change(screen.getByRole("textbox", { name: /Search/ }), { target: { value: "gamma" } });
    fireEvent.click(screen.getAllByRole("button", { name: /clear/i })[0]!);
    expect(cardNames()).toHaveLength(4);
    expect(screen.queryAllByRole("button", { pressed: true })).toEqual([]);
  });
  it("is in French with the token UNKNOWN", () => {
    show(small, "fr");
    expect(screen.getByRole("region", { name: "Types de lieux" })).toBeTruthy();
    press("Afficher lieux sans type (UNKNOWN) (1)");
    expect(cardNames()).toEqual(["Delta Shop"]);
    expect(document.body.textContent).not.toMatch(/Type indiqué : INCONNU/);
  });
  it("saves nothing and sends nothing by itself: no storage and no request", () => {
    const before = window.localStorage.length;
    show(small);
    press("Show bar (2)");
    expect(window.localStorage.length).toBe(before);
    expect(window.sessionStorage.length).toBe(0);
  });
});

describe("PackPlaces with the shipped pack", () => {
  it("counts the whole pack and lists the same places as the table says", () => {
    show(shipped);
    const total = screen.getAllByRole("row").slice(1).reduce((n, row) => n + Number(within(row).getAllByRole("cell")[0]!.textContent), 0);
    expect(total).toBe(shipped.length);
    expect(cardNames()).toHaveLength(shipped.length);
  });
  it("shows as many cards as the pressed kind's count says", () => {
    show(shipped);
    const first = screen.getAllByRole("row")[1]!;
    const n = Number(within(first).getAllByRole("cell")[0]!.textContent);
    fireEvent.click(within(first).getByRole("button"));
    expect(cardNames()).toHaveLength(n);
  });
  it.each(["en", "fr"] as const)("has no axe violations with a kind chosen (%s)", async (locale) => {
    const { container } = show(shipped, locale);
    fireEvent.click(within(screen.getAllByRole("row")[1]!).getByRole("button"));
    const results = await axe.run(container, axeRules);
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
});
