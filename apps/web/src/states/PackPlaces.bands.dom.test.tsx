/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const START = { lat: "43.65", lon: "-79.38" };
// Offsets north of the start: 0.001 degrees is about 111 m.
const rec = (id: string, name: string, wheelchair: string, dLat: number | null, over: Record<string, unknown> = {}) => ({
  id,
  name,
  wheelchair,
  category: id === "d" ? "museum" : "cafe",
  address: "1 Main Street",
  ...(dLat === null ? {} : { lat: 43.65 + dLat, lon: -79.38 }),
  provenance: prov,
  ...over,
});
const places = [rec("a", "Alpha Hall", "yes", 0.001), rec("b", "Beta Court", "no", 0.004), rec("c", "Gamma Gate", "UNKNOWN", 0.007), rec("d", "Delta Dome", "limited", 0.03), rec("e", "Epsilon End", "yes", null)];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

function show(locale: Locale = "en", data: unknown = places) {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={data} locale={locale} today="2026-11-15" />
    </MemoryRouter>,
  );
}
const type = (lat = START.lat, lon = START.lon, locale: Locale = "en") => {
  fireEvent.change(screen.getByLabelText(locale === "en" ? "Latitude" : "Latitude"), { target: { value: lat } });
  fireEvent.change(screen.getByLabelText(locale === "en" ? "Longitude" : "Longitude"), { target: { value: lon } });
};
const names = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const bandsTable = () => screen.getByRole("table", { name: /Places by straight-line distance|Lieux par distance en ligne droite/ });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("the distance table on the places list", () => {
  it("is not there until a starting point is typed", () => {
    show();
    expect(screen.queryByText("Places by distance")).toBeNull();
  });
  it("is not there for a point that is not valid", () => {
    show();
    type("95", "-79.38");
    expect(screen.queryByText("Places by distance")).toBeNull();
  });
  it("appears once a valid point is typed, with every place counted once", () => {
    show();
    type();
    const rows = within(bandsTable()).getAllByRole("row").slice(1);
    const total = rows.reduce((n, r) => n + Number(within(r).getAllByRole("cell")[0]!.textContent), 0);
    expect(total).toBe(5);
  });
  it("counts the places in the bands they fall in", () => {
    show();
    type();
    const count = (name: RegExp) => Number(within(within(bandsTable()).getByRole("row", { name })).getAllByRole("cell")[0]!.textContent);
    expect(count(/^Under 250/)).toBe(1);
    expect(count(/^250.m to 500/)).toBe(1);
    expect(count(/^500.m to 1/)).toBe(1);
    expect(count(/^2.km to 5/)).toBe(1);
    expect(count(/^No map point/)).toBe(1);
  });
  it("lists the places nearest first, as it already did, and leaves the one with no point last", () => {
    show();
    type();
    expect(names()).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate", "Delta Dome", "Epsilon End"]);
  });
  it("goes away again when the point is cleared", () => {
    show();
    type();
    type("", "");
    expect(screen.queryByText("Places by distance")).toBeNull();
  });
});

describe("showing one band", () => {
  it("shows only the places in the band, and says how many", () => {
    show();
    type();
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show 250.m to 500/ }));
    expect(names()).toEqual(["Beta Court"]);
    expect(screen.getByRole("status").textContent).toMatch(/1/);
  });
  it("keeps the table's counts when a band is chosen", () => {
    show();
    type();
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show Under 250/ }));
    expect(within(bandsTable()).getAllByRole("row")).toHaveLength(8);
    expect(Number(within(within(bandsTable()).getByRole("row", { name: /^2.km to 5/ })).getAllByRole("cell")[0]!.textContent)).toBe(1);
  });
  it("shows places with no map point when that group is chosen", () => {
    show();
    type();
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show No map point/ }));
    expect(names()).toEqual(["Epsilon End"]);
  });
  it("goes back to every place with the button under the table", () => {
    show();
    type();
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show Under 250/ }));
    fireEvent.click(screen.getByRole("button", { name: "Show every distance" }));
    expect(names()).toHaveLength(5);
  });
  it("combines with the wheelchair tag filter", () => {
    show();
    type();
    fireEvent.click(screen.getByRole("radio", { name: /^Yes/ }));
    // Alpha Hall (111 m) and Epsilon End (no map point) are tagged yes.
    expect(names()).toEqual(["Alpha Hall", "Epsilon End"]);
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show Under 250/ }));
    expect(names()).toEqual(["Alpha Hall"]);
  });
  it("narrows the kinds table to the places in the band", () => {
    show();
    type();
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show 2.km to 5/ }));
    const kinds = screen.getByRole("table", { name: "Places by kind and wheelchair tag" });
    expect(within(kinds).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["museum"]);
  });
  it("is ignored, not forgotten, while no point is typed", () => {
    show();
    type();
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show Under 250/ }));
    type("", "");
    expect(names()).toHaveLength(5);
    type();
    expect(names()).toEqual(["Alpha Hall"]);
  });
  it("is cleared by the clear button on an empty result", () => {
    show();
    type();
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show Under 250/ }));
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "zzzz" } });
    fireEvent.click(screen.getByRole("button", { name: /Clear/i }));
    expect(names()).toHaveLength(5);
  });
});

