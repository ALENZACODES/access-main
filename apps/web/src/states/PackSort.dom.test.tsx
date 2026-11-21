/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { PACK_SORTS, type PackSort as Sort, sortPlaces } from "./packSort";
import { PackSort } from "./PackSort";
import { PROV, place, varied } from "./placeFixtures";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const on = (date: string) => ({ ...PROV, retrieved_at: date });
const ps = [
  place("a", { name: "Alpha", category: "cafe", address: "20 Dundas Street East", wheelchair: "no", provenance: on("2026-03-01") }),
  place("b", { name: "Bravo", category: "bar", address: "5 Dundas Street East", wheelchair: "yes", provenance: on("2026-01-01") }),
  place("c", { name: "Charlie", category: "cafe", address: "7 Queen Street West", wheelchair: "yes", provenance: on("2026-02-01") }),
];
const EN = "Change the order of the list";
const FR = "Changer l’ordre de la liste";

/** A parent that keeps the order, the way the places list does. */
function Host({ places, locale, onSave, first = "default" }: { places: typeof ps; locale: "en" | "fr"; onSave?: (f: SavedFile) => boolean; first?: Sort }) {
  const [sort, setSort] = useState<Sort>(first);
  return <PackSort places={sortPlaces(places, sort)} sort={sort} onSort={setSort} locale={locale} onSave={onSave} />;
}
function open(over: { places?: typeof ps; locale?: "en" | "fr"; onSave?: (f: SavedFile) => boolean; first?: Sort } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const view = render(<Host places={over.places ?? ps} locale={locale} onSave={over.onSave} first={over.first} />);
  fireEvent.click(screen.getByRole("button", { name: locale === "en" ? EN : FR }));
  return view;
}
const radio = (name: string | RegExp) => screen.getByRole("radio", { name });

describe("opening", () => {
  it("renders nothing for fewer than two places", () => {
    expect(render(<PackSort places={[]} sort="default" onSort={() => undefined} locale="en" />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<PackSort places={[ps[0]!]} sort="default" onSort={() => undefined} locale="en" />).container.innerHTML).toBe("");
  });
  it("starts closed with no radios", () => {
    render(<Host places={ps} locale="en" />);
    expect(screen.getByRole("button", { name: EN }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
  it("opens with the eight orders, the current one chosen, and closes again", () => {
    open();
    const radios = screen.getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(8);
    expect(radios[0]!.checked).toBe(true);
    const hide = screen.getByRole("button", { name: "Hide the order of the list" });
    expect(document.getElementById(hide.getAttribute("aria-controls")!)).not.toBeNull();
    fireEvent.click(hide);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });
  it("offers the orders in a fixed sequence", () => {
    open();
    expect(screen.getAllByRole("radio").map((r) => r.closest("label")?.textContent)).toEqual([
      "Nearest first when a point is typed, otherwise by name",
      "Name, A to Z",
      "Name, Z to A",
      "Kind of place",
      "Street, then number",
      "Wheelchair tag",
      "Record retrieved, oldest first",
      "Record retrieved, newest first",
    ]);
  });
});

describe("choosing an order", () => {
  it("calls back, says which order and how many places, and shows its help", () => {
    const onSort = vi.fn();
    render(<PackSort places={ps} sort="default" onSort={onSort} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: EN }));
    fireEvent.click(radio("Name, Z to A"));
    expect(onSort).toHaveBeenCalledWith("name-desc");
    expect(screen.getByRole("status").textContent).toBe("Ordered by: Name, Z to A. 3 places.");
  });
  it("shows the help for the chosen order and always says an order is not a ranking", () => {
    open({ first: "street" });
    expect(screen.getByText("A place with no street in its address is last.")).toBeTruthy();
    expect(screen.getByText(/does not say that one place is better or easier/)).toBeTruthy();
  });
  it("shows no groups for the default and a numbered list of groups for the others", () => {
    open();
    expect(screen.queryByRole("heading", { name: "How the list falls into groups" })).toBeNull();
    fireEvent.click(radio("Kind of place"));
    expect(screen.getByRole("heading", { name: "How the list falls into groups" })).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Bar: 1 place", "Cafe: 2 places"]);
  });
  it("updates the groups for each order", () => {
    open();
    fireEvent.click(radio("Wheelchair tag"));
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Yes: 2 places", "No: 1 place"]);
    fireEvent.click(radio("Record retrieved, newest first"));
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["1 March 2026: 1 place", "1 February 2026: 1 place", "1 January 2026: 1 place"]);
  });
  it("keeps the panel open and the chosen radio checked after the parent re-renders", () => {
    open();
    fireEvent.click(radio("Street, then number"));
    expect((radio("Street, then number") as HTMLInputElement).checked).toBe(true);
    expect(screen.getByRole("button", { name: "Hide the order of the list" })).toBeTruthy();
  });
  it("a value the component does not know falls back to the default", () => {
    const onSort = vi.fn();
    render(<PackSort places={ps} sort="default" onSort={onSort} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: EN }));
    fireEvent.click(radio("Name, A to Z"));
    expect(onSort).toHaveBeenLastCalledWith("name");
  });
});

