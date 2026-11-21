/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { SameName } from "./SameName";
import { buildSameName, listSameName } from "./sameName";
import { SAME_NAME_CSV_FILENAMES, SAME_NAME_FILENAMES, sameNameToCsv, sameNameToText } from "./sameNameCopy";
import { bare, place } from "./placeFixtures";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const FROM = { lat: 43.65, lon: -79.4 };
const at = (id: string, name: string | null, lon: number, over: Record<string, unknown> = {}) => place(id, { name, lat: 43.65, lon, ...over });
const set = [
  at("t1", "Tim Hortons", -79.399, { address: "1 King St" }),
  at("t2", "Tim Hortons #2", -79.3, { address: "2 Queen St", wheelchair: "no" }),
  at("t3", "Tim Hortons (Union)", -79.2, { address: "3 Bay St" }),
  at("l1", "Library", -79.41, { wheelchair: "no" }),
  at("l2", "library", -79.0, { wheelchair: "yes" }),
  at("s", "Solo Bakery", -79.1),
  bare("x"),
];

afterEach(cleanup);

interface Over {
  places?: typeof set;
  locale?: "en" | "fr";
  from?: { lat: number; lon: number } | null;
  onSave?: (f: SavedFile) => boolean;
}
function show(over: Over = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<SameName places={over.places ?? set} locale={locale} from={over.from ?? null} onSave={over.onSave ?? (() => true)} />);
}
const openBtn = () => fireEvent.click(screen.getByRole("button", { name: /^(Show|Afficher) (places|les lieux) /i }));
const headings = () => [...document.querySelectorAll("[data-same-name-group] > h4")].map((h) => h.textContent);
const status = () => (document.querySelector("[data-same-name-status]") as HTMLElement).textContent;

