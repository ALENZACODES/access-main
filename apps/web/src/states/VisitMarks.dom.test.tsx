/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { place } from "./placeFixtures";
import type { KeyValueStore } from "./submissionQueue";
import { VISIT_MARKS_KEY, parseVisitMarks } from "./visitMarks";

const saved = vi.hoisted(() => ({ calls: [] as { name: string; mime: string; content: string }[], ok: true }));
vi.mock("./downloadFile.ts", () => ({
  saveTextFile: (f: { name: string; mime: string; content: string }) => {
    saved.calls.push(f);
    return saved.ok;
  },
}));
const { VisitMarks } = await import("./VisitMarks.tsx");
const { useVisitMarks } = await import("./useVisitMarks.ts");

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const TODAY = "2026-11-21";
const places = [place("a", { name: "Alpha Hall" }), place("b", { name: "Beta Court", address: null }), place("c", { name: "Gamma Gate" })];

function memory(initial: Record<string, string> = {}): KeyValueStore & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (k) => (k in data ? data[k]! : null), setItem: (k, v) => { data[k] = v; }, removeItem: (k) => { delete data[k]; } };
}

function Harness({ list = places, store, locale = "en" }: { list?: typeof places; store: KeyValueStore | null; locale?: "en" | "fr" }) {
  const state = useVisitMarks(TODAY, store);
  return <VisitMarks places={list} state={state} locale={locale} today={TODAY} />;
}
const show = (store: KeyValueStore | null = memory(), opts: { list?: typeof places; locale?: "en" | "fr" } = {}) => render(<Harness store={store} {...opts} />);
const openTools = () => fireEvent.click(screen.getByRole("button", { name: /Mark places as to visit/ }));
const choose = (group: string, label: string) => fireEvent.click(within(screen.getByRole("radiogroup", { name: group })).getByRole("radio", { name: label }));

beforeEach(() => {
  saved.calls = [];
  saved.ok = true;
});
afterEach(cleanup);

