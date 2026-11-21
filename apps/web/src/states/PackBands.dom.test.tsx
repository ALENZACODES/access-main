/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackBands } from "./PackBands";
import type { BandKey } from "./packBands";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const FROM = { lat: 43.65, lon: -79.38 };
const R = 6_371_008.8;
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const at = (metres: number | null) => (metres === null ? {} : { lat: FROM.lat + ((metres / R) * 180) / Math.PI, lon: FROM.lon });
const mk = (id: string, metres: number | null, over: Record<string, unknown> = {}) => ({ id, name: id, wheelchair: "yes", provenance: OSM, ...at(metres), ...over });
const places: PackPlaceRecord[] = [...parsePackPlaces([mk("a", 100), mk("b", 120, { wheelchair: "no" }), mk("c", 300, { wheelchair: undefined }), mk("d", 800, { wheelchair: "limited" }), mk("e", null), mk("f", 9000)]).places];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

afterEach(cleanup);

interface Over {
  places?: PackPlaceRecord[];
  from?: typeof FROM | null;
  locale?: "en" | "fr";
  selected?: BandKey | null;
  onSelect?: (key: BandKey | null) => void;
  onSave?: (file: { name: string; mime: string; content: string }) => boolean;
}
function show(over: Over = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const onSelect = over.onSelect ?? vi.fn();
  const view = render(<PackBands places={over.places ?? places} from={over.from === undefined ? FROM : over.from} locale={locale} today={TODAY} selected={over.selected ?? null} onSelect={onSelect} onSave={over.onSave} />);
  return { ...view, onSelect };
}

describe("when it shows", () => {
  it("shows nothing without a starting point", () => {
    const { container } = show({ from: null });
    expect(container.innerHTML).toBe("");
  });
  it("shows nothing when no place passes the other filters", () => {
    const { container } = show({ places: [] });
    expect(container.innerHTML).toBe("");
  });
  it("is not a heading, so it does not sit among the place names", () => {
    show();
    expect(screen.queryAllByRole("heading")).toHaveLength(0);
    expect(screen.getByText("Places by distance")).toBeTruthy();
  });
  it("says what it counted and that distances are straight lines", () => {
    show();
    expect(screen.getByText("5 places measured in a straight line from the point you typed. 1 place has no map point (UNKNOWN distance).")).toBeTruthy();
    expect(screen.getByText(/straight-line distances, not a walking, rolling or driving route/)).toBeTruthy();
  });
});

describe("the table", () => {
  it("has a caption and a row header for every band", () => {
    show();
    const table = screen.getByRole("table", { name: "Places by straight-line distance and wheelchair tag" });
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual([
      "Under 250\u00a0m",
      "250\u00a0m to 500\u00a0m",
      "500\u00a0m to 1\u00a0km",
      "1\u00a0km to 2\u00a0km",
      "2\u00a0km to 5\u00a0km",
      "5\u00a0km or more",
      "No map point (UNKNOWN distance)",
    ]);
  });
  it("has the same column headers every time", () => {
    show();
    const table = screen.getByRole("table", { name: "Places by straight-line distance and wheelchair tag" });
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Distance", "Places", "Yes", "Limited", "No", "Designated", "UNKNOWN", "Tag reported with a source", "Show"]);
  });
  it("shows the counts under the right headers", () => {
    show();
    const row = screen.getByRole("row", { name: /^Under 250/ });
    expect(within(row).getAllByRole("cell").map((c) => c.textContent)).toEqual(["2", "1", "0", "1", "0", "0", "100%", "Show"]);
  });
  it("shows UNKNOWN as the share for a band with no places", () => {
    show();
    const row = screen.getByRole("row", { name: /^1 km to 2 km|^1\u00a0km to 2\u00a0km/ });
    expect(within(row).getAllByRole("cell")[6]!.textContent).toBe("UNKNOWN");
  });
  it("leaves the no-point row out when every place has a map point", () => {
    show({ places: places.filter((p) => p.location !== null) });
    expect(screen.queryByRole("rowheader", { name: /No map point/ })).toBeNull();
  });
  it("gives no button to a band with no places", () => {
    show();
    expect(screen.queryByRole("button", { name: /^Show 1.km to 2.km/ })).toBeNull();
    expect(screen.getAllByRole("button", { name: /^Show / }).length).toBe(5);
  });
});

