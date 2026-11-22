/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, east: number, extra: Record<string, unknown> = {}) => ({ id, name, wheelchair: "yes", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38 + east / 80_500, provenance: prov, ...extra });

afterEach(cleanup);

function show(places: unknown[], locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-21" />
    </MemoryRouter>,
  );
}
const toggleName = (l: Locale) => (l === "en" ? "Group the places that are close together" : "Regrouper les lieux rapprochés");

describe("the places-close-together section on the places list", () => {
  it("is on the page, closed, when two places have a map point", () => {
    show([rec("a", "Alpha Hall", 0), rec("b", "Beta Court", 50)]);
    expect(screen.getByRole("button", { name: toggleName("en") }).getAttribute("aria-expanded")).toBe("false");
  });
  it("is not on the page when fewer than two places have a map point", () => {
    show([rec("a", "Alpha Hall", 0), rec("b", "Beta Court", 50, { lat: null, lon: null })]);
    expect(screen.queryByRole("button", { name: toggleName("en") })).toBeNull();
  });
  it("groups two places that are close together", () => {
    show([rec("a", "Alpha Hall", 0), rec("b", "Beta Court", 50), rec("c", "Far Place", 9000, { address: "5 Oak Avenue" })]);
    fireEvent.click(screen.getByRole("button", { name: toggleName("en") }));
    expect(screen.getByText(/^1 group holding 2 places/)).toBeTruthy();
    expect(document.querySelector("[data-walk-groups-list]")!.textContent).toContain("Alpha Hall");
  });
  it("follows a search that narrows the list", () => {
    show([rec("a", "Alpha Hall", 0), rec("b", "Beta Court", 50), rec("c", "Gamma Gate", 70), rec("d", "Delta Door", 90)]);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "Gamma" } });
    expect(screen.queryByRole("button", { name: toggleName("en") })).toBeNull();
  });
  it("is in French on the French page", () => {
    show([rec("a", "Alpha Hall", 0), rec("b", "Beta Court", 50)], "fr");
    fireEvent.click(screen.getByRole("button", { name: toggleName("fr") }));
    expect(screen.getByText(/^1 groupe de 2 lieux/)).toBeTruthy();
  });
});