describe("VisitMarks", () => {
  it("shows nothing for no listed places and no marks", () => {
    const { container } = show(memory(), { list: [] });
    expect(container.innerHTML).toBe("");
  });
  it("starts closed, controls a region that exists, and adds no heading when opened", () => {
    show();
    const before = screen.queryAllByRole("heading").length;
    const btn = screen.getByRole("button", { name: /Mark places as to visit/ });
    expect(btn.getAttribute("aria-expanded")).toBe("false");
    expect(document.getElementById(btn.getAttribute("aria-controls")!)).toBeTruthy();
    expect(screen.queryByRole("radiogroup")).toBeNull();
    fireEvent.click(btn);
    expect(btn.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getAllByRole("radiogroup")).toHaveLength(3);
    expect(screen.queryAllByRole("heading")).toHaveLength(before);
  });
  it("gives each place a group named with the place, in the order given, set to No mark", () => {
    show();
    openTools();
    const groups = screen.getAllByRole("radiogroup");
    expect(groups.map((g) => g.getAttribute("aria-labelledby") && document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent)).toEqual(["Mark for Alpha Hall", "Mark for Beta Court", "Mark for Gamma Gate"]);
    for (const g of groups) expect((within(g).getByRole("radio", { name: "No mark" }) as HTMLInputElement).checked).toBe(true);
    expect(within(groups[0]!).getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["none", "to-visit", "been", "ruled-out"]);
  });
  it("marks a place, says so, counts it and keeps it on the device", () => {
    const store = memory();
    show(store);
    openTools();
    choose("Mark for Beta Court", "Been there");
    expect(document.querySelector("[data-visit-marks-said]")?.textContent).toBe("Beta Court: Been there.");
    expect(document.querySelector("[data-visit-marks-summary]")?.textContent).toBe("0 to visit, 1 been there, 0 ruled out, 2 with no mark.");
    expect(screen.getByText("Marked 21 November 2026.")).toBeTruthy();
    expect(parseVisitMarks(store.data[VISIT_MARKS_KEY])).toEqual([{ id: "b", status: "been", markedOn: TODAY }]);
  });
  it("changes a mark and removes it with No mark", () => {
    const store = memory();
    show(store);
    openTools();
    choose("Mark for Alpha Hall", "To visit");
    choose("Mark for Alpha Hall", "Ruled out");
    expect(parseVisitMarks(store.data[VISIT_MARKS_KEY])[0]?.status).toBe("ruled-out");
    choose("Mark for Alpha Hall", "No mark");
    expect(document.querySelector("[data-visit-marks-said]")?.textContent).toBe("Mark removed for Alpha Hall.");
    expect(VISIT_MARKS_KEY in store.data).toBe(false);
  });
  it("starts from marks already stored and ignores damaged ones", () => {
    const store = memory({ [VISIT_MARKS_KEY]: JSON.stringify([{ id: "c", status: "to-visit", markedOn: "2026-11-02" }, { id: "x y", status: "been" }, 5]) });
    show(store);
    openTools();
    expect((within(screen.getByRole("radiogroup", { name: "Mark for Gamma Gate" })).getByRole("radio", { name: "To visit" }) as HTMLInputElement).checked).toBe(true);
    expect(screen.getByText("Marked 2 November 2026.")).toBeTruthy();
  });
  it("does not reorder the places when they are marked", () => {
    show();
    openTools();
    choose("Mark for Gamma Gate", "To visit");
    const names = screen.getAllByRole("radiogroup").map((g) => g.getAttribute("aria-labelledby") && document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent);
    expect(names).toEqual(["Mark for Alpha Hall", "Mark for Beta Court", "Mark for Gamma Gate"]);
  });
  it("names a place with no name by its id", () => {
    show(memory(), { list: [place("zz", { name: null })] });
    openTools();
    expect(screen.getByRole("radiogroup", { name: "Mark for zz" })).toBeTruthy();
  });
  it("says when marks cannot be kept, and still works in memory", () => {
    show(null);
    openTools();
    choose("Mark for Alpha Hall", "Been there");
    expect(screen.getByText(/could not be saved on this device/)).toBeTruthy();
    expect((within(screen.getByRole("radiogroup", { name: "Mark for Alpha Hall" })).getByRole("radio", { name: "Been there" }) as HTMLInputElement).checked).toBe(true);
  });
  it("offers to remove marks on places that are no longer listed, and only those", () => {
    const store = memory({ [VISIT_MARKS_KEY]: JSON.stringify([{ id: "a", status: "been" }, { id: "gone", status: "ruled-out" }, { id: "gone2", status: "been" }]) });
    show(store);
    openTools();
    expect(screen.getByText("2 marks are on places that are not on the list now.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove the marks on places not on the list" }));
    expect(parseVisitMarks(store.data[VISIT_MARKS_KEY]).map((m) => m.id)).toEqual(["a"]);
    expect(screen.queryByText(/not on the list now/)).toBeNull();
  });
  it("shows only the note when nothing is listed but marks remain", () => {
    show(memory({ [VISIT_MARKS_KEY]: JSON.stringify([{ id: "gone", status: "been" }]) }), { list: [] });
    openTools();
    expect(screen.getByText(/nothing to mark/)).toBeTruthy();
    expect(screen.getByText("1 mark is on places that are not on the list now.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Save the marks/ })).toBeNull();
  });
  it("saves the marks as text and as CSV in the order listed", () => {
    show();
    openTools();
    choose("Mark for Alpha Hall", "To visit");
    fireEvent.click(screen.getByRole("button", { name: "Save the marks as a text file" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the marks as a CSV file" }));
    expect(saved.calls.map((c) => c.name)).toEqual(["visit-marks-2026-11-21.txt", "visit-marks-2026-11-21.csv"]);
    expect(saved.calls[0]!.content).toContain("- Alpha Hall, 1 Main Street (21 November 2026)");
    expect(saved.calls[1]!.content.charCodeAt(0)).toBe(0xfeff);
    expect(saved.calls[1]!.mime).toBe("text/csv;charset=utf-8");
    expect(document.querySelector("[data-visit-marks-said]")?.textContent).toBe("Saved visit-marks-2026-11-21.csv.");
  });
  it("says when a file could not be made", () => {
    saved.ok = false;
    show();
    openTools();
    fireEvent.click(screen.getByRole("button", { name: "Save the marks as a CSV file" }));
    expect(document.querySelector("[data-visit-marks-said]")?.textContent).toBe("This browser could not make a file here.");
  });
  it("has no axe violation closed or open, in English", async () => {
    const { container } = show();
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
    openTools();
    choose("Mark for Alpha Hall", "Been there");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("is in French and has no axe violation", async () => {
    const { container } = show(memory(), { locale: "fr" });
    fireEvent.click(screen.getByRole("button", { name: /Marquer les lieux/ }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Marque pour Alpha Hall" })).getByRole("radio", { name: "Déjà allé" }));
    expect(document.querySelector("[data-visit-marks-said]")?.textContent).toBe("Alpha Hall\u00a0: Déjà allé.");
    expect(screen.getByText("Marquée le 21 novembre 2026.")).toBeTruthy();
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("picks up a change made in another tab", () => {
    const store = memory();
    show(store);
    openTools();
    store.data[VISIT_MARKS_KEY] = JSON.stringify([{ id: "b", status: "ruled-out", markedOn: "2026-11-03" }]);
    fireEvent(window, new StorageEvent("storage", { key: VISIT_MARKS_KEY }));
    expect((within(screen.getByRole("radiogroup", { name: "Mark for Beta Court" })).getByRole("radio", { name: "Ruled out" }) as HTMLInputElement).checked).toBe(true);
  });
  it("ignores a change to some other key", () => {
    const store = memory();
    show(store);
    openTools();
    store.data[VISIT_MARKS_KEY] = JSON.stringify([{ id: "b", status: "ruled-out" }]);
    fireEvent(window, new StorageEvent("storage", { key: "something-else" }));
    expect((within(screen.getByRole("radiogroup", { name: "Mark for Beta Court" })).getByRole("radio", { name: "No mark" }) as HTMLInputElement).checked).toBe(true);
  });
});
