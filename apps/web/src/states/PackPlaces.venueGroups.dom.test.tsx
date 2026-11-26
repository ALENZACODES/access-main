/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, lat: number) => ({ id, name, wheelchair, category: "attraction", address: "1 Main Street", lat, lon: -79.38, provenance: prov });
const small = [rec("a", "Alpha Hall", "yes", 43.65), rec("b", "Alpha Hall Entrance", "no", 43.6505), rec("c", "Gamma Gate", "UNKNOWN", 43.7)];
const realPlaces = (JSON.parse(contentText) as { places: unknown[] }).places;

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-15" />
    </MemoryRouter>,
  );
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const toggle = (locale: Locale = "en") => screen.getByRole("button", { name: locale === "en" ? "Show these places grouped into venues" : "Afficher ces lieux regroupés par lieu" });
const panel = () => document.querySelector<HTMLElement>("[data-venue-groups]")!;

describe("PackPlaces cards for places that are parts of a venue", () => {
  it("tells the card of each part about the other parts, without saying the tags carry over", () => {
    show(small);
    const card = screen.getByRole("heading", { level: 3, name: "Alpha Hall" }).closest("li")!;
    expect(within(card).getByText("In the pack with 1 other part of Alpha Hall (entrance No). Each part has its own wheelchair tag.")).toBeTruthy();
    const other = screen.getByRole("heading", { level: 3, name: "Alpha Hall Entrance" }).closest("li")!;
    expect(within(other).getByText(/In the pack with 1 other part of Alpha Hall \(main place Yes\)/)).toBeTruthy();
  });
  it("has no venue note on the card of a place that is not part of a venue", () => {
    show(small);
    const card = screen.getByRole("heading", { level: 3, name: "Gamma Gate" }).closest("li")!;
    expect(within(card).queryByText(/In the pack with/)).toBeNull();
  });
  it("still shows the note when a filter hides the other parts", () => {
    show(small);
    fireEvent.click(screen.getByRole("radio", { name: /^No/ }));
    const card = screen.getByRole("heading", { level: 3, name: "Alpha Hall Entrance" }).closest("li")!;
    expect(within(card).getByText(/In the pack with 1 other part of Alpha Hall/)).toBeTruthy();
  });
  it("is in French", () => {
    show(small, "fr");
    expect(screen.getAllByText(/Dans le pack avec 1 autre partie de Alpha Hall/).length).toBe(2);
  });
});

describe("PackPlaces with venue groups", () => {
  it("offers the venue view on the page for the shown places", () => {
    show(small);
    fireEvent.click(toggle());
    expect(screen.getByText("2 of 3 places fall into 1 venue by name.")).toBeTruthy();
    expect(within(panel()).getByRole("heading", { level: 3, name: "Alpha Hall: 2 parts" })).toBeTruthy();
  });
  it("follows the filters: only the places shown are grouped", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("radio", { name: /^No/ }));
    expect(screen.queryByRole("button", { name: "Hide venues by name" })).toBeNull();
  });
  it("is not offered when the search finds one place only", () => {
    show(small);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "Gamma" } });
    expect(screen.queryByRole("button", { name: "Show these places grouped into venues" })).toBeNull();
  });
  it("writes nothing to this device", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("checkbox", { name: /different wheelchair tags/ }));
    expect(localStorage.length).toBe(0);
  });
  it("groups the shipped Sankofa Square places by name and gives each part's tag as the pack states it", () => {
    show(realPlaces);
    fireEvent.click(toggle());
    const heading = within(panel()).getAllByRole("heading", { level: 3 }).find((h) => h.textContent?.startsWith("Sankofa Square"));
    expect(heading).toBeTruthy();
    const table = within(panel()).getByRole("table", { name: /Parts of Sankofa Square/ });
    const rowheads = within(table).getAllByRole("rowheader").map((h) => h.textContent);
    expect(rowheads).toContain("Main place");
    expect(rowheads).toContain("Entrance");
    expect(rowheads).toContain("Elevator");
    const entranceRow = within(table).getByRole("row", { name: /^Entrance/ });
    expect(entranceRow.textContent).toContain("No");
  });
  it("keeps the two places named Jack Astor's apart if they are not near each other, never merging them silently", () => {
    show(realPlaces);
    fireEvent.click(toggle());
    const text = panel().textContent ?? "";
    expect(text.includes("Jack Astor's") || text.includes("Jack Astor’s") || !/Jack Astor/.test(text) || /Jack Astor.{0,3}s: \d+ parts/.test(text)).toBe(true);
  });
  it("works with the shipped pack in French", () => {
    show(realPlaces, "fr");
    fireEvent.click(toggle("fr"));
    expect(panel().textContent).not.toMatch(/INCONN/i);
    expect(within(panel()).getAllByRole("rowheader").map((h) => h.textContent)).toContain("Lieu principal");
  });
});
