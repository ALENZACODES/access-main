/** @vitest-environment jsdom */
import { cleanup, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { PackNearest } from "./PackNearest";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { lintFrench } from "./typography";

const FROM = { lat: 43.65, lon: -79.38 };
const R = 6_371_008.8;
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const at = (metres: number | null) => (metres === null ? {} : { lat: FROM.lat + ((metres / R) * 180) / Math.PI, lon: FROM.lon });
const mk = (id: string, metres: number | null, over: Record<string, unknown> = {}) => ({ id, name: id, wheelchair: "yes", provenance: OSM, ...at(metres), ...over });
const places: PackPlaceRecord[] = [...parsePackPlaces([mk("Alpha", 123), mk("Beta", 900, { wheelchair: "no" }), mk("Gamma", 400, { wheelchair: undefined, name: "" }), mk("Delta", null, { wheelchair: "limited" })]).places];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

afterEach(cleanup);

function show(over: { places?: PackPlaceRecord[]; from?: typeof FROM | null; locale?: "en" | "fr" } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<PackNearest places={over.places ?? places} from={over.from === undefined ? FROM : over.from} locale={locale} />);
}

describe("when it shows", () => {
  it("shows nothing without a starting point", () => {
    expect(show({ from: null }).container.innerHTML).toBe("");
  });
  it("shows nothing for no places", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
  });
  it("is not a heading", () => {
    show();
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
  });
});

describe("the table", () => {
  it("has a caption and one row per tag", () => {
    show();
    const table = screen.getByRole("table", { name: "Closest place by wheelchair tag" });
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Yes", "Limited", "No", "Designated", "UNKNOWN"]);
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Wheelchair tag", "Places", "Closest place", "Distance"]);
  });
  it("names the closest place and its rounded distance", () => {
    show();
    const row = screen.getByRole("row", { name: /^Yes/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "Alpha", "120\u00a0m"]);
  });
  it("says a place has no name when the pack gives none", () => {
    show();
    const row = screen.getByRole("row", { name: /^UNKNOWN/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "Place with no name (UNKNOWN)", "400\u00a0m"]);
  });
  it("says none among the places shown for a tag no place has", () => {
    show();
    const row = screen.getByRole("row", { name: /^Designated/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["0", "None among the places shown"]);
  });
  it("says UNKNOWN when the only place with a tag has no map point", () => {
    show();
    const row = screen.getByRole("row", { name: /^Limited/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["1", "UNKNOWN (no place with this tag has a map point)"]);
  });
  it("spans the last two columns for a tag with no place, so each row still has four cells' worth", () => {
    show();
    const cell = screen.getByRole("row", { name: /^Designated/ }).querySelectorAll("td")[1]!;
    expect(cell.getAttribute("colspan")).toBe("2");
  });
  it("says how many places were left out for having no map point", () => {
    show();
    expect(screen.getByText("1 place has no map point, so it is left out of this list.")).toBeTruthy();
  });
  it("says nothing about left-out places when every place has a map point", () => {
    show({ places: places.filter((p) => p.location !== null) });
    expect(screen.queryByText(/left out of this list/)).toBeNull();
  });
  it("says a distance is not a recommendation", () => {
    show();
    expect(screen.getByText(/This is a distance, not a recommendation\./)).toBeTruthy();
  });
  it("offers nothing to copy or save, since a distance to a named place says where it was typed from", () => {
    show();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
    expect(screen.queryAllByRole("link")).toHaveLength(0);
  });
  it("follows the places it is given", () => {
    const { rerender } = show();
    rerender(<PackNearest places={places.slice(0, 1)} from={FROM} locale="en" />);
    expect(within(screen.getByRole("row", { name: /^No/ })).getAllByRole("cell")[1]!.textContent).toBe("None among the places shown");
  });
  it("follows the starting point it is given", () => {
    const { rerender } = show();
    rerender(<PackNearest places={places} from={{ lat: FROM.lat + 0.01, lon: FROM.lon }} locale="en" />);
    const row = screen.getByRole("row", { name: /^Yes/ });
    expect(within(row).getAllByRole("cell")[2]!.textContent).not.toBe("120\u00a0m");
  });
});

describe("French", () => {
  it("reads in French, with clean typography on every visible string", () => {
    const { container } = show({ locale: "fr" });
    expect(screen.getByText("Lieu le plus proche pour chaque indication")).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Réservé" })).toBeTruthy();
    expect(screen.getByText("Aucun parmi les lieux affichés")).toBeTruthy();
    for (const node of container.querySelectorAll("p, caption, th, td")) {
      if (node.children.length > 0) continue;
      if (/^(Alpha|Beta|Gamma|Delta)$/.test(node.textContent ?? "")) continue;
      expect(lintFrench(node.textContent ?? ""), node.textContent ?? "").toEqual([]);
    }
  });
  it("uses a comma in a distance over a kilometre", () => {
    show({ locale: "fr", places: [...parsePackPlaces([mk("Far", 1500)]).places] });
    // The default text matcher folds a no-break space into a plain one, so compare the cell text itself.
    expect(screen.getAllByRole("cell").map((c) => c.textContent)).toContain("1,5\u00a0km");
  });
  it("sets the language on the section", () => {
    expect(show({ locale: "fr" }).container.querySelector("section")!.getAttribute("lang")).toBe("fr");
  });
});

describe("accessibility", () => {
  it("has no axe violations in either language", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations, locale).toEqual([]);
      cleanup();
    }
  });
});