describe("the closest place for each tag on the places list", () => {
  const nearestTable = () => screen.getByRole("table", { name: "Closest place by wheelchair tag" });
  const cells = (tag: RegExp) => within(within(nearestTable()).getByRole("row", { name: tag })).getAllByRole("cell").map((c) => c.textContent);
  it("is not there until a starting point is typed", () => {
    show();
    expect(screen.queryByRole("table", { name: "Closest place by wheelchair tag" })).toBeNull();
  });
  it("names the closest place for each tag once a point is typed", () => {
    show();
    type();
    expect(cells(/^Yes/)).toEqual(["2", "Alpha Hall", "110\u00a0m"]);
    expect(cells(/^No/)).toEqual(["1", "Beta Court", "440\u00a0m"]);
    expect(cells(/^Limited/)).toEqual(["1", "Delta Dome", "3.3\u00a0km"]);
  });
  it("leaves out the place with no map point and says so", () => {
    show();
    type();
    expect(screen.getByText("1 place has no map point, so it is left out of this list.")).toBeTruthy();
  });
  it("follows the filters: choosing a tag leaves the other tags with none", () => {
    show();
    type();
    fireEvent.click(screen.getByRole("radio", { name: /^No/ }));
    expect(cells(/^No/)).toEqual(["1", "Beta Court", "440\u00a0m"]);
    expect(cells(/^Yes/)).toEqual(["0", "None among the places shown"]);
  });
  it("follows a chosen distance band", () => {
    show();
    type();
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show 500.m to 1/ }));
    expect(cells(/^UNKNOWN/)).toEqual(["1", "Gamma Gate", "780\u00a0m"]);
    expect(cells(/^Yes/)).toEqual(["0", "None among the places shown"]);
  });
});

describe("the shortlist and the distance table together", () => {
  it("lets a place from a chosen band be added to the list", () => {
    show();
    type();
    fireEvent.click(within(bandsTable()).getByRole("button", { name: /^Show 250.m to 500/ }));
    fireEvent.click(screen.getByRole("button", { name: "Add to list Beta Court" }));
    expect(screen.getByRole("heading", { name: "Your list (1 of 12)" })).toBeTruthy();
  });
  it("keeps the shortlist's distance column in step with the typed point", () => {
    show();
    type();
    fireEvent.click(screen.getByRole("button", { name: "Add to list Alpha Hall" }));
    const list = screen.getByRole("table", { name: /Shortlisted places/ });
    expect(within(list).getAllByRole("columnheader").map((h) => h.textContent)).toContain("Distance");
  });
});

describe("French", () => {
  it("shows the table in French with a straight-line note", () => {
    show("fr");
    type(START.lat, START.lon, "fr");
    expect(screen.getByText("Lieux par distance")).toBeTruthy();
    expect(screen.getByText(/distances en ligne droite, pas un trajet/)).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Sans point sur la carte (distance UNKNOWN)" })).toBeTruthy();
  });
});

describe("accessibility", () => {
  it("has no axe violations with the distance table open and a band chosen, in both languages", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show(locale);
      type(START.lat, START.lon, locale);
      expect((await axe.run(container, axeRules)).violations, `${locale} open`).toEqual([]);
      fireEvent.click(within(bandsTable()).getAllByRole("button", { name: /^(Show|Afficher) / })[0]!);
      expect((await axe.run(container, axeRules)).violations, `${locale} chosen`).toEqual([]);
      cleanup();
      localStorage.clear();
    }
  });
});
