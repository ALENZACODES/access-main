/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { NearGroups } from "./NearGroups";
import type { Point } from "./packGeo";
import { bare, place, varied } from "./placeFixtures";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const at = (id: string, dLat: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + dLat, lon: -79.38, ...over });
const STEP = 0.0004;
const ps = [at("a", 0, { name: "Alpha" }), at("b", STEP, { name: "Bravo", wheelchair: "no" }), at("c", 0.02, { name: "Charlie" }), bare("z")];

type Over = { places?: typeof ps; locale?: "en" | "fr"; onSave?: (f: SavedFile) => boolean; onUsePoint?: (p: Point) => void };
function open(over: Over = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const view = render(<NearGroups places={over.places ?? ps} locale={locale} onSave={over.onSave} onUsePoint={over.onUsePoint} />);
  fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show which of these places are close together" : "Afficher quels lieux sont proches les uns des autres" }));
  return view;
}
const nearest = () => fireEvent.click(screen.getByRole("radio", { name: /nearest place to each place|lieu le plus proche de chaque lieu/i }));

describe("the nearest-place view", () => {
  it("offers the two views with groups chosen first", () => {
    open();
    const [groups, near] = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(groups!.checked).toBe(true);
    expect(near!.checked).toBe(false);
  });
  it("switches to a table with a caption, three column headers and a row per located place", () => {
    open();
    nearest();
    expect(screen.getByRole("table", { name: /nearest other place to each place/ })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Place", "Nearest place", "Distance and direction"]);
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Alpha", "Bravo", "Charlie"]);
  });
  it("gives distance and direction in the cell", () => {
    open();
    nearest();
    const row = screen.getByRole("rowheader", { name: "Alpha" }).closest("tr")!;
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["Bravo", expect.stringMatching(/^\d+\u00a0m to the north$/)]);
  });
  it("lists how many places have a neighbour within each distance", () => {
    open();
    nearest();
    const items = screen.getAllByRole("listitem").map((l) => l.textContent);
    expect(items).toEqual(["2 of 3 places have another place within 50\u00a0m.", "2 of 3 places have another place within 100\u00a0m.", "2 of 3 places have another place within 250\u00a0m.", "2 of 3 places have another place within 500\u00a0m."]);
  });
  it("says what is needed when fewer than two places have a map point", () => {
    open({ places: [at("a", 0), bare("x")] });
    nearest();
    expect(screen.getByText(/At least two places with a map point/)).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("goes back to the groups", () => {
    open();
    nearest();
    fireEvent.click(screen.getAllByRole("radio")[0]!);
    expect(screen.getByRole("heading", { name: "Group 1" })).toBeTruthy();
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("saves the nearest places as text and CSV", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    open({ onSave });
    nearest();
    fireEvent.click(screen.getByRole("button", { name: "Save the nearest places as text (.txt)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the nearest places as a spreadsheet (CSV)" }));
    expect(onSave.mock.calls.map((c) => c[0].name)).toEqual(["nearest-places.txt", "nearest-places.csv"]);
    expect(onSave.mock.calls[0]![0].content).toContain("Nearest place to each place");
    expect(onSave.mock.calls[1]![0].content).toContain("Place,Id,Nearest place");
    expect(screen.getByRole("status").textContent).toBe("Saved nearest-places.csv.");
  });
  it("clears the saved message when the view changes", () => {
    open({ onSave: () => true });
    fireEvent.click(screen.getByRole("button", { name: "Save the groups as text (.txt)" }));
    expect(screen.getByRole("status").textContent).toMatch(/^Saved/);
    nearest();
    expect(screen.getByRole("status").textContent).toBe("");
  });
  it("is French", () => {
    open({ locale: "fr" });
    nearest();
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Lieu", "Lieu le plus proche", "Distance et direction"]);
    expect(within(screen.getByRole("rowheader", { name: "Alpha" }).closest("tr")!).getAllByRole("cell")[1]!.textContent).toMatch(/vers le nord$/);
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations in ${locale}`, async () => {
      const { container } = open({ locale, places: varied(8, 40) });
      nearest();
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
});

describe("using the middle of a group as the point", () => {
  it("is not offered without a handler", () => {
    open();
    expect(screen.queryByRole("button", { name: /as my point/ })).toBeNull();
  });
  it("is offered once for each group and passes the middle", () => {
    const onUsePoint = vi.fn();
    open({ onUsePoint });
    fireEvent.click(screen.getByRole("button", { name: "Use the middle of Group 1 as my point" }));
    expect(onUsePoint).toHaveBeenCalledWith({ lat: 43.6502, lon: -79.38 });
    expect(screen.getByRole("status").textContent).toBe("Your point is now 43.65020, -79.38000.");
  });
  it("offers a button per group", () => {
    const four = [at("a", 0), at("b", STEP), at("c", 0.02), at("d", 0.02 + STEP)];
    open({ places: four, onUsePoint: () => undefined });
    expect(screen.getAllByRole("button", { name: /as my point/ }).map((b) => b.textContent)).toEqual(["Use the middle of Group 1 as my point", "Use the middle of Group 2 as my point"]);
  });
  it("says it in French with a decimal comma", () => {
    open({ locale: "fr", onUsePoint: () => undefined });
    fireEvent.click(screen.getByRole("button", { name: "Utiliser le milieu du groupe 1 comme mon point" }));
    expect(screen.getByRole("status").textContent).toBe("Votre point est maintenant 43,65020\u202f; -79,38000.");
  });
});
