/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const realPlaces = (JSON.parse(contentText) as { places: unknown[] }).places;
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, over: Record<string, unknown> = {}) => ({
  id, name, wheelchair, category: "attraction", address: "1 Main Street", wheelchair_description: "UNKNOWN", lat: 43.65, lon: -79.38, provenance: prov, ...over,
});
const small = [
  rec("a", "Alpha Hall", "yes", { lat: 43.656, lon: -79.38 }),
  rec("b", "Beta Court", "no", { lat: 43.7, lon: -79.4 }),
  rec("c", "Gamma Gate", "UNKNOWN", { lat: 43.66, lon: -79.39 }),
];

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-15" />
    </MemoryRouter>,
  );
}
const titles = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

afterEach(cleanup);

describe("PackPlaces", () => {
  it("lists the places by name with the tag and source of each", () => {
    show(small);
    expect(titles()).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate"]);
    expect(screen.getByRole("status").textContent).toBe("3 places shown.");
    expect(screen.getAllByText("OpenStreetMap wheelchair tag: Yes (reported)")).toHaveLength(1);
    expect(screen.getAllByText("OpenStreetMap wheelchair tag: UNKNOWN")).toHaveLength(1);
    expect(screen.getAllByText(/Licence: ODbL 1\.0/)).toHaveLength(3);
    expect(screen.getByText("© OpenStreetMap contributors")).toBeTruthy();
  });
  it("narrows the list as words are typed and announces the new count", () => {
    show(small);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "beta" } });
    expect(titles()).toEqual(["Beta Court"]);
    expect(screen.getByRole("status").textContent).toBe("1 place shown.");
  });
  it("filters by tag and tells the reader how many UNKNOWN places are not shown", () => {
    show(small);
    fireEvent.click(screen.getByRole("radio", { name: "Yes (1)" }));
    expect(titles()).toEqual(["Alpha Hall"]);
    expect(screen.getByText("1 more place has an UNKNOWN wheelchair tag and is not shown. Choose UNKNOWN to see it.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "UNKNOWN (1)" }));
    expect(titles()).toEqual(["Gamma Gate"]);
  });
  it("shows the empty state and clears the search from its action", () => {
    show(small);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "zzz" } });
    expect(screen.getByText("No places match this search")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Clear the search" }));
    expect(titles()).toHaveLength(3);
    expect((screen.getByLabelText("Search by name, address or kind") as HTMLInputElement).value).toBe("");
  });
  it("sorts by distance from a typed point and rejects a bad one", () => {
    show(small);
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "43.7" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-79,4" } });
    expect(titles()).toEqual(["Beta Court", "Gamma Gate", "Alpha Hall"]);
    expect(screen.getAllByText(/ away$/)).toHaveLength(3);
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "200" } });
    expect(screen.getByText("Enter a latitude from -90 to 90 and a longitude from -180 to 180.")).toBeTruthy();
    expect(titles()).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate"]);
  });
  it("renders hostile text as text", () => {
    const { container } = show([rec("x", "<img src=x onerror=alert(1)>", "yes", { wheelchair_description: "<script>alert(1)</script>" })]);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("script")).toBeNull();
    expect(screen.getByRole("heading", { level: 3 }).textContent).toBe("<img src=x onerror=alert(1)>");
  });
  it("links the source page with a descriptive name, and only over https", () => {
    show([rec("x", "Alpha Hall", "yes"), rec("y", "Bad Link", "yes", { provenance: { ...prov, source_url: "javascript:alert(1)" } })]);
    const links = screen.getAllByRole("link");
    expect(links).toHaveLength(1);
    expect(links[0]!.getAttribute("href")).toBe("https://www.openstreetmap.org/way/1");
    expect(links[0]!.textContent).toBe("Open the source page for Alpha Hall");
    expect(links[0]!.getAttribute("rel")).toContain("noopener");
  });
  it("shows a load problem, not 'no matches', when the pack has no usable places", () => {
    show([null, { id: "" }]);
    expect(screen.getByText("The saved places could not be read")).toBeTruthy();
    expect(screen.getByText("2 records in the pack could not be shown because they were incomplete.")).toBeTruthy();
    expect(screen.queryByLabelText("Search by name, address or kind")).toBeNull();
  });
  it("shows the same load problem for a pack with no places array", () => {
    for (const bad of [undefined, {}, "x"]) {
      show(bad);
      expect(screen.getByRole("alert")).toBeTruthy();
      cleanup();
    }
  });
  it("sets the language of the region and works in French", () => {
    const { container } = show(small, "fr");
    expect(container.querySelector("section")!.getAttribute("lang")).toBe("fr");
    expect(screen.getByRole("heading", { level: 2 }).textContent).toBe("Lieux enregistrés sur cet appareil");
    expect(screen.getByText("3 lieux affichés.")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Non (1)" }));
    expect(titles()).toEqual(["Beta Court"]);
  });
});