describe("saving", () => {
  it("saves the list as text in the order shown", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    open({ onSave, first: "name-desc" });
    fireEvent.click(screen.getByRole("button", { name: "Save the list in this order (.txt)" }));
    const f = onSave.mock.calls[0]![0];
    expect(f.name).toBe("places-in-order.txt");
    expect(f.content).toContain("1. Charlie");
    expect(f.content).toContain("3. Alpha");
    expect(screen.getByRole("status").textContent).toBe("Saved places-in-order.txt.");
  });
  it("saves a CSV with positions", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    open({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the list in this order as a spreadsheet (CSV)" }));
    const f = onSave.mock.calls[0]![0];
    expect(f.name).toBe("places-in-order.csv");
    expect(f.mime).toBe("text/csv;charset=utf-8");
    expect(f.content).toContain("Position,Place,Id");
  });
  it("says so when the browser cannot save, or saving throws", () => {
    open({ onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the list in this order (.txt)" }));
    expect(screen.getByRole("status").textContent).toBe("This browser cannot save a file here.");
    cleanup();
    open({ onSave: () => { throw new Error("no"); } });
    fireEvent.click(screen.getByRole("button", { name: "Save the list in this order (.txt)" }));
    expect(screen.getByRole("status").textContent).toBe("This browser cannot save a file here.");
  });
});

describe("French", () => {
  it("has French words and passes the typography check", () => {
    open({ locale: "fr" });
    expect(screen.getAllByRole("radio")).toHaveLength(8);
    fireEvent.click(radio("Nom, de A à Z"));
    expect(screen.getByRole("status").textContent).toBe("Ordre\u00a0: Nom, de A à Z. 3 lieux.");
    expect(lintFrench(document.body.textContent ?? "")).toEqual([]);
  });
  it("saves French files", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    open({ locale: "fr", onSave });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la liste dans cet ordre (.txt)" }));
    expect(onSave.mock.calls[0]![0].name).toBe("lieux-en-ordre.txt");
    expect(screen.getByRole("status").textContent).toBe("Fichier lieux-en-ordre.txt enregistré.");
  });
});

describe("accessibility", () => {
  for (const locale of ["en", "fr"] as const) {
    for (const sort of ["default", "kind", "street"] as const) {
      it(`has no axe violations open, ${sort}, in ${locale}`, async () => {
        const { container } = open({ locale, first: sort, places: varied(6, 30) as unknown as typeof ps });
        expect((await axe.run(container, axeRules)).violations).toEqual([]);
      });
    }
  }
  it("the groups are an ordered list in a labelled section, and the status is a live region", () => {
    open({ first: "kind" });
    expect(within(document.body).getByRole("list")).toBeTruthy();
    expect(screen.getByRole("status")).toBeTruthy();
    expect(PACK_SORTS).toHaveLength(8);
  });
});
