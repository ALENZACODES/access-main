/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import type { EarlierPlace } from "./packEarlier";
import { diffPacks } from "./packDiff";
import { parsePackPlaces } from "./packPlaces";
import { PackTagMoves } from "./PackTagMoves";

const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const now = (id: string, wheelchair: string | undefined) => parsePackPlaces([{ id, name: `Place ${id}`, wheelchair, category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM }]).places[0]!;
const before = (id: string, tag: EarlierPlace["tag"]): EarlierPlace => ({ id, name: `Place ${id}`, kind: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, tag, source: OSM.source_name, retrievedOn: OSM.retrieved_at, tier: null });
const diff = () => diffPacks([before("a", "yes"), before("b", "no")], [now("a", "limited"), now("b", "yes")]);

afterEach(cleanup);

function show(onSave: (f: SavedFile) => boolean = () => true, locale: "en" | "fr" = "en") {
  document.documentElement.lang = locale;
  return render(<PackTagMoves diff={diff()} locale={locale} today="2026-11-19" onSave={onSave} />);
}

const focusables = () => [...document.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex='0']")];
const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};

describe("PackTagMoves by keyboard", () => {
  it("has the count buttons and then both save buttons as its only tab stops, in reading order", () => {
    show();
    expect(focusables().map((el) => el.getAttribute("aria-label") ?? el.textContent)).toEqual(["Yes to Limited: 1. List these places.", "No to Yes: 1. List these places.", "Save the tag changes (CSV)", "Save the tag changes (text)"]);
  });
  it("presses a count button with Enter, and again with Space, which opens and closes its list", () => {
    show();
    const button = focusables()[0]!;
    button.focus();
    press(button, "Enter");
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Place a"]);
    press(button, " ");
    expect(screen.queryAllByRole("listitem")).toEqual([]);
  });
  it("keeps focus on the count button after it is pressed", () => {
    show();
    const button = focusables()[0]!;
    button.focus();
    press(button, "Enter");
    expect(document.activeElement).toBe(button);
  });
  it("saves with Enter on a save button and says so in the polite line", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    show(onSave);
    const button = screen.getByRole("button", { name: "Save the tag changes (text)" });
    button.focus();
    press(button, "Enter");
    expect(onSave).toHaveBeenCalledTimes(1);
    expect((document.querySelector("[data-moves-saved]") as HTMLElement).textContent).toBe("Saved tag-changes.txt.");
  });
  it("gives the chosen cell's list a name a screen reader reads before the names", () => {
    show();
    fireEvent.click(focusables()[0]!);
    expect(screen.getByRole("list").previousElementSibling?.textContent).toBe("Yes to Limited");
  });
  it("has no tabindex above zero and takes no focus on load", () => {
    show();
    expect(document.querySelectorAll("[tabindex]:not([tabindex='0']):not([tabindex='-1'])")).toHaveLength(0);
    expect(document.activeElement).toBe(document.body);
  });
  it("tells the pressed state by attribute, so it can be heard and not only seen", () => {
    show();
    fireEvent.click(focusables()[0]!);
    expect(screen.getByRole("button", { name: /Yes to Limited/, pressed: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: /No to Yes/, pressed: false })).toBeTruthy();
  });
  it("keeps the table's meaning without sight: every header is scoped", () => {
    show();
    const table = screen.getByRole("table");
    for (const th of within(table).getAllByRole("columnheader")) expect(th.getAttribute("scope")).toBe("col");
    for (const th of within(table).getAllByRole("rowheader")) expect(th.getAttribute("scope")).toBe("row");
  });
  it("has the same tab stops in French, with French names on the controls", () => {
    show(() => true, "fr");
    expect(focusables()[0]!.getAttribute("aria-label")).toBe("Oui vers Limité\u00a0: 1. Lister ces lieux.");
    expect(focusables()).toHaveLength(4);
  });
});