describe("PackPlaces accessibility", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations in ${locale}, for the shipped pack`, async () => {
      const view = show(realPlaces, locale);
      expect((await axe.run(view.container, axeRules)).violations).toEqual([]);
    });
  }
  it("has no axe violations for the empty, error and invalid-point states", async () => {
    const a = show(small);
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "x" } });
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "zzz" } });
    expect((await axe.run(a.container, axeRules)).violations).toEqual([]);
    cleanup();
    const b = show([]);
    expect((await axe.run(b.container, axeRules)).violations).toEqual([]);
  });
  it("gives every control a name and keeps one h2 over the h3 cards", () => {
    const { container } = show(small);
    expect(container.querySelectorAll("h2")).toHaveLength(1);
    for (const control of container.querySelectorAll("input")) {
      expect(control.labels?.length ?? 0, control.outerHTML).toBeGreaterThan(0);
    }
    // The wheelchair tag, the four filters (source, licence, tier, retrieved) and the two choices of the kinds table (order, minimum).
    expect(within(container).getAllByRole("radiogroup")).toHaveLength(7);
    expect(within(container).getAllByRole("radio").length).toBeGreaterThan(6);
  });
  it("never uses colour alone: the tag is written out on every card", () => {
    const { container } = show(realPlaces);
    for (const card of container.querySelectorAll("li.pack-place")) {
      expect(card.textContent).toMatch(/wheelchair tag: (Yes|No|Limited|Designated|UNKNOWN)/i);
    }
  });
});

describe("PackPlaces filters", () => {
  it("offers source, licence, tier and retrieved filters, each with a count", () => {
    show(small);
    for (const name of ["Source", "Licence", "Tier", "Retrieved"]) expect(screen.getByRole("radiogroup", { name })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "ODbL 1.0 (3)" })).toBeTruthy();
  });
  it("filters by tier, names the filter and lists UNKNOWN last", () => {
    show([rec("a", "Alpha Hall", "yes", { provenance: { ...prov, tier: 1 } }), rec("b", "Beta Court", "no", { provenance: null })]);
    const tier = screen.getByRole("radiogroup", { name: "Tier" });
    expect(within(tier).getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual(["Any (2)", "Tier 1 (1)", "UNKNOWN (1)"]);
    fireEvent.click(within(tier).getByRole("radio", { name: "UNKNOWN (1)" }));
    expect(titles()).toEqual(["Beta Court"]);
    expect(screen.getByText("Filtered by Tier: UNKNOWN.")).toBeTruthy();
  });
  it("clears the filters from the empty state", () => {
    show(small);
    fireEvent.click(screen.getByRole("radio", { name: "ODbL 1.0 (3)" }));
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "zzz" } });
    fireEvent.click(screen.getByRole("button", { name: /clear/i }));
    expect(titles()).toEqual(["Alpha Hall", "Beta Court", "Gamma Gate"]);
    expect(screen.queryByText(/^Filtered by/)).toBeNull();
  });
  it("is in French with the UNKNOWN token and passes axe", async () => {
    const { container } = show(small, "fr");
    expect(screen.getByRole("radiogroup", { name: "Niveau" })).toBeTruthy();
    for (const name of ["Source", "Licence", "Niveau", "Consulté"]) expect(screen.getByRole("radiogroup", { name }).textContent).not.toContain("INCONNU");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});

