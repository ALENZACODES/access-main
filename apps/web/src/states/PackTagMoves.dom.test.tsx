/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import type { SavedFile } from "./downloadFile";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { MAX_LISTED_MOVED, PackTagMoves } from "./PackTagMoves";
import { lintCopy } from "./copyLint";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const now = (id: string, wheelchair: string | undefined): PackPlaceRecord =>
  parsePackPlaces([{ id, name: `Place ${id}`, wheelchair, category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM }]).places[0]!;
const before = (id: string, tag: EarlierPlace["tag"]): EarlierPlace => ({ id, name: `Place ${id}`, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag, source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null });

const sample = () => diffPacks([before("a", "yes"), before("b", "yes"), before("c", "unknown"), before("gone", "no")], [now("a", "limited"), now("b", "limited"), now("c", "yes"), now("fresh", undefined)]);

function show(d = sample(), locale: "en" | "fr" = "en", onSave: (f: SavedFile) => boolean = () => true) {
  document.documentElement.lang = locale;
  return render(<PackTagMoves diff={d} locale={locale} today={TODAY} onSave={onSave} />);
}
const cell = (key: string) => document.querySelector(`[data-move="${key}"]`) as HTMLElement;
const savedLine = () => (document.querySelector("[data-moves-saved]") as HTMLElement).textContent;

afterEach(cleanup);

describe("PackTagMoves when nothing moved", () => {
  it("renders nothing", () => {
    const { container } = show(diffPacks([before("a", "yes")], [now("a", "yes")]));
    expect(container.innerHTML).toBe("");
  });
  it("renders nothing for two empty lists", () => {
    expect(show(diffPacks([], [])).container.innerHTML).toBe("");
  });
});

