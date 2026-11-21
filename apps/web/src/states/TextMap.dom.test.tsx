/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TextMap } from "./TextMap";
import { bare, place, varied } from "./placeFixtures";
import { lintFrench } from "./typography";
import type { SavedFile } from "./downloadFile";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const C = { lat: 43.65, lon: -79.38 };
const at = (id: string, lat: number | null, lon: number | null, over: Record<string, unknown> = {}) => place(id, { name: `Place ${id}`, lat, lon, ...over });
const ps = [at("nw", 43.7, -79.4), at("se", 43.6, -79.3, { wheelchair: "no" }), at("mid", 43.65, -79.35), bare("z")];
type Save = (f: SavedFile) => boolean;

function open(over: { places?: typeof ps; from?: typeof C | null; locale?: "en" | "fr"; onSave?: Save } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const view = render(<TextMap places={over.places ?? ps} from={over.from === undefined ? null : over.from} locale={locale} onSave={over.onSave} />);
  fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show a text map of these places" : "Afficher une carte en texte de ces lieux" }));
  return view;
}

describe("opening", () => {
  it("renders nothing for no places", () => {
    expect(render(<TextMap places={[]} from={null} locale="en" />).container.innerHTML).toBe("");
  });
  it("starts closed with no table", () => {
    render(<TextMap places={ps} from={null} locale="en" />);
    expect(screen.getByRole("button").getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("opens and closes", () => {
    open();
    fireEvent.click(screen.getByRole("button", { name: "Hide the text map" }));
    expect(screen.queryByRole("table")).toBeNull();
  });
});

describe("the grid", () => {
  it("is a table with a caption, a column header per column and a row header per row", () => {
    open();
    expect(screen.getByRole("table", { name: "Places by part of the area, north at the top" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Area", "West", "Centre", "East"]);
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["North", "Middle", "South"]);
  });
  it("says in each cell how many places, with the tag mix", () => {
    open();
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells[0]).toBe("1 place: Yes 1");
    expect(cells[4]).toBe("1 place: Yes 1");
    expect(cells[8]).toBe("1 place: No 1");
    expect(cells[1]).toBe("No places");
  });
  it("lists the places of each non-empty cell under a heading, and the summary above", () => {
    open();
    expect(screen.getByRole("heading", { name: "North, West" })).toBeTruthy();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(3);
    expect(screen.getByText("3 places in a 3 by 3 grid. 1 place has no map point: its position is UNKNOWN.")).toBeTruthy();
  });
  it("says the grid is not a street map", () => {
    open();
    expect(screen.getByText(/not a street or neighbourhood map/)).toBeTruthy();
  });
  it("changes size with the choice", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: "2 × 2" }));
    expect(screen.getAllByRole("columnheader")).toHaveLength(3);
    fireEvent.click(screen.getByRole("radio", { name: "4 × 4" }));
    expect(screen.getAllByRole("columnheader")).toHaveLength(5);
    expect(screen.getAllByRole("cell")).toHaveLength(16);
  });
  it("follows the places it is given", () => {
    const { rerender } = open();
    rerender(<TextMap places={[ps[0]!, ps[1]!]} from={null} locale="en" />);
    expect(screen.getByText(/^2 places in a 3 by 3 grid\./)).toBeTruthy();
  });
});

describe("directions", () => {
  it("says a point is needed when none is typed, and shows the grid", () => {
    open();
    expect(screen.getByText(/type a point in the distance fields above/i)).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Which way from my point" }));
    expect(screen.getByRole("table")).toBeTruthy();
  });
  it("shows each place by direction with distance once a point is typed", () => {
    open({ from: C });
    fireEvent.click(screen.getByRole("radio", { name: "Which way from my point" }));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByRole("heading", { name: "North" })).toBeTruthy();
    expect(screen.getByText(/^Place nw: .* to the north\.$/)).toBeTruthy();
    expect(screen.getByText(/real route is longer/)).toBeTruthy();
  });
  it("counts places with no map point and says their direction is UNKNOWN", () => {
    open({ from: C });
    fireEvent.click(screen.getByRole("radio", { name: "Which way from my point" }));
    expect(screen.getByText("1 without a map point: direction and distance UNKNOWN.")).toBeTruthy();
  });
  it("falls back to the grid when the point is cleared while directions are shown", () => {
    const { rerender } = open({ from: C });
    fireEvent.click(screen.getByRole("radio", { name: "Which way from my point" }));
    rerender(<TextMap places={ps} from={null} locale="en" />);
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

describe("saving", () => {
  it("saves the grid as text and as CSV", () => {
    const onSave = vi.fn<Save>(() => true);
    open({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the grid as text (.txt)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the grid as a spreadsheet (CSV)" }));
    expect(onSave.mock.calls.map((c) => c[0].name)).toEqual(["text-map.txt", "text-map.csv"]);
    expect(onSave.mock.calls[0]![0].content).toContain("North, West: Place nw");
    expect(onSave.mock.calls[1]![0].content).toContain("Place,Id,Row,Column");
    expect(document.querySelector("[data-text-map-status]")?.textContent).toBe("Saved text-map.csv.");
  });
  it("saves the directions as text and as CSV", () => {
    const onSave = vi.fn<Save>(() => true);
    open({ onSave, from: C });
    fireEvent.click(screen.getByRole("radio", { name: "Which way from my point" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the directions as text (.txt)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the directions as a spreadsheet (CSV)" }));
    expect(onSave.mock.calls[0]![0].content).toContain("Places around the point you typed");
    expect(onSave.mock.calls[1]![0].content).toContain("Place,Id,Direction,Metres,Distance");
  });
  it("says so when saving fails or throws", () => {
    for (const onSave of [() => false, () => { throw new Error("x"); }]) {
      const { unmount } = open({ onSave });
      fireEvent.click(screen.getByRole("button", { name: "Save the grid as text (.txt)" }));
      expect(document.querySelector("[data-text-map-status]")?.textContent).toBe("This browser cannot save a file here.");
      unmount();
    }
  });
});

describe("French and accessibility", () => {
  it("is French with typography kept, and never writes the French word for UNKNOWN", () => {
    const { container } = open({ locale: "fr", from: C });
    for (const el of container.querySelectorAll("p, caption, th, td, button, label, h3")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    expect(container.textContent).not.toMatch(/INCONN/i);
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Nord", "Milieu", "Sud"]);
  });
  it("has no axe violations closed or open, grid or directions, in either language", async () => {
    for (const locale of ["en", "fr"] as const) {
      document.documentElement.lang = locale;
      const { container, unmount } = render(<TextMap places={varied(3, 15)} from={C} locale={locale} />);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      fireEvent.click(screen.getAllByRole("button")[0]!);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      fireEvent.click(screen.getAllByRole("radio")[locale === "en" ? 1 : 1]!);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      unmount();
    }
  });
  it("keeps the table header cells associated with every body cell", () => {
    open();
    const t = screen.getByRole("table");
    for (const row of within(t).getAllByRole("row").slice(1)) {
      expect(within(row).getAllByRole("rowheader")).toHaveLength(1);
      expect(within(row).getAllByRole("cell")).toHaveLength(3);
    }
  });
});
