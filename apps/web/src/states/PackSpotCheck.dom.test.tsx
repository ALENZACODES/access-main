/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackSpotCheck } from "./PackSpotCheck";
import type { SavedFile } from "./downloadFile";
import { type PackPlaceRecord } from "./packPlaces";
import { place, varied } from "./placeFixtures";
import { parseCsv } from "./csvParse";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);

const pack = varied(17, 60);
const OPEN = { en: "Make a spot-check sheet to fill in while you look", fr: "Préparer une feuille d’observation à remplir sur place" } as const;

function show(over: { places?: PackPlaceRecord[]; locale?: "en" | "fr"; onSave?: (f: SavedFile) => boolean; open?: boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const view = render(<PackSpotCheck places={over.places ?? pack} locale={locale} today="2026-11-21" onSave={over.onSave} />);
  if (over.open !== false) fireEvent.click(screen.getByRole("button", { name: OPEN[locale] }));
  return { ...view, locale };
}
const picked = () => within(document.querySelector("[data-spot-result]") as HTMLElement).queryAllByRole("listitem").map((li) => li.textContent);
const seedBox = () => screen.getByLabelText("Seed") as HTMLInputElement;

describe("opening", () => {
  it("is closed by default and adds no heading", () => {
    show({ open: false });
    const b = screen.getByRole("button", { name: OPEN.en });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(screen.queryByLabelText("Seed")).toBeNull();
  });
  it("opens and closes, still without a heading", () => {
    show();
    expect(screen.getByLabelText("Seed")).toBeTruthy();
    expect(screen.queryByRole("heading")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Hide the spot-check sheet" }));
    expect(screen.queryByLabelText("Seed")).toBeNull();
  });
});

describe("the list", () => {
  it("shows five places by default, each with the tag the pack reports", () => {
    show();
    const items = picked();
    expect(items).toHaveLength(5);
    for (const t of items) expect(t).toMatch(/\((Yes|Limited|No|Designated|UNKNOWN)\)$/);
    expect(screen.getByText("5 places chosen from 60.")).toBeTruthy();
  });
  it("changes the count with the size", () => {
    show();
    fireEvent.click(screen.getByRole("radio", { name: "10" }));
    expect(picked()).toHaveLength(10);
    fireEvent.click(screen.getByRole("radio", { name: "3" }));
    expect(picked()).toHaveLength(3);
    expect(screen.getByText("3 places chosen from 60.")).toBeTruthy();
  });
  it("is the same list every time for the same places and seed", () => {
    show();
    const first = picked();
    cleanup();
    show();
    expect(picked()).toEqual(first);
  });
  it("starts from today's date and says so", () => {
    show();
    expect(seedBox().value).toBe("");
    expect(screen.getByText(/Left blank, it is today’s date \(2026-11-21\)\./)).toBeTruthy();
  });
  it("gives another list for another seed, and the first again when the seed goes back", () => {
    show();
    const a = picked();
    fireEvent.change(seedBox(), { target: { value: "another seed" } });
    const b = picked();
    expect(b).not.toEqual(a);
    fireEvent.change(seedBox(), { target: { value: "" } });
    expect(picked()).toEqual(a);
  });
  it("draws a different list on request, and a seed edit starts again from the seed", () => {
    show();
    const a = picked();
    fireEvent.click(screen.getByRole("button", { name: "Draw a different list" }));
    const b = picked();
    expect(b).not.toEqual(a);
    fireEvent.click(screen.getByRole("button", { name: "Draw a different list" }));
    expect(picked()).not.toEqual(b);
    fireEvent.change(seedBox(), { target: { value: "x" } });
    fireEvent.change(seedBox(), { target: { value: "" } });
    expect(picked()).toEqual(a);
  });
  it("cuts a seed that is too long", () => {
    show();
    fireEvent.change(seedBox(), { target: { value: "x".repeat(200) } });
    expect(seedBox().value.length).toBe(60);
  });
  it("turns the balanced draw off and on", () => {
    show();
    const box = screen.getByRole("checkbox", { name: /Take places in turn from each wheelchair tag/ }) as HTMLInputElement;
    expect(box.checked).toBe(true);
    const balanced = picked();
    fireEvent.click(box);
    expect(box.checked).toBe(false);
    expect(picked()).not.toEqual(balanced);
    fireEvent.click(box);
    expect(picked()).toEqual(balanced);
  });
  it("says how the picks are spread over the tags", () => {
    show();
    expect(screen.getByText(/^By the tag the pack reports: /)).toBeTruthy();
  });
  it("says there are no places, with no list or buttons, when none are on screen", () => {
    show({ places: [] });
    expect(screen.getByText("There are no places to choose from.")).toBeTruthy();
    expect(picked()).toEqual([]);
    expect(screen.queryByRole("button", { name: /Save the sheet/ })).toBeNull();
  });
  it("says so when fewer places than asked for are on screen", () => {
    show({ places: pack.slice(0, 2) });
    expect(screen.getByText("Only 2 places to choose from, so all of them are on the sheet.")).toBeTruthy();
    expect(picked()).toHaveLength(2);
  });
  it("shows UNKNOWN for a place with no name", () => {
    show({ places: [place("n1", { name: null })] });
    expect(picked()).toEqual(["UNKNOWN (Yes)"]);
  });
  it("follows the places on screen", () => {
    const { rerender } = show();
    const before = picked();
    rerender(<PackSpotCheck places={pack.slice(30)} locale="en" today="2026-11-21" />);
    expect(picked()).not.toEqual(before);
  });
});

describe("saving", () => {
  it("saves the page, the text and the CSV, each with its own name and type", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the sheet to print (web page)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the sheet (text)" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the sheet (CSV)" }));
    const [html, text, csv] = onSave.mock.calls.map((c) => c[0]);
    expect([html!.name, text!.name, csv!.name]).toEqual(["spot-check-sheet.html", "spot-check-sheet.txt", "spot-check-sheet.csv"]);
    expect(html!.mime).toBe("text/html;charset=utf-8");
    expect(text!.mime).toBe("text/plain;charset=utf-8");
    expect(csv!.mime).toBe("text/csv;charset=utf-8");
    expect(html!.content).toContain("<!DOCTYPE html>");
    expect(text!.content).toContain("Spot-check sheet: 5 places");
    expect(csv!.content.startsWith("\uFEFF")).toBe(true);
    expect(screen.getByText("Saved spot-check-sheet.csv.")).toBeTruthy();
  });
  it("saves the same places the list shows, in the same order", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    const names = picked().map((t) => t!.replace(/ \([^)]*\)$/, ""));
    fireEvent.click(screen.getByRole("button", { name: "Save the sheet (CSV)" }));
    const parsed = parseCsv(onSave.mock.calls[0]![0].content.replace(/^\uFEFF/, ""));
    expect(parsed.ok).toBe(true);
    if (parsed.ok) expect(parsed.rows.slice(1).map((r) => r[2])).toEqual(names);
  });
  it("saves a sheet that carries the seed and a drawn-again seed", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    fireEvent.change(seedBox(), { target: { value: "my seed" } });
    fireEvent.click(screen.getByRole("button", { name: "Draw a different list" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the sheet (text)" }));
    expect(onSave.mock.calls[0]![0].content).toContain("Seed: my seed#2");
  });
  it("says so when the file cannot be saved, or saving throws", () => {
    const { unmount } = show({ onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the sheet (text)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
    unmount();
    show({ onSave: () => { throw new Error("blocked"); } });
    fireEvent.click(screen.getByRole("button", { name: "Save the sheet (text)" }));
    expect(screen.getByText("This browser cannot save a file here.")).toBeTruthy();
  });
  it("writes nothing to storage", () => {
    const before = JSON.stringify({ ...localStorage });
    show({ onSave: () => true });
    fireEvent.change(seedBox(), { target: { value: "s" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the sheet (text)" }));
    expect(JSON.stringify({ ...localStorage })).toBe(before);
  });
});

describe("in French", () => {
  it("uses French words, names and punctuation", () => {
    show({ locale: "fr" });
    expect(screen.getByRole("radio", { name: "10" })).toBeTruthy();
    expect(screen.getByLabelText("Valeur de départ")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tirer une autre liste" })).toBeTruthy();
    expect(screen.getByText(/^5 lieux choisis parmi 60\.$/)).toBeTruthy();
    for (const el of document.querySelectorAll("p, button, label, legend, span.check-label, span.field-help")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    expect(document.querySelector("[data-spot-check]")!.getAttribute("lang")).toBe("fr");
  });
  it("saves files with French names", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ locale: "fr", onSave });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la feuille (CSV)" }));
    expect(onSave.mock.calls[0]![0].name).toBe("feuille-d-observation-sur-place.csv");
  });
});

describe("accessibility", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations when open with a list (${locale})`, async () => {
      const { container } = show({ locale });
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
  it("has no axe violations when closed or with no places", async () => {
    const closed = show({ open: false });
    expect((await axe.run(closed.container, axeRules)).violations).toEqual([]);
    closed.unmount();
    const empty = show({ places: [] });
    expect((await axe.run(empty.container, axeRules)).violations).toEqual([]);
  });
  it("announces the count as a status and numbers the list", () => {
    show();
    expect(screen.getByRole("status").textContent).toContain("chosen from 60");
    expect(document.querySelector("[data-spot-result] ol")).not.toBeNull();
  });
  it("groups the save buttons under a label", () => {
    show();
    expect(screen.getByRole("group", { name: "Save the sheet" })).toBeTruthy();
  });
});
