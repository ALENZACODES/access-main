/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { buildMeetUp } from "./meetUp";
import { PackPlaces } from "./PackPlaces.tsx";
import { parsePackPlaces } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const realPlaces = (JSON.parse(contentText) as { places: unknown[] }).places;
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, lon: number | null) => ({ id, name, wheelchair, category: "attraction", address: "1 Main Street", ...(lon === null ? {} : { lat: 43.65, lon }), provenance: prov });
const small = [rec("a", "Alpha Hall", "yes", -79.395), rec("b", "Beta Court", "no", -79.37), rec("c", "Gamma Gate", "UNKNOWN", -79.38), rec("n", "No Point Place", "limited", null)];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-19" />
    </MemoryRouter>,
  );
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "Show places for two people to meet" }));
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const two = () => {
  type("First point latitude", "43.65");
  type("First point longitude", "-79.4");
  type("Second point latitude", "43.65");
  type("Second point longitude", "-79.36");
};
const rows = () => within(screen.getByRole("table", { name: /Showing \d+ of \d+ places/ })).getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);

afterEach(cleanup);

describe("the meet-up tool on the places list", () => {
  it("is closed to begin with and adds no heading and no table to the page", () => {
    show(small);
    expect(screen.getByRole("button", { name: "Show places for two people to meet" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("First point latitude")).toBeNull();
    expect(screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate", "No Point Place"]);
  });
  it("lists the places on screen by distance from two points", () => {
    show(small);
    open();
    two();
    expect(rows()).toEqual(["Gamma Gate", "Beta Court", "Alpha Hall"]);
    expect(document.querySelector("[data-meet-up-count]")!.textContent).toContain("1 with no map point");
  });
  it("goes away when fewer than two places are on screen, and comes back with the points still typed", () => {
    show(small);
    open();
    two();
    const box = screen.getByLabelText("Search by name, address or kind");
    fireEvent.change(box, { target: { value: "beta" } });
    expect(screen.queryByRole("region", { name: "Places for two people to meet" })).toBeNull();
    fireEvent.change(box, { target: { value: "" } });
    expect((screen.getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65");
    expect(rows()).toHaveLength(3);
  });
  it("lists only the places that pass the filters", () => {
    show(small);
    open();
    two();
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "a" } });
    const shown = rows();
    expect(shown.length).toBeLessThanOrEqual(3);
    for (const n of shown) expect(["Alpha Hall", "Beta Court", "Gamma Gate"]).toContain(n);
  });
  it("offers the near-me point as the first point once one is typed", () => {
    show(small);
    open();
    expect(screen.queryByRole("button", { name: "Use the point typed above" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-79.4" } });
    fireEvent.click(screen.getByRole("button", { name: "Use the point typed above" }));
    expect((screen.getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65000");
  });
  it("is in French on the French page", () => {
    show(small, "fr");
    fireEvent.click(screen.getByRole("button", { name: "Afficher les lieux de rencontre pour deux personnes" }));
    expect(screen.getByLabelText("Latitude du premier point")).toBeTruthy();
  });
  it("has no axe violations with the tool open and a list showing", async () => {
    show(small);
    open();
    two();
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});

describe("the meet-up tool on the shipped pack", () => {
  const parsed = parsePackPlaces(realPlaces);
  it("measures every placed place of the pack from two points and sets the rest aside", () => {
    const r = buildMeetUp(parsed.places, { lat: 43.65, lon: -79.4 }, { lat: 43.7, lon: -79.35 });
    expect(r.rows.length + r.unlocatedIds.length).toBe(parsed.places.length);
    expect(r.rows.length).toBeGreaterThan(0);
    for (const row of r.rows) {
      expect(Number.isInteger(row.metresA)).toBe(true);
      expect(row.total).toBe(row.metresA + row.metresB);
    }
  });
  it("renders the list from the shipped pack without a violation", async () => {
    show(realPlaces);
    open();
    two();
    expect(rows().length).toBeGreaterThan(0);
    expect(rows().length).toBeLessThanOrEqual(10);
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});
