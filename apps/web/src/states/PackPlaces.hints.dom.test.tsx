/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: unknown, wheelchair: string) => ({
  id, name, wheelchair, category: "attraction", address: "1 Main Street", wheelchair_description: "UNKNOWN", lat: 43.65, lon: -79.38, provenance: prov,
});
const places = [
  rec("a", "Union Station", "yes"),
  rec("b", "Café du Coin", "no"),
  rec("c", "Unity Hall", "UNKNOWN"),
  rec("d", null, "yes"),
];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

function show(locale: Locale = "en", data: unknown = places) {
  document.documentElement.lang = locale;
  return render(<MemoryRouter><PackPlaces places={data} locale={locale} today="2026-11-15" /></MemoryRouter>);
}
const type = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
const titles = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);

afterEach(cleanup);

describe("did-you-mean hints under an empty pack search", () => {
  it("offers a close name when a typed search finds nothing, and choosing it lists that place", () => {
    show();
    type("Search by name, address or kind", "unoin station");
    expect(titles()).toEqual([]);
    expect(screen.getByRole("heading", { name: /No places/i })).toBeTruthy();
    expect(screen.getByText("Did you mean one of these?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search for Union Station" }));
    expect((screen.getByLabelText("Search by name, address or kind") as HTMLInputElement).value).toBe("Union Station");
    expect(titles()).toEqual(["Union Station"]);
    expect(screen.queryByText("Did you mean one of these?")).toBeNull();
  });
  it("matches without accents", () => {
    show();
    type("Search by name, address or kind", "cafee du coin");
    expect(screen.getByRole("button", { name: "Search for Café du Coin" })).toBeTruthy();
  });
  it("shows no hints before anything is typed, or when something matches", () => {
    show();
    expect(screen.queryByText("Did you mean one of these?")).toBeNull();
    type("Search by name, address or kind", "union");
    expect(titles().length).toBeGreaterThan(0);
    expect(screen.queryByText("Did you mean one of these?")).toBeNull();
  });
  it("shows no hints when no name is close, and the empty state still has Clear the search", () => {
    show();
    type("Search by name, address or kind", "zzzqqq");
    expect(screen.queryByText("Did you mean one of these?")).toBeNull();
    expect(screen.getByRole("button", { name: "Clear the search" })).toBeTruthy();
  });
  it("only offers names the current tag filter allows", () => {
    show();
    fireEvent.click(screen.getByRole("radio", { name: "No (1)" }));
    type("Search by name, address or kind", "unoin station");
    expect(screen.queryByRole("button", { name: "Search for Union Station" })).toBeNull();
  });
  it("never offers a place that has no name", () => {
    show("en", [rec("n", null, "yes")]);
    type("Search by name, address or kind", "anything");
    expect(screen.queryByText("Did you mean one of these?")).toBeNull();
  });
  it("speaks French", () => {
    show("fr");
    type("Rechercher par nom, adresse ou type", "unoin station");
    expect(screen.getByText(/Vouliez-vous dire/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chercher Union Station" })).toBeTruthy();
  });
  it("has no accessibility violations with hints showing", async () => {
    const { container } = show();
    type("Search by name, address or kind", "unoin station");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});
