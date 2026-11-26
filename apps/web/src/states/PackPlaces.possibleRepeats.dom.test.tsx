/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, address: string, lat = 43.65) => ({ id, name, wheelchair: "yes", category: "cafe", address, lat, lon: -79.38, provenance: prov });

afterEach(cleanup);

function show(places: unknown[], locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-21" />
    </MemoryRouter>,
  );
}
const toggle = (l: Locale) => (l === "en" ? "Look for places listed more than once" : "Chercher les lieux listés plus d’une fois");

describe("possible repeats on the places list", () => {
  it("is on the page, closed, when there are two places", () => {
    show([rec("a", "Alpha Hall", "5 Elm Street"), rec("b", "Beta Court", "7 Oak Avenue", 43.7)]);
    expect(screen.getByRole("button", { name: toggle("en") }).getAttribute("aria-expanded")).toBe("false");
  });
  it("is not on the page for one place", () => {
    show([rec("a", "Alpha Hall", "5 Elm Street")]);
    expect(screen.queryByRole("button", { name: toggle("en") })).toBeNull();
  });
  it("finds a place listed twice", () => {
    show([rec("a", "Alpha Hall", "5 Elm Street"), rec("b", "Alpha Hall", "5 Elm St"), rec("c", "Zed Pharmacy", "9 Far Road", 44.2)]);
    fireEvent.click(screen.getByRole("button", { name: toggle("en") }));
    expect(screen.getByText("1 group of places that look alike, 2 places in all.")).toBeTruthy();
  });
  it("compares all the places of the pack, not only the ones a search leaves on screen", () => {
    show([rec("a", "Alpha Hall", "5 Elm Street"), rec("b", "Alpha Hall", "5 Elm St"), rec("c", "Zed Pharmacy", "9 Far Road", 44.2)]);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "Zed" } });
    fireEvent.click(screen.getByRole("button", { name: toggle("en") }));
    expect(screen.getByText("1 group of places that look alike, 2 places in all.")).toBeTruthy();
  });
  it("is in French on the French page", () => {
    show([rec("a", "Alpha Hall", "5 rue Principale"), rec("b", "Alpha Hall", "5 rue Principale")], "fr");
    fireEvent.click(screen.getByRole("button", { name: toggle("fr") }));
    expect(screen.getByText("1 groupe de lieux qui se ressemblent, 2 lieux en tout.")).toBeTruthy();
  });
});