describe("SameName when there is little to compare", () => {
  it("renders nothing for no places or one place", () => {
    expect(show({ places: [] }).container.innerHTML).toBe("");
    cleanup();
    expect(show({ places: [set[0]!] }).container.innerHTML).toBe("");
  });
  it("is closed to begin with: one button, no heading, nothing listed", () => {
    show();
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.getByRole("region", { name: "Places that share a name" })).toBeTruthy();
    const b = screen.getByRole("button", { name: "Show places that share a name" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(document.querySelector("[data-same-name]")!.getAttribute("data-same-name")).toBe("closed");
  });
  it("opens and closes and the button points at what it controls", () => {
    show();
    openBtn();
    const b = screen.getByRole("button", { name: "Hide places that share a name" });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-controls")!)).toBeTruthy();
    expect(screen.getByRole("heading", { level: 3, name: "Places that share a name" })).toBeTruthy();
    fireEvent.click(b);
    expect(screen.queryAllByRole("heading")).toEqual([]);
  });
});

describe("SameName listing", () => {
  it("lists the shared names, most places first, with every place under its name", () => {
    show();
    openBtn();
    expect(headings()).toEqual(["Tim Hortons: 3 places", "Library: 2 places"]);
    const tim = document.querySelector('[data-same-name-group="tim hortons"]') as HTMLElement;
    expect(within(tim).getAllByRole("listitem")).toHaveLength(3);
    expect(within(tim).getByText(/1 King St/)).toBeTruthy();
    expect(within(tim).getByText(/The wheelchair tags differ: Yes 2, No 1\./)).toBeTruthy();
  });
  it("does not list a name carried by one place, and counts it in the summary", () => {
    show();
    openBtn();
    expect(screen.queryByText(/Solo Bakery/)).toBeNull();
    expect(document.querySelector("[data-same-name-summary]")!.textContent).toBe("2 names are shared by the places on screen. 1 place with a name of their own. 1 place with no usable name: UNKNOWN.");
  });
  it("shows no distance with no point, and a distance with one", () => {
    show();
    openBtn();
    expect(screen.queryByText(/from the point typed/)).toBeNull();
    cleanup();
    show({ from: FROM });
    openBtn();
    expect(screen.getAllByText(/from the point typed/).length).toBeGreaterThan(0);
  });
  it("puts the closest place first within a name when there is a point", () => {
    show({ from: FROM });
    openBtn();
    const tim = document.querySelector('[data-same-name-group="tim hortons"]') as HTMLElement;
    expect(within(tim).getAllByRole("listitem").map((li) => /\d+ \w+ St/.exec(li.textContent ?? "")![0])).toEqual(["1 King St", "2 Queen St", "3 Bay St"]);
  });
  it("says when no two places share a name", () => {
    show({ places: [set[5]!, set[0]!] });
    openBtn();
    expect(document.querySelector("[data-same-name-empty]")!.textContent).toBe("No two places on screen share a name.");
  });
});

describe("SameName choices", () => {
  it("name order and the nearest order change the order", () => {
    show({ from: FROM });
    openBtn();
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    expect(headings()).toEqual(["Library: 2 places", "Tim Hortons: 3 places"]);
    fireEvent.click(screen.getByRole("radio", { name: "Closest to the point typed first" }));
    expect(headings()[0]).toMatch(/^Library|^Tim/);
    const res = buildSameName(set, FROM);
    expect(headings()).toEqual(listSameName(res, "nearest", 2, "all", "en").map((g) => `${g.label}: ${g.members.length} places`));
  });
  it("the size choice leaves out smaller groups and says how many remain", () => {
    show();
    openBtn();
    fireEvent.click(screen.getByRole("radio", { name: "3 or more places" }));
    expect(headings()).toEqual(["Tim Hortons: 3 places"]);
    expect(status()).toBe("Showing 1 of 1 shared names.");
    fireEvent.click(screen.getByRole("radio", { name: "5 or more places" }));
    expect(document.querySelector("[data-same-name-empty]")!.textContent).toBe("No shared name matches these choices.");
  });
  it("the tags-differ filter keeps only the names whose tags differ", () => {
    show();
    openBtn();
    fireEvent.click(screen.getByRole("radio", { name: "Only where the wheelchair tags differ" }));
    expect(headings()).toEqual(["Tim Hortons: 3 places", "Library: 2 places"]);
    cleanup();
    show({ places: [at("a", "Shop", 1), at("b", "Shop", 2)] });
    openBtn();
    fireEvent.click(screen.getByRole("radio", { name: "Only where the wheelchair tags differ" }));
    expect(headings()).toEqual([]);
  });
  it("the limit shows the first names and says how many are left", () => {
    const many = Array.from({ length: 14 }, (_, i) => [at(`a${i}`, `Name ${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}`, i), at(`b${i}`, `name ${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}`, i + 0.5)]).flat();
    show({ places: many });
    openBtn();
    expect(headings()).toHaveLength(10);
    expect(document.querySelector("[data-same-name-more]")!.textContent).toBe("4 more names are not shown. Save the file to see all of them.");
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    expect(headings()).toHaveLength(5);
    fireEvent.click(screen.getByRole("radio", { name: "25" }));
    expect(headings()).toHaveLength(14);
    expect(document.querySelector("[data-same-name-more]")).toBeNull();
  });
  it("describes the nearest order differently with and without a point", () => {
    show();
    openBtn();
    fireEvent.click(screen.getByRole("radio", { name: "Closest to the point typed first" }));
    expect(screen.getByText(/Type a point above to measure/)).toBeTruthy();
  });
});

describe("SameName files", () => {
  it("saves a text file of what is listed, with no distance", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ from: FROM, onSave });
    openBtn();
    fireEvent.click(screen.getByRole("button", { name: "Save the list (text)" }));
    const f = onSave.mock.calls[0]![0];
    const res = buildSameName(set, FROM);
    expect(f.name).toBe(SAME_NAME_FILENAMES.en);
    expect(f.mime).toBe("text/plain;charset=utf-8");
    expect(f.content).toBe(sameNameToText(res, listSameName(res, "count", 2, "all", "en"), "en"));
    expect(f.content).not.toMatch(/from the point typed/);
    expect(status()).toBe(`Saved ${SAME_NAME_FILENAMES.en}.`);
  });
  it("saves every listed name, not only the ones shown", () => {
    const many = Array.from({ length: 12 }, (_, i) => [at(`a${i}`, `Nm ${i}${i}`, i), at(`b${i}`, `Nm ${i}${i}`, i + 0.5)]).flat();
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ places: many, onSave });
    openBtn();
    fireEvent.click(screen.getByRole("button", { name: "Save the list (CSV)" }));
    const f = onSave.mock.calls[0]![0];
    const res = buildSameName(many, null);
    expect(f.name).toBe(SAME_NAME_CSV_FILENAMES.en);
    expect(f.content).toBe(sameNameToCsv(listSameName(res, "count", 2, "all", "en"), "en"));
    expect(f.content.split("\r\n").filter(Boolean)).toHaveLength(25);
  });
  it("saves what the choices leave, not the whole list", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show({ onSave });
    openBtn();
    fireEvent.click(screen.getByRole("radio", { name: "3 or more places" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the list (CSV)" }));
    expect(onSave.mock.calls[0]![0].content.split("\r\n").filter(Boolean)).toHaveLength(1 + 3);
  });
  it("says so when the browser cannot save, including when saving throws", () => {
    show({ onSave: () => false });
    openBtn();
    fireEvent.click(screen.getByRole("button", { name: "Save the list (text)" }));
    expect(status()).toBe("This browser cannot save a file here.");
    cleanup();
    show({ onSave: () => { throw new Error("no"); } });
    openBtn();
    fireEvent.click(screen.getByRole("button", { name: "Save the list (CSV)" }));
    expect(status()).toBe("This browser cannot save a file here.");
  });
});

describe("SameName in French", () => {
  it("is French and every visible sentence passes lintFrench", () => {
    show({ locale: "fr", from: FROM });
    expect(document.querySelector("[data-same-name]")!.getAttribute("lang")).toBe("fr");
    openBtn();
    expect(screen.getByRole("heading", { level: 3, name: "Lieux qui portent le même nom" })).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Seulement si les indications pour fauteuil roulant diffèrent" }));
    const lines = [...document.querySelectorAll("p, legend, label, button, h3, h4, li")].filter((e) => !e.querySelector("li, p")).map((e) => e.textContent ?? "").filter(Boolean);
    expect(lines.length).toBeGreaterThan(15);
    for (const s of lines) expect(lintFrench(s), s).toEqual([]);
  });
});

describe("SameName accessibility", () => {
  for (const locale of ["en", "fr"] as const) {
    it(`${locale}: no axe violations closed, open, and with a point`, async () => {
      show({ locale });
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
      openBtn();
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
      cleanup();
      show({ locale, from: FROM });
      openBtn();
      expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
    });
  }
  it("no axe violations with nothing to list", async () => {
    show({ places: [set[5]!, set[0]!] });
    openBtn();
    expect((await axe.run(document.body, axeRules)).violations).toEqual([]);
  });
});
