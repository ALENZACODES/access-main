/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, name, wheelchair: "yes", category: "attraction", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov, ...over });
const small = [
  rec("a", "Alpha Hall", { lat: 43.7, lon: -79.4 }),
  rec("b", "Beta Court", { wheelchair: "no", lat: 43.6, lon: -79.3 }),
  rec("c", "Gamma Gate", { lat: null, lon: null }),
];
const real = (JSON.parse(contentText) as { places: unknown[] }).places;
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-20" />
    </MemoryRouter>,
  );
}
const toggle = () => screen.getByRole("button", { name: "Show a text map of these places" });
const mapRoot = () => document.querySelector("[data-text-map]") as HTMLElement;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("text map on the places list", () => {
  it("is offered, closed, when there are places", () => {
    show(small);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });
  it("is not offered when no place is listed", () => {
    show([]);
    expect(screen.queryByRole("button", { name: "Show a text map of these places" })).toBeNull();
  });
  it("counts the places shown, with the one that has no map point set aside", () => {
    show(small);
    fireEvent.click(toggle());
    expect(within(mapRoot()).getByText("2 places in a 3 by 3 grid. 1 place has no map point: its position is UNKNOWN.")).toBeTruthy();
  });
  it("follows the tag filter: only the places that pass it are in the grid", () => {
    show(small);
    fireEvent.click(toggle());
    expect(within(mapRoot()).getAllByRole("heading", { level: 3 })).toHaveLength(2);
    fireEvent.click(screen.getByRole("radio", { name: /^No\b/ }));
    expect(within(mapRoot()).getAllByRole("heading", { level: 3 })).toHaveLength(1);
    // With one place left there is no range to divide, so the grid is cut again from that place alone.
    expect(within(mapRoot()).getByRole("heading", { name: "North, West" })).toBeTruthy();
  });
  it("asks for a point before giving directions, and gives them once one is typed", () => {
    show(small);
    fireEvent.click(toggle());
    expect(within(mapRoot()).getByText(/type a point in the distance fields above/i)).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/latitude/i), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText(/longitude/i), { target: { value: "-79.38" } });
    fireEvent.click(within(mapRoot()).getByRole("radio", { name: "Which way from my point" }));
    expect(within(mapRoot()).getByText(/^Alpha Hall: .* to the north\.$/)).toBeTruthy();
  });
  it("works with the real pack and stores nothing", () => {
    show(real);
    fireEvent.click(toggle());
    expect(within(mapRoot()).getAllByRole("cell")).toHaveLength(9);
    expect(localStorage.length).toBe(0);
  });
  it("is in French when the page is", () => {
    show(small, "fr");
    fireEvent.click(screen.getByRole("button", { name: "Afficher une carte en texte de ces lieux" }));
    expect(within(mapRoot()).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Nord", "Milieu", "Sud"]);
  });
  it("has no axe violations with the grid open", async () => {
    const { container } = show(small);
    fireEvent.click(toggle());
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});
