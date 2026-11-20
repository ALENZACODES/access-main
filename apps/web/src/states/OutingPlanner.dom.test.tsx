/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import type { SavedFile } from "./downloadFile";
import { OutingPlanner } from "./OutingPlanner";
import { onLine, START_WEST } from "./outingFixtures";
import { lintCopy } from "./copyLint";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
// Added order: Cafe (east 3), Bank (east 1), Dock (east 2). Nearest from the west: Bank, Dock, Cafe.
const set = [onLine("c", 3, { name: "Cafe" }), onLine("b", 1, { name: "Bank", tag: "no" }), onLine("d", 2, { name: "Dock", tag: "limited" })];

afterEach(cleanup);

interface Over {
  places?: typeof set;
  locale?: "en" | "fr";
  start?: { lat: number; lon: number } | null;
  onSave?: (f: SavedFile) => boolean;
}
function show(over: Over = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const onSave = over.onSave ?? (() => true);
  const view = render(<OutingPlanner places={over.places ?? set} locale={locale} today={TODAY} start={over.start ?? null} onSave={onSave} />);
  return view;
}
const names = () => screen.getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);
const mode = (label: string) => fireEvent.click(screen.getByRole("radio", { name: label }));
const status = () => (document.querySelector("[data-outing-status]") as HTMLElement).textContent;
const summary = () => (document.querySelector("[data-outing-summary]") as HTMLElement).textContent ?? "";

describe("OutingPlanner when there is little to plan", () => {
  it("renders nothing for no places or one place", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [set[0]!] }).container.innerHTML).toBe("");
  });
  it("renders for two places", () => {
    show({ places: set.slice(0, 2) });
    expect(screen.getByRole("heading", { name: "Plan an outing" })).toBeTruthy();
  });
});

describe("OutingPlanner structure", () => {
  it("has one h3, a labelled region, a captioned table, and the choice of order", () => {
    show();
    expect(screen.getAllByRole("heading").map((h) => [h.tagName, h.textContent])).toEqual([["H3", "Plan an outing"]]);
    expect(document.querySelector("[data-outing]")!.getAttribute("lang")).toBe("en");
    expect(screen.getByRole("table")).toBeTruthy();
    expect(within(screen.getByRole("table")).getByText(/The 3 stops in the order shown/)).toBeTruthy();
    expect(screen.getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["added", "nearest", "mine"]);
  });
  it("starts in the order the places were added", () => {
    show();
    expect(names()).toEqual(["Cafe", "Bank", "Dock"]);
    expect((screen.getByRole("radio", { name: "As added to the list" }) as HTMLInputElement).checked).toBe(true);
  });
  it("shows the tag as the pack says it, with UNKNOWN for none", () => {
    show({ places: [...set, onLine("u", 4, { name: "Unit", tag: "unknown" })] });
    const rows = screen.getAllByRole("row").slice(1);
    expect(rows.map((r) => within(r).getAllByRole("cell")[1]!.textContent)).toEqual(["Yes", "No", "Limited", "UNKNOWN"]);
  });
  it("says what the distances are, in the page, always", () => {
    show();
    expect(screen.getByText(/Distances are straight lines between map points/)).toBeTruthy();
  });
  it("has a column header on every column", () => {
    show();
    expect(within(screen.getByRole("table")).getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["Stop", "Place", "Wheelchair tag", "Straight line from the previous point", "Total so far", "Move"]);
  });
});

describe("the order choice", () => {
  it("nearest next orders by distance from the starting point", () => {
    show({ start: START_WEST });
    mode("Nearest next");
    expect(names()).toEqual(["Bank", "Dock", "Cafe"]);
  });
  it("changes with the starting point, since the rule starts there", () => {
    const east = { lat: 43.65, lon: -79.3 };
    show({ start: east });
    mode("Nearest next");
    expect(names()).toEqual(["Cafe", "Dock", "Bank"]);
  });
  it("goes back to the added order", () => {
    show({ start: START_WEST });
    mode("Nearest next");
    mode("As added to the list");
    expect(names()).toEqual(["Cafe", "Bank", "Dock"]);
  });
  it("starts my own order from the order on screen, so nothing jumps", () => {
    show({ start: START_WEST });
    mode("Nearest next");
    mode("My own order");
    expect(names()).toEqual(["Bank", "Dock", "Cafe"]);
  });
  it("shows a hint for the chosen rule", () => {
    show();
    expect(screen.getByText("The places in the order you added them.")).toBeTruthy();
    mode("Nearest next");
    expect(screen.getByText(/not the shortest possible tour/)).toBeTruthy();
  });
});

