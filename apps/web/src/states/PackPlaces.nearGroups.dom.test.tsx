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
  rec("a", "Alpha Hall", { lat: 43.65, lon: -79.38 }),
  rec("b", "Beta Court", { wheelchair: "no", lat: 43.6504, lon: -79.38 }),
  rec("c", "Gamma Gate", { lat: 43.7, lon: -79.2 }),
  rec("d", "Delta Door", { lat: null, lon: null }),
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
const toggle = () => screen.getByRole("button", { name: "Show which of these places are close together" });
const root = () => document.querySelector("[data-near-groups]") as HTMLElement;

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("places close together on the places list", () => {
  it("is offered, closed, when two or more places are listed", () => {
    show(small);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });
  it("is not offered for one place or none", () => {
    show([small[0]]);
    expect(screen.queryByRole("button", { name: "Show which of these places are close together" })).toBeNull();
    cleanup();
    show([]);
    expect(root()).toBeNull();
  });
  it("groups the two places 44 m apart and sets the others aside", () => {
    show(small);
    fireEvent.click(toggle());
    expect(within(root()).getByText(/1 group with 2 places/)).toBeTruthy();
    expect(within(root()).getByRole("heading", { name: "Group 1" })).toBeTruthy();
    expect(within(root()).getByText("1 without a map point: UNKNOWN.")).toBeTruthy();
    expect(within(root()).getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate"]);
  });
  it("follows the tag filter: with only the 'no' place left there is nothing to group", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("radio", { name: /^No\b/ }));
    expect(screen.queryByRole("button", { name: "Hide places close together" })).toBeNull();
  });
  it("follows the search: the group goes when a name matches only one place", () => {
    show(small);
    fireEvent.click(toggle());
    expect(within(root()).queryByText(/No two places/)).toBeNull();
    fireEvent.change(screen.getByRole("textbox", { name: "Search by name, address or kind" }), { target: { value: "Alpha" } });
    expect(root()).toBeNull();
  });
  it("works with the shipped pack, stores nothing, and has no axe violations in both languages", async () => {
    for (const locale of ["en", "fr"] as const) {
      show(real, locale);
      const t = screen.getByRole("button", { name: locale === "en" ? "Show which of these places are close together" : "Afficher quels lieux sont proches les uns des autres" });
      fireEvent.click(t);
      expect(within(root()).getAllByRole("radio")).toHaveLength(6);
      expect((await axe.run(root(), axeRules)).violations).toEqual([]);
      cleanup();
    }
    expect(localStorage.length).toBe(0);
  });
});

describe("using a group's middle as the point for the distance fields", () => {
  const close = [rec("a", "Alpha Hall", { lat: 43.65, lon: -79.38 }), rec("b", "Beta Court", { lat: 43.6504, lon: -79.38 }), rec("c", "Gamma Gate", { lat: 43.7, lon: -79.2 })];
  it("fills the latitude and longitude fields", () => {
    show(close);
    fireEvent.click(toggle());
    fireEvent.click(within(root()).getByRole("button", { name: "Use the middle of Group 1 as my point" }));
    expect((screen.getByLabelText(/latitude/i) as HTMLInputElement).value).toBe("43.6502");
    expect((screen.getByLabelText(/longitude/i) as HTMLInputElement).value).toBe("-79.38");
  });
  it("then the places are listed with distances from that point", () => {
    show(close);
    fireEvent.click(toggle());
    fireEvent.click(within(root()).getByRole("button", { name: "Use the middle of Group 1 as my point" }));
    expect(screen.queryByText(/valid latitude/i)).toBeNull();
    expect(document.body.textContent).toMatch(/Alpha Hall/);
  });
  it("is offered in French", () => {
    show(close, "fr");
    fireEvent.click(screen.getByRole("button", { name: "Afficher quels lieux sont proches les uns des autres" }));
    expect(within(root()).getByRole("button", { name: "Utiliser le milieu du groupe 1 comme mon point" })).toBeTruthy();
  });
  it("can be switched to the nearest-place table on the shipped pack", () => {
    show(real);
    fireEvent.click(toggle());
    fireEvent.click(within(root()).getByRole("radio", { name: "The nearest place to each place" }));
    expect(within(root()).getAllByRole("row").length).toBe(real.length + 1);
  });
});