describe("PackTagMoves structure", () => {
  it("has no heading of its own, because the comparison above it owns the page's heading", () => {
    show();
    expect(screen.queryAllByRole("heading")).toEqual([]);
  });
  it("is a named region with the title, summary, added/removed line and the note", () => {
    show();
    const region = screen.getByRole("region", { name: "How wheelchair tags changed" });
    expect(region.getAttribute("lang")).toBe("en");
    expect(within(region).getByText(/^3 places changed their wheelchair tag:/)).toBeTruthy();
    expect(within(region).getByText("1 place added; 1 place no longer listed.")).toBeTruthy();
    expect(within(region).getByText(/is not a rating of the place/)).toBeTruthy();
  });
  it("has one captioned table of six columns and six rows plus the header", () => {
    show();
    const table = screen.getByRole("table", { name: /Places by wheelchair tag/ });
    expect(within(table).getAllByRole("row")).toHaveLength(7);
    expect(within(table).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Earlier file", "Yes", "Limited", "No", "Designated", "UNKNOWN", "Not listed now"]);
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Yes", "Limited", "No", "Designated", "UNKNOWN", "Not in the earlier file"]);
  });
  it("shows a dash on the diagonal and a plain 0 where nothing moved", () => {
    show();
    expect(screen.getAllByText("–")).toHaveLength(6);
    expect(cell("yes>no").textContent).toBe("0");
    expect(within(cell("yes>no")).queryAllByRole("button")).toEqual([]);
  });
  it("shows the counts as buttons that say what they list", () => {
    show();
    const button = within(cell("yes>limited")).getByRole("button");
    expect(button.textContent).toBe("2");
    expect(button.getAttribute("aria-label")).toBe("Yes to Limited: 2. List these places.");
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
  it("puts the places that were added in the absent row and those removed in the absent column", () => {
    show();
    expect(within(cell("absent>UNKNOWN".replace("UNKNOWN", "unknown"))).getByRole("button").textContent).toBe("1");
    expect(within(cell("no>absent")).getByRole("button").textContent).toBe("1");
  });
  it("has the save buttons in a named group and an empty polite line", () => {
    show();
    const group = screen.getByRole("group", { name: "Save the tag changes" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Save the tag changes (CSV)", "Save the tag changes (text)"]);
    expect(savedLine()).toBe("");
    expect((document.querySelector("[data-moves-saved]") as HTMLElement).getAttribute("aria-live")).toBe("polite");
  });
});

describe("choosing a cell", () => {
  it("lists the places in the cell, by name, and presses the button", () => {
    show();
    fireEvent.click(within(cell("yes>limited")).getByRole("button"));
    expect(screen.getByText("Yes to Limited")).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Place a", "Place b"]);
    expect(within(cell("yes>limited")).getByRole("button").getAttribute("aria-pressed")).toBe("true");
  });
  it("puts the list away when the same cell is pressed again", () => {
    show();
    const button = within(cell("yes>limited")).getByRole("button");
    fireEvent.click(button);
    fireEvent.click(button);
    expect(screen.queryAllByRole("listitem")).toEqual([]);
    expect(button.getAttribute("aria-pressed")).toBe("false");
  });
  it("moves the list to another cell, and only one cell is pressed at a time", () => {
    show();
    fireEvent.click(within(cell("yes>limited")).getByRole("button"));
    fireEvent.click(within(cell("unknown>yes")).getByRole("button"));
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Place c"]);
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1);
  });
  it("names a place with no name as UNKNOWN", () => {
    const d = diffPacks([{ ...before("a", "yes"), name: null }], [parsePackPlaces([{ id: "a", name: "", wheelchair: "no", category: "cafe", address: "x", lat: 43.65, lon: -79.38, provenance: OSM }]).places[0]!]);
    show(d);
    fireEvent.click(within(cell("yes>no")).getByRole("button"));
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["UNKNOWN"]);
  });
  it(`lists at most ${MAX_LISTED_MOVED} names and says the file has the rest`, () => {
    const total = MAX_LISTED_MOVED + 7;
    const ids = Array.from({ length: total }, (_, i) => `p${String(i).padStart(3, "0")}`);
    show(diffPacks(ids.map((id) => before(id, "yes")), ids.map((id) => now(id, "no"))));
    fireEvent.click(within(cell("yes>no")).getByRole("button"));
    expect(screen.getAllByRole("listitem")).toHaveLength(MAX_LISTED_MOVED);
    expect(screen.getByText("Only the first places are listed. Save the file to see them all.")).toBeTruthy();
  });
  it("does not say the list is cut when it fits", () => {
    show();
    fireEvent.click(within(cell("yes>limited")).getByRole("button"));
    expect(screen.queryByText(/Only the first places/)).toBeNull();
  });
  it("starts again with nothing chosen when it is shown a different comparison", () => {
    const { rerender } = show();
    fireEvent.click(within(cell("yes>limited")).getByRole("button"));
    rerender(<PackTagMoves diff={sample()} locale="en" today={TODAY} onSave={() => true} />);
    expect(screen.getAllByRole("listitem").length).toBeGreaterThan(0);
  });
});

describe("saving", () => {
  it("hands the CSV, with a byte order mark and the English file name, to onSave", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show(sample(), "en", onSave);
    fireEvent.click(screen.getByRole("button", { name: "Save the tag changes (CSV)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe("tag-changes.csv");
    expect(file.mime).toBe("text/csv;charset=utf-8");
    expect(file.content.startsWith("\uFEFFfrom,to,places,place_ids")).toBe(true);
    expect(savedLine()).toBe("Saved tag-changes.csv.");
  });
  it("hands the text, ending with the OpenStreetMap credit, to onSave", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show(sample(), "en", onSave);
    fireEvent.click(screen.getByRole("button", { name: "Save the tag changes (text)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.mime).toBe("text/plain;charset=utf-8");
    expect(file.content.endsWith("\n© OpenStreetMap contributors\n")).toBe(true);
    expect(file.content).toContain("Date: 2026-11-19");
  });
  it("says so, and does not say it saved, when the browser cannot", () => {
    show(sample(), "en", () => false);
    fireEvent.click(screen.getByRole("button", { name: "Save the tag changes (CSV)" }));
    expect(savedLine()).toBe("This browser cannot save a file here.");
  });
  it("says so when saving throws", () => {
    show(sample(), "en", () => {
      throw new Error("nope");
    });
    fireEvent.click(screen.getByRole("button", { name: "Save the tag changes (text)" }));
    expect(savedLine()).toBe("This browser cannot save a file here.");
  });
  it("saves in French with the French file name", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show(sample(), "fr", onSave);
    fireEvent.click(screen.getAllByRole("button").find((b) => /\(CSV\)/.test(b.textContent ?? ""))!);
    expect(onSave.mock.calls[0]![0].name).toBe("changements-d-indication.csv");
    expect(savedLine()).toBe("Fichier changements-d-indication.csv enregistré.");
  });
});

describe("in French", () => {
  it("sets the language, the title and the table in French, with UNKNOWN kept", () => {
    show(sample(), "fr");
    const region = document.querySelector("[data-tag-moves]") as HTMLElement;
    expect(region.getAttribute("lang")).toBe("fr");
    expect(region.textContent).toContain("Comment les indications pour fauteuil roulant ont changé");
    expect(within(region).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Oui", "Limité", "Non", "Réservé", "UNKNOWN", "Absent du fichier précédent"]);
    expect(region.textContent).not.toMatch(/INCONNU/i);
  });
  it("labels a count button in French with a no-break space before the colon", () => {
    show(sample(), "fr");
    expect(within(cell("yes>limited")).getByRole("button").getAttribute("aria-label")).toBe("Oui vers Limité\u00a0: 2. Lister ces lieux.");
  });
  it("passes the French typography check on everything it shows", () => {
    show(sample(), "fr");
    const text = (document.querySelector("[data-tag-moves]") as HTMLElement).textContent ?? "";
    expect(lintFrench(text)).toEqual([]);
  });
});

describe("copy and accessibility", () => {
  it("has no banned words and no organisation name, in either language", () => {
    for (const locale of ["en", "fr"] as const) {
      show(sample(), locale);
      const text = (document.querySelector("[data-tag-moves]") as HTMLElement).textContent ?? "";
      expect(lintCopy(text, locale), locale).toEqual([]);
      expect(containsForbiddenOrg(text), locale).toBe(false);
      cleanup();
    }
  });
  it("has no axe violations closed, open or with a cell chosen, in either language", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show(sample(), locale);
      expect((await axe.run(container, axeRules)).violations, `${locale} closed`).toEqual([]);
      fireEvent.click(within(cell("yes>limited")).getByRole("button"));
      expect((await axe.run(container, axeRules)).violations, `${locale} open`).toEqual([]);
      cleanup();
    }
  });
});
