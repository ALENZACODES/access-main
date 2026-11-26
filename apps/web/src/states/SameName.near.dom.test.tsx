/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { SameName } from "./SameName";
import { findNearNames } from "./nearNames";
import { NEAR_NAMES_CSV_FILENAMES, nearNamesToCsv } from "./nearNamesCopy";
import { place } from "./placeFixtures";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const at = (id: string, name: string, lon = -79.4) => place(id, { name, lon });
const set = [at("a1", "Tim Hortons"), at("a2", "Tim Hortons", -79.3), at("b1", "Tim Horton", -79.2), at("c1", "Library", -79.1), at("c2", "Librory", -79.0), at("s", "Solo Bakery", -78.9)];

afterEach(cleanup);

function show(over: { places?: typeof set; locale?: "en" | "fr"; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  render(<SameName places={over.places ?? set} locale={locale} onSave={over.onSave ?? (() => true)} />);
  fireEvent.click(screen.getByRole("button", { name: /^(Show|Afficher) (places|les lieux)/ }));
}
const section = () => document.querySelector("[data-near-names]") as HTMLElement;
const summary = () => (document.querySelector("[data-near-names-summary]") as HTMLElement).textContent;

describe("the one-letter section", () => {
  it("is absent while closed and present once opened, under the list", () => {
    document.documentElement.lang = "en";
    render(<SameName places={set} locale="en" />);
    expect(document.querySelector("[data-near-names]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show places that share a name" }));
    expect(section()).toBeTruthy();
    const list = document.querySelector("[data-same-name-list]")!;
    expect(list.compareDocumentPosition(section()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
  it("lists each pair with its counts and the kind of difference", () => {
    show();
    expect(summary()).toBe("2 pairs of names are one letter apart.");
    const items = within(section()).getAllByRole("listitem").map((li) => li.textContent);
    expect(items).toContain("Tim Hortons (2 places) and Tim Horton (1 place): one letter more in the first.");
    expect(items).toContain("Library (1 place) and Librory (1 place): one letter different.");
  });
  it("says so when no names are one letter apart, and lists nothing", () => {
    show({ places: [at("a", "Alpha Hall"), at("b", "Alpha Hall", -79.3), at("c", "Beta Court")] });
    expect(summary()).toBe("No two names on screen are one letter apart.");
    expect(within(section()).queryAllByRole("listitem")).toEqual([]);
    expect(screen.queryByRole("button", { name: /one letter apart \(CSV\)/ })).toBeNull();
  });
  it("is independent of the size and tags choices", () => {
    show();
    fireEvent.click(screen.getByRole("radio", { name: "5 or more places" }));
    expect(summary()).toBe("2 pairs of names are one letter apart.");
  });
  it("has a level-four heading and no skipped level", async () => {
    show();
    expect(within(section()).getByRole("heading", { level: 4, name: "Names that are one letter apart" })).toBeTruthy();
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
  it("shows ten pairs at most and says how many are left", () => {
    const names: string[] = [];
    for (let i = 0; i < 14; i++) {
      const base = `Brand${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}`;
      names.push(base, `${base}x`);
    }
    show({ places: names.map((n, i) => at(`p${i}`, n, -79.4 + i * 0.01)) });
    expect(within(section()).getAllByRole("listitem")).toHaveLength(10);
    expect((document.querySelector("[data-near-names-more]") as HTMLElement).textContent).toBe("4 more pairs are not shown. Save the file to see all of them.");
  });
});

describe("the boundary of the on-screen list", () => {
  const pairs = (n: number) => Array.from({ length: n }, (_, i) => [`Brand${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}`, `Brand${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}x`]).flat().map((n, i) => at(`p${i}`, n, -79.4 + i * 0.01));
  it("exactly ten pairs show all ten and no more-note", () => {
    show({ places: pairs(10) });
    expect(within(section()).getAllByRole("listitem")).toHaveLength(10);
    expect(document.querySelector("[data-near-names-more]")).toBeNull();
  });
  it("eleven pairs show ten and a note for one", () => {
    show({ places: pairs(11) });
    expect(within(section()).getAllByRole("listitem")).toHaveLength(10);
    expect((document.querySelector("[data-near-names-more]") as HTMLElement).textContent).toBe("1 more pair is not shown. Save the file to see all of them.");
  });
});

describe("the one-letter file", () => {
  it("saves every pair as CSV, whatever is shown", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the names one letter apart (CSV)" }));
    const f = onSave.mock.calls[0]![0];
    expect(f.name).toBe(NEAR_NAMES_CSV_FILENAMES.en);
    expect(f.mime).toBe("text/csv;charset=utf-8");
    expect(f.content).toBe(nearNamesToCsv(findNearNames(set), "en"));
    expect((document.querySelector("[data-same-name-status]") as HTMLElement).textContent).toBe(`Saved ${NEAR_NAMES_CSV_FILENAMES.en}.`);
  });
  it("saves all pairs when only ten are shown", () => {
    const names: string[] = [];
    for (let i = 0; i < 14; i++) {
      const base = `Brand${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}`;
      names.push(base, `${base}x`);
    }
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ places: names.map((n, i) => at(`p${i}`, n, -79.4 + i * 0.01)), onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the names one letter apart (CSV)" }));
    expect(onSave.mock.calls[0]![0].content.split("\r\n").filter(Boolean)).toHaveLength(15);
  });
  it("reports a failed save", () => {
    show({ onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the names one letter apart (CSV)" }));
    expect((document.querySelector("[data-same-name-status]") as HTMLElement).textContent).toBe("This browser cannot save a file here.");
  });
});

describe("the one-letter section in French", () => {
  it("is in French and passes lintFrench", () => {
    show({ locale: "fr" });
    const lines = [...section().querySelectorAll("h4, p, li")].map((e) => e.textContent ?? "");
    expect(lines.length).toBeGreaterThan(4);
    for (const s of lines) expect(lintFrench(s), s).toEqual([]);
    expect(summary()).toBe("2 paires de noms diffèrent d’une lettre.");
    expect(screen.getByRole("button", { name: "Enregistrer les noms à une lettre près (CSV)" })).toBeTruthy();
  });
});