describe("moving stops", () => {
  const upButton = (name: string) => screen.getByRole("button", { name: `Move ${name} up` });
  const downButton = (name: string) => screen.getByRole("button", { name: `Move ${name} down` });
  it("moves a stop up and says where it went, and switches to my own order", () => {
    show();
    fireEvent.click(upButton("Bank"));
    expect(names()).toEqual(["Bank", "Cafe", "Dock"]);
    expect(status()).toBe("Bank moved to position 1 of 3.");
    expect((screen.getByRole("radio", { name: "My own order" }) as HTMLInputElement).checked).toBe(true);
  });
  it("moves a stop down", () => {
    show();
    fireEvent.click(downButton("Cafe"));
    expect(names()).toEqual(["Bank", "Cafe", "Dock"]);
    expect(status()).toBe("Cafe moved to position 2 of 3.");
  });
  it("says so, and changes nothing, for the first stop up or the last stop down", () => {
    show();
    fireEvent.click(upButton("Cafe"));
    expect(names()).toEqual(["Cafe", "Bank", "Dock"]);
    expect(status()).toBe("Cafe is already first (position 1).");
    fireEvent.click(downButton("Dock"));
    expect(status()).toBe("Dock is already last (position 3).");
    expect((screen.getByRole("radio", { name: "As added to the list" }) as HTMLInputElement).checked).toBe(true);
  });
  it("keeps the buttons enabled at the ends so focus is never lost", () => {
    show();
    for (const b of screen.getAllByRole("button", { name: /^Move / })) expect((b as HTMLButtonElement).disabled).toBe(false);
  });
  it("names every move button with its place, and gives each a visible word", () => {
    show();
    for (const p of ["Cafe", "Bank", "Dock"]) {
      expect(upButton(p).textContent).toBe("Up");
      expect(downButton(p).textContent).toBe("Down");
    }
  });
  it("reverses the order and says so", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Reverse the order" }));
    expect(names()).toEqual(["Dock", "Bank", "Cafe"]);
    expect(status()).toBe("The order is reversed.");
  });
  it("makes the first stop's distance from the start follow the order", () => {
    show({ start: START_WEST });
    const firstLeg = () => within(screen.getAllByRole("row")[1]!).getAllByRole("cell")[2]!.textContent;
    const before = firstLeg();
    fireEvent.click(screen.getByRole("button", { name: "Reverse the order" }));
    expect(firstLeg()).not.toBe(before);
  });
});

describe("distances in the table", () => {
  it("shows a dash for the first stop when there is no starting point, and distances after it", () => {
    show();
    const cells = (i: number) => within(screen.getAllByRole("row")[i]!).getAllByRole("cell").map((c) => c.textContent);
    expect(cells(1)[2]).toBe("–");
    expect(cells(2)[2]).toMatch(/^\d+[\u00a0 ]m$|^[\d.]+\u00a0km$/);
  });
  it("shows a distance for the first stop when there is a starting point", () => {
    show({ start: START_WEST });
    expect(within(screen.getAllByRole("row")[1]!).getAllByRole("cell")[2]!.textContent).not.toBe("–");
    expect(screen.getByText("The first distance is from your starting point.")).toBeTruthy();
  });
  it("shows UNKNOWN for a stop with no map point, and marks the total as partial", () => {
    show({ places: [onLine("a", 1, { name: "Aa" }), onLine("x", null, { name: "Nowhere" }), onLine("b", 3, { name: "Bb" })], start: START_WEST });
    const cells = (i: number) => within(screen.getAllByRole("row")[i]!).getAllByRole("cell").map((c) => c.textContent);
    expect(cells(2)[2]).toBe("UNKNOWN");
    expect(cells(2)[3]).toMatch(/or more$/);
    expect(summary()).toMatch(/UNKNOWN because a place has no map point/);
  });
  it("puts the whole distance in the summary when every distance is known", () => {
    show({ start: START_WEST });
    expect(summary()).toMatch(/^3 stops, about [\d.]+\u00a0km in straight lines in all\.$/);
  });
});

