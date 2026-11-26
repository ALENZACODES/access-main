/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { place, varied } from "./placeFixtures";
import { lintFrench } from "./typography";
import { VenueGroups } from "./VenueGroups";

afterEach(cleanup);
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const at = (id: string, name: string | null, lat: number | null, lon: number | null, wheelchair: string | null = "yes") => place(id, { name, lat, lon, wheelchair });
const LAT = 43.65;
const LON = -79.38;
const list = [at("a", "Hall", LAT, LON, "yes"), at("b", "Hall Entrance", LAT + 0.0005, LON, "no"), at("c", "Hall Elevator", null, null, null), at("d", "Mall", LAT + 0.05, LON, "yes"), at("e", "Mall Door", LAT + 0.05, LON, "yes"), at("x", "Solo", LAT, LON)];
const open = (locale: "en" | "fr" = "en") => fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show these places grouped into venues" : "Afficher ces lieux regroupés par lieu" }));

describe("VenueGroups", () => {
  it("renders nothing for fewer than two places", () => {
    expect(render(<VenueGroups places={[]} locale="en" />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<VenueGroups places={[list[0]!]} locale="en" />).container.innerHTML).toBe("");
  });
  it("starts closed with no table", () => {
    render(<VenueGroups places={list} locale="en" />);
    expect(screen.getByRole("button", { name: "Show these places grouped into venues" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("points the toggle at its panel and flips its label", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    const b = screen.getByRole("button", { name: "Hide venues by name" });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-controls")!)).toBeTruthy();
  });
  it("shows the summary and the caveat when opened", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    expect(screen.getByText("5 of 6 places fall into 2 venues by name.")).toBeTruthy();
    expect(screen.getByText(/does not mean an entrance leads to the place/)).toBeTruthy();
  });
  it("shows a heading and a captioned table for each venue, largest first", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Hall: 3 parts", "Mall: 2 parts"]);
    expect(screen.getByRole("table", { name: "Parts of Hall with the wheelchair tag the pack gives each" })).toBeTruthy();
  });
  it("lists each part with its name, tag and distance, writing UNKNOWN where the pack gives none", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    const table = screen.getByRole("table", { name: /Parts of Hall/ });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows.map((r) => [within(r).getByRole("rowheader").textContent, ...within(r).getAllByRole("cell").map((c) => c.textContent)])).toEqual([
      ["Main place", "Hall", "Yes", "starting point"],
      ["Entrance", "Hall Entrance", "No", "56\u00a0m"],
      ["Elevator", "Hall Elevator", "UNKNOWN", "UNKNOWN"],
    ]);
  });
  it("says when a part is joined by name only", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    expect(screen.getAllByText("Some parts are joined by name only, because they have no map point.")).toHaveLength(1);
  });
  it("can show only venues whose tags differ, and says when none do", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Only venues whose parts have different wheelchair tags" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Hall: 3 parts"]);
    cleanup();
    render(<VenueGroups places={[list[3]!, list[4]!]} locale="en" />);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Only venues whose parts have different wheelchair tags" }));
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(screen.getByText("Every venue's parts have the same wheelchair tag.")).toBeTruthy();
  });
  it("shows a table of the parts by kind and tag for the venues shown, and it follows the filters", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    const table = screen.getByRole("table", { name: /Parts of the venues shown, by kind/ });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Kind of part", "Yes", "Limited", "No", "Designated", "UNKNOWN"]);
    const row = (name: string) => within(within(table).getByRole("rowheader", { name }).closest("tr")!).getAllByRole("cell").map((c) => c.textContent);
    expect(row("Main place")).toEqual(["2", "0", "0", "0", "0"]);
    expect(row("Entrance")).toEqual(["1", "0", "1", "0", "0"]);
    fireEvent.change(screen.getByLabelText("Find a venue"), { target: { value: "mal" } });
    expect(within(screen.getByRole("table", { name: /Parts of the venues shown, by kind/ })).queryByRole("rowheader", { name: "Elevator" })).toBeNull();
  });
  it("shows no kind table when no venue is shown", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    fireEvent.change(screen.getByLabelText("Find a venue"), { target: { value: "zzz" } });
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("says how far apart the parts of a venue are, in a straight line", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    expect(screen.getAllByText(/at most .* apart in a straight line/)).toHaveLength(2);
  });
  it("saves one venue as text", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<VenueGroups places={list} locale="en" onSave={onSave} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save Mall as text (.txt)" }));
    expect(onSave.mock.calls[0]![0].content).toContain("Mall: 2 parts");
    expect(onSave.mock.calls[0]![0].content).not.toContain("Hall: 3 parts");
    expect(document.querySelector("[data-venue-groups-status]")?.textContent).toBe("Saved venues-by-name.txt.");
  });
  it("saves one venue as text in French", () => {
    render(<VenueGroups places={list} locale="fr" onSave={() => true} />);
    open("fr");
    expect(screen.getByRole("button", { name: "Enregistrer Mall comme texte (.txt)" })).toBeTruthy();
  });
  it("says how many venues list each kind of part", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    expect(screen.getByText("Of 2 venues, the names list: entrance 2, elevator 1.")).toBeTruthy();
  });
  it("finds a venue by what is typed and says when none matches", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    fireEvent.change(screen.getByLabelText("Find a venue"), { target: { value: "mal" } });
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Mall: 2 parts"]);
    expect(screen.getByText("1 of 2 venues shown.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Find a venue"), { target: { value: "zzz" } });
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
    expect(screen.getByText("No venue matches the choices above.")).toBeTruthy();
  });
  it("orders the venues by name", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Venue name" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Hall: 3 parts", "Mall: 2 parts"]);
  });
  it("shows only venues that list the part kinds chosen", () => {
    render(<VenueGroups places={list} locale="en" />);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: "Lists an elevator" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Hall: 3 parts"]);
    fireEvent.click(screen.getByRole("checkbox", { name: "Lists an elevator" }));
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(2);
    fireEvent.click(screen.getByRole("checkbox", { name: "Lists a ramp" }));
    expect(screen.queryByRole("heading", { level: 3 })).toBeNull();
  });
  it("keeps the save of text to the venues shown and the CSV to every venue", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<VenueGroups places={list} locale="en" onSave={onSave} />);
    open();
    fireEvent.change(screen.getByLabelText("Find a venue"), { target: { value: "mal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the venues as text (.txt)" }));
    fireEvent.click(screen.getByRole("button", { name: /spreadsheet/ }));
    expect(onSave.mock.calls[0]![0].content).toContain("Mall: 2 parts");
    expect(onSave.mock.calls[0]![0].content).not.toContain("Hall: 3 parts");
    expect(onSave.mock.calls[1]![0].content).toContain("Hall,Main place");
  });
  it("labels the part kinds and the find box in French", () => {
    render(<VenueGroups places={list} locale="fr" />);
    open("fr");
    expect(screen.getByLabelText("Trouver un lieu")).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Nomme une entrée" })).toBeTruthy();
    expect(screen.getByRole("checkbox", { name: "Nomme un ascenseur" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Nom du lieu" }));
    fireEvent.change(screen.getByLabelText("Trouver un lieu"), { target: { value: "zzz" } });
    expect(screen.getByText("Aucun lieu ne correspond aux choix ci-dessus.")).toBeTruthy();
  });
  it("says so and offers no filter or save when no places share a name", () => {
    render(<VenueGroups places={[at("a", "One", LAT, LON), at("b", "Two", LAT, LON)]} locale="en" />);
    open();
    expect(screen.getByText("No listed places share a venue name.")).toBeTruthy();
    expect(screen.queryByRole("checkbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Save/ })).toBeNull();
  });
  it("saves the shown venues as text and every venue as CSV, and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<VenueGroups places={list} locale="en" onSave={onSave} />);
    open();
    fireEvent.click(screen.getByRole("checkbox", { name: /different wheelchair tags/ }));
    fireEvent.click(screen.getByRole("button", { name: "Save the venues as text (.txt)" }));
    expect(onSave.mock.calls[0]![0]).toMatchObject({ name: "venues-by-name.txt" });
    expect(onSave.mock.calls[0]![0].content).toContain("Hall: 3 parts");
    expect(onSave.mock.calls[0]![0].content).not.toContain("Mall: 2 parts");
    expect(document.querySelector("[data-venue-groups-status]")?.textContent).toBe("Saved venues-by-name.txt.");
    fireEvent.click(screen.getByRole("button", { name: "Save the venues as a spreadsheet (CSV)" }));
    expect(onSave.mock.calls[1]![0].name).toBe("venues-by-name.csv");
    expect(onSave.mock.calls[1]![0].content).toContain("Mall");
  });
  it("says so when saving fails or throws", () => {
    for (const onSave of [() => false, () => { throw new Error("x"); }]) {
      const { unmount } = render(<VenueGroups places={list} locale="en" onSave={onSave} />);
      open();
      fireEvent.click(screen.getByRole("button", { name: /spreadsheet/ }));
      expect(document.querySelector("[data-venue-groups-status]")?.textContent).toBe("This browser cannot save a file here.");
      unmount();
    }
  });
  it("updates when the places change while open", () => {
    const { rerender } = render(<VenueGroups places={list} locale="en" />);
    open();
    rerender(<VenueGroups places={[list[3]!, list[4]!]} locale="en" />);
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Mall: 2 parts"]);
  });
  it("is French with French part names, typography and the token UNKNOWN", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    const { container } = render(<VenueGroups places={list} locale="fr" onSave={onSave} />);
    open("fr");
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(["Hall\u00a0: 3 parties", "Mall\u00a0: 2 parties"]);
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toContain("Lieu principal");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les lieux comme texte (.txt)" }));
    expect(onSave.mock.calls[0]![0].name).toBe("lieux-par-nom.txt");
    expect(document.querySelector("[data-venue-groups-status]")?.textContent).toBe("Fichier lieux-par-nom.txt enregistré.");
    expect(container.textContent).not.toMatch(/INCONN/i);
    for (const p of container.querySelectorAll("p")) expect(lintFrench(p.textContent ?? ""), p.textContent ?? "").toEqual([]);
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations closed and open, in ${locale === "en" ? "English" : "French"}`, async () => {
      const { container } = render(<VenueGroups places={[...list, ...varied(4, 8)]} locale={locale} />);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
});
