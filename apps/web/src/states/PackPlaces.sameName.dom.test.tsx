/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces.tsx";
import { parsePackPlaces } from "./packPlaces.ts";
import { buildSameName } from "./sameName";
import type { Locale } from "./stateCopy.ts";

const realPlaces = (JSON.parse(contentText) as { places: unknown[] }).places;
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, lon: number) => ({ id, name, wheelchair, category: "cafe", address: `${id} Main Street`, lat: 43.65, lon, provenance: prov });
const small = [rec("a", "Corner Cafe", "yes", -79.395), rec("b", "Corner Cafe #2", "no", -79.37), rec("c", "Gamma Gate", "UNKNOWN", -79.38), rec("d", "Delta", "limited", -79.3)];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-21" />
    </MemoryRouter>,
  );
}
const open = () => fireEvent.click(screen.getByRole("button", { name: "Show places that share a name" }));

afterEach(cleanup);

describe("the shared-name tool on the places list", () => {
  it("is closed to begin with and adds no h3 or h4 to the page", () => {
    show(small);
    expect(screen.getByRole("button", { name: "Show places that share a name" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Corner Cafe", "Corner Cafe #2", "Delta", "Gamma Gate"]);
    expect(screen.queryAllByRole("heading", { level: 4 })).toEqual([]);
  });
  it("groups the places on screen by name once opened", () => {
    show(small);
    open();
    expect(screen.getByRole("heading", { level: 4, name: "Corner Cafe: 2 places" })).toBeTruthy();
    expect(screen.getByText(/The wheelchair tags differ: Yes 1, No 1\./)).toBeTruthy();
  });
  it("follows the search: with one place left the tool goes away, and comes back with its choices kept", () => {
    show(small);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    const box = screen.getByLabelText("Search by name, address or kind");
    fireEvent.change(box, { target: { value: "delta" } });
    expect(screen.queryByRole("region", { name: "Places that share a name" })).toBeNull();
    fireEvent.change(box, { target: { value: "" } });
    expect((screen.getByRole("radio", { name: "By name" }) as HTMLInputElement).checked).toBe(true);
  });
  it("shows distances once a point is typed in the near-me fields", () => {
    show(small);
    open();
    expect(screen.queryByText(/from the point typed/)).toBeNull();
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-79.4" } });
    expect(screen.getAllByText(/from the point typed/).length).toBeGreaterThan(0);
  });
  it("is in French on the French page", () => {
    show(small, "fr");
    fireEvent.click(screen.getByRole("button", { name: "Afficher les lieux qui portent le même nom" }));
    expect(screen.getByRole("heading", { level: 4, name: "Corner Cafe\u00a0: 2 lieux" })).toBeTruthy();
  });
  it("has no axe violations open", async () => {
    show(small);
    open();
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});

describe("the shipped pack", () => {
  const parsed = parsePackPlaces(realPlaces);
  it("groups without losing or double counting a place", () => {
    const r = buildSameName(parsed.places, null);
    expect(r.groups.reduce((n, g) => n + g.members.length, 0) + r.alone + r.unnamed).toBe(parsed.places.length);
    const ids = r.groups.flatMap((g) => g.members.map((m) => m.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("renders from the shipped pack without an axe violation", async () => {
    show(realPlaces);
    open();
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});