describe("pace", () => {
  const field = () => screen.getByLabelText("Your usual pace in km/h (optional)") as HTMLInputElement;
  it("adds a minimum time column and note only once a good pace is typed", () => {
    show({ start: START_WEST });
    expect(screen.queryByRole("columnheader", { name: "At least" })).toBeNull();
    fireEvent.change(field(), { target: { value: "4" } });
    expect(screen.getByRole("columnheader", { name: "At least" })).toBeTruthy();
    expect(screen.getByText(/The time is a minimum along a straight line/)).toBeTruthy();
    expect(summary()).toMatch(/At least .* at your pace\.$/);
  });
  it("accepts a comma", () => {
    show({ start: START_WEST });
    fireEvent.change(field(), { target: { value: "3,5" } });
    expect(screen.getByRole("columnheader", { name: "At least" })).toBeTruthy();
  });
  it("says what a good pace looks like for a bad one, and shows no time", () => {
    show({ start: START_WEST });
    fireEvent.change(field(), { target: { value: "fast" } });
    expect(screen.getByText("Type a pace from 0.5 to 8 km/h, for example 3.5, or leave it empty.")).toBeTruthy();
    expect(screen.queryByRole("columnheader", { name: "At least" })).toBeNull();
    expect(field().getAttribute("aria-invalid")).toBe("true");
  });
  it("is not kept anywhere", () => {
    const write = vi.spyOn(Storage.prototype, "setItem");
    show({ start: START_WEST });
    fireEvent.change(field(), { target: { value: "4" } });
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });
});

describe("not kept", () => {
  const spy = () => vi.spyOn(Storage.prototype, "setItem");
  it("writes nothing to storage when the order or pace changes", () => {
    const write = spy();
    show({ start: START_WEST });
    mode("Nearest next");
    fireEvent.click(screen.getByRole("button", { name: "Move Dock up" }));
    fireEvent.click(screen.getByRole("button", { name: "Reverse the order" }));
    fireEvent.change(screen.getByLabelText("Your usual pace in km/h (optional)"), { target: { value: "4" } });
    expect(write).not.toHaveBeenCalled();
    write.mockRestore();
  });
  it("starts again in the added order on a new page", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Move Bank up" }));
    cleanup();
    show();
    expect(names()).toEqual(["Cafe", "Bank", "Dock"]);
  });
  it("keeps my own order while the places are the same, even after changing the rule and back", () => {
    show({ start: START_WEST });
    fireEvent.click(screen.getByRole("button", { name: "Move Dock up" }));
    mode("Nearest next");
    mode("My own order");
    expect(names()).toEqual(["Cafe", "Dock", "Bank"]);
  });
  it("fits my own order to a changed list: a removed place goes, a new one comes last", () => {
    const { rerender } = show();
    fireEvent.click(screen.getByRole("button", { name: "Move Dock up" }));
    rerender(<OutingPlanner places={[set[0]!, set[2]!, onLine("e", 5, { name: "Edge" })]} locale="en" today={TODAY} onSave={() => true} />);
    expect(names()).toEqual(["Cafe", "Dock", "Edge"]);
  });
});

