/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import type { SavedFile } from "./downloadFile";
import { PackReport } from "./PackReport";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const place = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Place ${id}`, wheelchair: "yes", lat: 43.65 + id.charCodeAt(0) * 0.01, lon: -79.38, provenance: OSM, ...over });
const shipped = (JSON.parse(contentText) as { places: unknown[] }).places;
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const messy = [place("a"), place("b", { name: "" }), place("c", { provenance: { ...OSM, licence: "All-rights-reserved" } }), place("d", { name: "Hall", lat: 43.65 }), place("e", { name: "hall", lat: 43.65 })];

afterEach(cleanup);

function show(places: unknown, locale: "en" | "fr" = "en", onSave?: (f: SavedFile) => boolean) {
  document.documentElement.lang = locale;
  return render(<PackReport places={places} locale={locale} today={TODAY} onSave={onSave} />);
}
const press = (name: string | RegExp) => fireEvent.click(screen.getByRole("button", { name }));

describe("PackReport content", () => {
  it("shows nothing for no places or a pack that is not a list", () => {
    for (const input of [null, [], "x", {}]) {
      const { container } = show(input);
      expect(container.innerHTML, String(input)).toBe("");
      cleanup();
    }
  });
  it("has one h2, names the result and lists what the records cover", () => {
    show([place("a"), place("b")]);
    expect(screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent)).toEqual(["About the saved places"]);
    expect(screen.getByText(/No problem found in 2 entries\./)).toBeTruthy();
    expect(screen.getByText("2 places in the pack.")).toBeTruthy();
    expect(screen.getByText(/Wheelchair tag reported with a source: 2 \/ 2 \(100%\)/)).toBeTruthy();
  });
  it("marks the section with its level", () => {
    const { container, rerender } = show([place("a")]);
    expect(container.querySelector("[data-pack-report]")?.getAttribute("data-pack-report")).toBe("clean");
    rerender(<PackReport places={[place("a", { name: "" })]} locale="en" today={TODAY} />);
    expect(container.querySelector("[data-pack-report]")?.getAttribute("data-pack-report")).toBe("gaps");
    rerender(<PackReport places={messy} locale="en" today={TODAY} />);
    expect(container.querySelector("[data-pack-report]")?.getAttribute("data-pack-report")).toBe("problems");
  });
  it("lists problems and gaps in a collapsed disclosure with severity and record ids", () => {
    show(messy);
    const summary = screen.getByText("Problems and gaps found");
    const details = summary.closest("details")!;
    expect(details.open).toBe(false);
    const items = within(details).getAllByRole("listitem", { hidden: true });
    expect(items.map((i) => i.getAttribute("data-severity"))).toEqual(["error", "error", "warning"]);
    expect(items[0]!.textContent).toContain("Needs attention");
    expect(items[0]!.textContent).toContain("Records: c");
    expect(items[2]!.textContent).toContain("Records: b");
  });
  it("lists possible duplicates and says nothing is merged", () => {
    show(messy);
    expect(screen.getByText("1 possible pair of places with the same name close together.")).toBeTruthy();
    expect(screen.getByText("Nothing is merged or hidden.", { exact: false })).toBeTruthy();
    expect(screen.getByText("d and e, 0 m apart")).toBeTruthy();
  });
  it("shows no problem or duplicate disclosure for a clean pack", () => {
    show([place("a"), place("b")]);
    expect(screen.queryByText("Problems and gaps found")).toBeNull();
    expect(screen.queryByText(/possible pair/)).toBeNull();
  });
  it("shows record ids and names as text, never as markup", () => {
    const { container } = show([place("a", { name: "<img src=x onerror=alert(1)>" }), place("<b>", { name: "" })]);
    expect(container.querySelector("img")).toBeNull();
    expect(container.querySelector("b")).toBeNull();
  });
});

describe("PackReport far positions and gaps", () => {
  const nearby = Array.from({ length: 5 }, (_, i) => place(`n${i}`, { lat: 43.65 + i * 0.001, address: "1 Main Street", category: "cafe" }));
  it("lists a position far from the rest and says it is not moved or hidden", () => {
    show([...nearby, place("far", { lat: 60, lon: -100, address: "1 Main Street", category: "cafe" })]);
    const summary = screen.getByText("1 position is more than 50 km from the middle of the pack.", { selector: "summary" });
    const details = summary.closest("details")!;
    expect(within(details).getByText(/not moved or hidden/)).toBeTruthy();
    expect(within(details).getAllByRole("listitem", { hidden: true })[0]!.textContent).toMatch(/^far, \d+ km away$/);
  });
  it("lists what each kind leaves out", () => {
    show([place("a", { category: "cafe", address: "" }), place("b", { category: "cafe", name: "", address: "1 Main Street" })]);
    const details = screen.getByText("What each kind of place leaves out", { selector: "summary" }).closest("details")!;
    expect(within(details).getAllByRole("listitem", { hidden: true }).map((li) => li.textContent)).toEqual(["cafe (2 records): 1 with no name, 1 with no address"]);
  });
  it("shows neither disclosure when nothing is far and nothing is missing", () => {
    show(nearby);
    expect(screen.queryByText(/from the middle of the pack/)).toBeNull();
    expect(screen.queryByText("What each kind of place leaves out")).toBeNull();
  });
  it("is in French with the colon spaced", () => {
    show([place("a", { category: "cafe", address: "" })], "fr");
    const details = screen.getByText("Ce que chaque type de lieu laisse de côté", { selector: "summary" }).closest("details")!;
    expect(within(details).getAllByRole("listitem", { hidden: true })[0]!.textContent).toBe("cafe (1 fiche)\u00a0: 1 sans adresse");
  });
});

describe("PackReport files", () => {
  it("saves the places as CSV with the language's file name and a byte order mark", () => {
    const save = vi.fn<(file: SavedFile) => boolean>(() => true);
    show([place("a")], "en", save);
    press("Save the places (CSV)");
    const file = save.mock.calls[0]![0];
    expect(file.name).toBe("pack-places.csv");
    expect(file.mime).toBe("text/csv;charset=utf-8");
    expect(file.content.charCodeAt(0)).toBe(0xfeff);
    expect(file.content).toContain("\r\n");
    expect(screen.getByRole("status").textContent).toBe("Saved pack-places.csv.");
  });
  it("saves the report as text and the problems as CSV", () => {
    const save = vi.fn<(file: SavedFile) => boolean>(() => true);
    show(messy, "en", save);
    press("Save this report (text)");
    press("Save the problems (CSV)");
    const [text, csv] = save.mock.calls.map((c) => c[0]);
    expect([text!.name, csv!.name]).toEqual(["pack-report.txt", "pack-issues.csv"]);
    expect(text!.content).toContain("Report on the places saved on this device");
    expect(csv!.content).toContain("missing-name,warning,2,b");
    expect(screen.getByRole("status").textContent).toBe("Saved pack-issues.csv.");
  });
  it("offers no problems file when there is no problem", () => {
    show([place("a")]);
    expect(screen.queryByRole("button", { name: "Save the problems (CSV)" })).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
  it("says so when the browser cannot save, and does not claim the file was saved", () => {
    show([place("a")], "en", () => false);
    press("Save this report (text)");
    expect(screen.getByRole("status").textContent).toBe("This browser could not save the file.");
  });
  it("offers no places file when no record could be read", () => {
    show([null, 5]);
    expect(screen.queryByRole("button", { name: "Save the places (CSV)" })).toBeNull();
    expect(screen.getByRole("button", { name: "Save the problems (CSV)" })).toBeTruthy();
  });
  it("starts with an empty status and keeps the status region in the page", () => {
    show([place("a")]);
    expect(screen.getByRole("status").textContent).toBe("");
  });
  it("puts the buttons in a named group", () => {
    show([place("a")]);
    expect(screen.getByRole("group", { name: "Save a file" })).toBeTruthy();
  });
});

describe("PackReport in French", () => {
  it("uses French labels, file names and the UNKNOWN token", () => {
    const save = vi.fn<(file: SavedFile) => boolean>(() => true);
    show(messy, "fr", save);
    expect(screen.getByRole("heading", { level: 2, name: "À propos des lieux enregistrés" })).toBeTruthy();
    press("Enregistrer les lieux (CSV)");
    press("Enregistrer ce rapport (texte)");
    press("Enregistrer les problèmes (CSV)");
    expect(save.mock.calls.map((c) => c[0].name)).toEqual(["lieux-du-pack.csv", "rapport-du-pack.txt", "problemes-du-pack.csv"]);
    expect(screen.getByRole("status").textContent).toBe("problemes-du-pack.csv enregistré.");
  });
  it("has clean French typography in everything it shows", () => {
    const { container } = show(messy, "fr");
    for (const node of container.querySelectorAll("p, li, summary, button, h2")) {
      const text = node.textContent ?? "";
      expect(lintFrench(text), text).toEqual([]);
    }
    expect(container.textContent).not.toMatch(/INCONNU/);
  });
  it("sets the language on the section", () => {
    const { container } = show([place("a")], "fr");
    expect(container.querySelector("section")?.getAttribute("lang")).toBe("fr");
  });
});

describe("PackReport accessibility and the shipped pack", () => {
  it("has no axe violations in English or French, with problems showing", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show(messy, locale);
      container.querySelectorAll("details").forEach((d) => (d.open = true));
      expect((await axe.run(container, axeRules)).violations, locale).toEqual([]);
      cleanup();
    }
  });
  it("renders the pack shipped in this build with no error level", () => {
    const { container } = show(shipped);
    expect(container.querySelector("[data-pack-report]")?.getAttribute("data-pack-report")).not.toBe("problems");
  });
  it("gives every button a name and a 44 px target class", () => {
    show(messy);
    for (const b of screen.getAllByRole("button")) {
      expect(b.textContent?.trim().length).toBeGreaterThan(0);
      expect(b.className).toContain("btn");
    }
  });
});
