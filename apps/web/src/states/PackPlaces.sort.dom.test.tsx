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
  rec("a", "Alpha Hall", { category: "cafe", address: "20 Dundas Street East", wheelchair: "no" }),
  rec("b", "Beta Court", { category: "bar", address: "5 Dundas Street East" }),
  rec("c", "Gamma Gate", { category: "cafe", address: "7 Queen Street West", provenance: { ...prov, retrieved_at: "2026-01-02" } }),
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
const toggle = () => screen.getByRole("button", { name: "Change the order of the list" });
const root = () => document.querySelector("[data-pack-sort]") as HTMLElement;
/** The first radio with this name is the main order; a second group offers "Then by" with the same words. */
const order = (name: string) => within(root()).getAllByRole("radio", { name })[0]!;
const listNames = () => [...document.querySelectorAll(".record-list > li h3")].map((h) => h.textContent);

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("the order of the places list", () => {
  it("is offered, closed, when two or more places are listed", () => {
    show(small);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });
  it("is not offered for one place or none", () => {
    show([small[0]]);
    expect(screen.queryByRole("button", { name: "Change the order of the list" })).toBeNull();
    cleanup();
    show([]);
    expect(root()).toBeNull();
  });
  it("starts in name order, as the list always has", () => {
    show(small);
    expect(listNames()).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate"]);
  });
  it("reorders the list on the page when an order is chosen", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(order("Name, Z to A"));
    expect(listNames()).toEqual(["Gamma Gate", "Beta Court", "Alpha Hall"]);
    fireEvent.click(order("Street, then number"));
    expect(listNames()).toEqual(["Beta Court", "Alpha Hall", "Gamma Gate"]);
    fireEvent.click(order("Record retrieved, oldest first"));
    expect(listNames()[0]).toBe("Gamma Gate");
  });
  it("applies a second order chosen under Then by", () => {
    show([rec("a", "Alpha Hall", { category: "cafe", address: "20 Dundas Street East" }), rec("b", "Beta Court", { category: "cafe", address: "5 Dundas Street East" }), rec("c", "Gamma Gate", { category: "bar" })]);
    fireEvent.click(toggle());
    fireEvent.click(order("Kind of place"));
    expect(listNames()).toEqual(["Gamma Gate", "Alpha Hall", "Beta Court"]);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Then by" })).getByRole("radio", { name: "Street, then number" }));
    expect(listNames()).toEqual(["Gamma Gate", "Beta Court", "Alpha Hall"]);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Then by" })).getByRole("radio", { name: "No second order" }));
    expect(listNames()).toEqual(["Gamma Gate", "Alpha Hall", "Beta Court"]);
  });
  it("keeps the order while the tag filter changes", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(order("Name, Z to A"));
    fireEvent.click(screen.getByRole("radio", { name: /^Yes\b/ }));
    expect(listNames()).toEqual(["Gamma Gate", "Beta Court"]);
  });
  it("keeps the order while a search is typed", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(order("Name, Z to A"));
    fireEvent.change(screen.getByRole("textbox", { name: "Search by name, address or kind" }), { target: { value: "a" } });
    expect(listNames()).toEqual(["Gamma Gate", "Beta Court", "Alpha Hall"]);
  });
  it("the saved file lists the places as shown, after a filter", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(screen.getByRole("radio", { name: /^Yes\b/ }));
    expect(within(root()).getByRole("status").textContent).toBe("");
    fireEvent.click(order("Name, Z to A"));
    expect(within(root()).getByRole("status").textContent).toBe("Ordered by: Name, Z to A. 2 places.");
  });
  it("is offered in French and reorders", () => {
    show(small, "fr");
    fireEvent.click(screen.getByRole("button", { name: "Changer l’ordre de la liste" }));
    fireEvent.click(order("Nom, de Z à A"));
    expect(listNames()).toEqual(["Gamma Gate", "Beta Court", "Alpha Hall"]);
  });
  it("works with the shipped pack, stores nothing, and has no axe violations in both languages", async () => {
    for (const locale of ["en", "fr"] as const) {
      show(real, locale);
      fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Change the order of the list" : "Changer l’ordre de la liste" }));
      expect(within(root()).getAllByRole("radio")).toHaveLength(16);
      fireEvent.click(within(root()).getAllByRole("radio")[3]!);
      expect((await axe.run(root(), axeRules)).violations).toEqual([]);
      expect(listNames()).toHaveLength(real.length);
      cleanup();
    }
    expect(localStorage.length).toBe(0);
  });
});