describe("saving", () => {
  it("hands the text to onSave with the outing's own order and the OpenStreetMap credit", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Move Bank up" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the outing (text)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.name).toBe("outing-plan.txt");
    expect(file.content.indexOf("1. Bank")).toBeGreaterThan(-1);
    expect(file.content.indexOf("1. Bank")).toBeLessThan(file.content.indexOf("2. Cafe"));
    expect(file.content.endsWith("© OpenStreetMap contributors\n")).toBe(true);
    expect(status()).toBe("Saved outing-plan.txt.");
  });
  it("hands the CSV with a byte order mark", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the outing (CSV)" }));
    expect(onSave.mock.calls[0]![0].content.startsWith("\uFEFFstop,place_id,")).toBe(true);
    expect(onSave.mock.calls[0]![0].mime).toBe("text/csv;charset=utf-8");
  });
  it("hands the GeoJSON with the geo+json type", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the stops (GeoJSON)" }));
    const file = onSave.mock.calls[0]![0];
    expect(file.mime).toBe("application/geo+json;charset=utf-8");
    expect(JSON.parse(file.content).features).toHaveLength(3);
  });
  it("includes the minimum time in the text only when a pace was typed", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave, start: START_WEST });
    fireEvent.click(screen.getByRole("button", { name: "Save the outing (text)" }));
    expect(onSave.mock.calls[0]![0].content).not.toMatch(/At least/);
    fireEvent.change(screen.getByLabelText("Your usual pace in km/h (optional)"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "Save the outing (text)" }));
    expect(onSave.mock.calls[1]![0].content).toMatch(/At least/);
  });
  it("says so when the browser cannot save, or saving throws", () => {
    show({ onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the outing (CSV)" }));
    expect(status()).toBe("This browser cannot save a file here.");
    cleanup();
    show({
      onSave: () => {
        throw new Error("blocked");
      },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save the outing (text)" }));
    expect(status()).toBe("This browser cannot save a file here.");
  });
});

describe("in French", () => {
  it("is in French, with French names on the controls and UNKNOWN kept", () => {
    show({ locale: "fr", places: [...set, onLine("u", null, { name: "Sans point", tag: "unknown" })] });
    expect(screen.getByRole("heading", { name: "Planifier une sortie" })).toBeTruthy();
    expect(document.querySelector("[data-outing]")!.getAttribute("lang")).toBe("fr");
    expect(screen.getByRole("button", { name: "Monter Bank" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Descendre Bank" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Le plus proche d’abord" })).toBeTruthy();
    expect(within(document.querySelector("[data-outing]") as HTMLElement).getAllByText("UNKNOWN").length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/INCONN/i);
  });
  it("passes the French typography check on everything shown", () => {
    show({ locale: "fr", start: START_WEST });
    expect(lintFrench((document.querySelector("[data-outing]") as HTMLElement).textContent ?? "")).toEqual([]);
  });
  it("says what a bad pace should look like with a decimal comma", () => {
    show({ locale: "fr", start: START_WEST });
    fireEvent.change(screen.getByLabelText("Votre rythme habituel en km/h (facultatif)"), { target: { value: "x" } });
    expect(screen.getByText("Saisissez un rythme de 0,5 à 8 km/h, par exemple 3,5, ou laissez le champ vide.")).toBeTruthy();
  });
  it("announces a move in French", () => {
    show({ locale: "fr" });
    fireEvent.click(screen.getByRole("button", { name: "Monter Bank" }));
    expect(status()).toBe("Bank déplacé à la position 1 sur 3.");
  });
  it("saves the French file names", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ locale: "fr", onSave });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer la sortie (CSV)" }));
    expect(onSave.mock.calls[0]![0].name).toBe("plan-de-sortie.csv");
    expect(status()).toBe("Fichier plan-de-sortie.csv enregistré.");
  });
});

describe("copy and accessibility", () => {
  it("passes the copy check and names no organisation, in both languages", () => {
    for (const locale of ["en", "fr"] as const) {
      show({ locale, start: START_WEST });
      const text = (document.querySelector("[data-outing]") as HTMLElement).textContent ?? "";
      expect(lintCopy(text, locale), locale).toEqual([]);
      expect(containsForbiddenOrg(text), locale).toBe(false);
      cleanup();
    }
  });
  it("has no axe violations, with and without a pace, a start, and an error, in both languages", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show({ locale, start: START_WEST });
      expect((await axe.run(container, axeRules)).violations, `${locale} plain`).toEqual([]);
      fireEvent.change(container.querySelector("input[type=text], input:not([type])") as HTMLInputElement, { target: { value: "3.5" } });
      expect((await axe.run(container, axeRules)).violations, `${locale} pace`).toEqual([]);
      fireEvent.change(container.querySelector("input[type=text], input:not([type])") as HTMLInputElement, { target: { value: "zzz" } });
      expect((await axe.run(container, axeRules)).violations, `${locale} error`).toEqual([]);
      cleanup();
    }
  });
  it("makes the scrolling table region reachable by keyboard", () => {
    show();
    const region = screen.getByRole("region", { name: "Stops in order" });
    expect(region.getAttribute("tabindex")).toBe("0");
  });
  it("uses the shared button class for every button, which the style sheet sizes to at least 44px", () => {
    show();
    for (const b of screen.getAllByRole("button")) expect(b.className).toContain("btn");
  });
});