describe("choosing a band", () => {
  it("names the band and its count in the button", () => {
    show();
    expect(screen.getByRole("button", { name: "Show Under 250\u00a0m (2)" })).toBeTruthy();
  });
  it("reports the band chosen", () => {
    const { onSelect } = show();
    fireEvent.click(screen.getByRole("button", { name: "Show 250\u00a0m to 500\u00a0m (1)" }));
    expect(onSelect).toHaveBeenCalledWith("250-500");
  });
  it("reports the no-point group by its own key", () => {
    const { onSelect } = show();
    fireEvent.click(screen.getByRole("button", { name: "Show No map point (UNKNOWN distance) (1)" }));
    expect(onSelect).toHaveBeenCalledWith("no-point");
  });
  it("marks the chosen band as pressed and current, and says one band is shown", () => {
    show({ selected: "lt250" });
    const button = screen.getByRole("button", { name: "Show Under 250\u00a0m (2)" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(button.textContent).toBe("Shown");
    expect(screen.getByRole("row", { name: /^Under 250/ }).getAttribute("aria-current")).toBe("true");
    expect(screen.getByText(/Showing one distance band\./)).toBeTruthy();
  });
  it("reports null when the chosen band is pressed again", () => {
    const { onSelect } = show({ selected: "lt250" });
    fireEvent.click(screen.getByRole("button", { name: "Show Under 250\u00a0m (2)" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
  it("offers a way back to every distance", () => {
    const { onSelect } = show({ selected: "lt250" });
    fireEvent.click(screen.getByRole("button", { name: "Show every distance" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
  it("says so when the chosen band has no place that passes the other filters, and still lets the person go back", () => {
    show({ selected: "1000-2000" });
    expect(screen.getByText(/No place in the chosen distance passes the other filters\./)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show every distance" })).toBeTruthy();
  });
  it("says what the no-point choice shows", () => {
    show({ selected: "no-point" });
    expect(screen.getByText(/Showing places with no map point\./)).toBeTruthy();
  });
  it("shows no choice note when every distance is shown", () => {
    show();
    expect(screen.queryByText(/Showing one distance band/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Show every distance" })).toBeNull();
  });
});

describe("the closest place for each tag", () => {
  it("sits under the table and uses the same places and starting point", () => {
    show();
    expect(screen.getByRole("table", { name: "Closest place by wheelchair tag" })).toBeTruthy();
    const row = screen.getByRole("row", { name: /^Yes/ });
    expect(within(row).getAllByRole("cell")[1]!.textContent).toBe("a");
  });
  it("reads the places in the list when they are given, not the ones the distance table counts", () => {
    render(<PackBands places={places} shown={places.slice(1, 2)} from={FROM} locale="en" today={TODAY} selected={null} onSelect={vi.fn()} />);
    const nearest = within(screen.getByRole("table", { name: "Closest place by wheelchair tag" }));
    expect(within(nearest.getByRole("row", { name: /^Yes/ })).getAllByRole("cell")[0]!.textContent).toBe("0");
    expect(within(nearest.getByRole("row", { name: /^No/ })).getAllByRole("cell")[1]!.textContent).toBe("b");
  });
  it("is not there when the distance table is not", () => {
    show({ from: null });
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("is left out of the saved files", () => {
    const onSave = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the distance table (text)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the distance table (CSV)" }));
    for (const [file] of onSave.mock.calls) expect(file.content).not.toMatch(/Closest place|120\u00a0m|Place with no name/);
  });
});

describe("saving", () => {
  it("saves the CSV with a byte order mark and says so", () => {
    const onSave = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the distance table (CSV)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe("places-by-distance.csv");
    expect(file.mime).toBe("text/csv;charset=utf-8");
    expect(file.content.startsWith("\uFEFFband,from_m,to_m,places,")).toBe(true);
    expect(screen.getByText("Saved places-by-distance.csv.")).toBeTruthy();
  });
  it("saves the text with the credit", () => {
    const onSave = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the distance table (text)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe("places-by-distance.txt");
    expect(file.content.trimEnd().endsWith("© OpenStreetMap contributors")).toBe(true);
  });
  it("saves the counts of the places it was given, not of some other set", () => {
    const onSave = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ onSave, places: places.slice(0, 2) });
    fireEvent.click(screen.getByRole("button", { name: "Save the distance table (CSV)" }));
    const rows = onSave.mock.calls[0]![0].content.replace("\uFEFF", "").trimEnd().split("\r\n");
    expect(rows[1]!.split(",")[3]).toBe("2");
  });
  it("says when the browser cannot save, including when saving throws", () => {
    show({ onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the distance table (CSV)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    cleanup();
    show({
      onSave: () => {
        throw new Error("blocked");
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save the distance table (text)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
  it("never puts the typed point in a saved file", () => {
    const onSave = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the distance table (CSV)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the distance table (text)" }));
    for (const [file] of onSave.mock.calls) {
      expect(file.content).not.toContain("43.65");
      expect(file.content).not.toContain("79.38");
    }
  });
});

describe("French", () => {
  it("reads in French with clean typography on every visible string", () => {
    const { container } = show({ locale: "fr", selected: "lt250" });
    expect(screen.getByText("Lieux par distance")).toBeTruthy();
    expect(screen.getByRole("rowheader", { name: "Moins de 250\u00a0m" })).toBeTruthy();
    expect(screen.getByText(/5 lieux mesurés en ligne droite depuis le point saisi\./)).toBeTruthy();
    for (const node of container.querySelectorAll("p, caption, th, button, span")) {
      if (node.children.length > 0) continue;
      expect(lintFrench(node.textContent ?? ""), node.textContent ?? "").toEqual([]);
    }
  });
  it("names the saved files in French", () => {
    const onSave = vi.fn<(file: { name: string; mime: string; content: string }) => boolean>(() => true);
    show({ locale: "fr", onSave });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le tableau des distances (CSV)" }));
    expect(onSave.mock.calls[0]![0].name).toBe("lieux-par-distance.csv");
    expect(screen.getByText("Fichier lieux-par-distance.csv enregistré.")).toBeTruthy();
  });
  it("sets the language on the section", () => {
    const { container } = show({ locale: "fr" });
    expect(container.querySelector("section")!.getAttribute("lang")).toBe("fr");
  });
});

describe("accessibility", () => {
  it("has no axe violations, in either language, with and without a band chosen", async () => {
    for (const locale of ["en", "fr"] as const) {
      for (const selected of [null, "lt250"] as const) {
        const { container } = show({ locale, selected });
        expect((await axe.run(container, axeRules)).violations, `${locale} ${selected}`).toEqual([]);
        cleanup();
      }
    }
  });
  it("uses only buttons for its controls, so each can be reached and pressed from the keyboard", () => {
    show({ selected: "lt250" });
    for (const el of screen.getAllByRole("button")) expect(el.tagName).toBe("BUTTON");
  });
  it("has a live region for the save status that is empty before anything is saved", () => {
    const { container } = show();
    const live = container.querySelector("[data-bands-saved]")!;
    expect(live.getAttribute("aria-live")).toBe("polite");
    expect(live.textContent).toBe("");
  });
});
