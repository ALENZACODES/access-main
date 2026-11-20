/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { Shortlist } from "./Shortlist";
import type { ShortlistEntry } from "./shortlist";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const raw = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Place ${id}`, wheelchair: "yes", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: OSM, ...over });
const places: PackPlaceRecord[] = [...parsePackPlaces([raw("a"), raw("b", { wheelchair: "no", name: "Beta Court" })]).places];
const entry = (id: string): ShortlistEntry => ({ id, addedOn: TODAY });
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

afterEach(cleanup);

function show(list: ShortlistEntry[], locale: "en" | "fr" = "en") {
  document.documentElement.lang = locale;
  return render(<Shortlist list={list} places={places} locale={locale} today={TODAY} kept onRemove={vi.fn()} onClear={vi.fn()} />);
}

describe("questions inside the shortlist", () => {
  it("shows the questions section under the table when a listed place is in the pack", () => {
    show([entry("a"), entry("b")]);
    expect(screen.getByRole("heading", { level: 3, name: "Questions to ask before you go" })).toBeTruthy();
  });
  it("is a part of the list's own section, after the table and before the status line", () => {
    const { container } = show([entry("a")]);
    const section = container.querySelector("[data-shortlist]")!;
    const kids = Array.from(section.children);
    const table = kids.findIndex((k) => k.querySelector("table") !== null);
    const visit = kids.findIndex((k) => k.hasAttribute("data-visit-plan"));
    expect(table).toBeGreaterThanOrEqual(0);
    expect(visit).toBeGreaterThan(table);
  });
  it("asks about the places on the list and no others", () => {
    show([entry("b")]);
    fireEvent.click(screen.getByRole("button", { name: "Show the questions" }));
    const legends = screen.getAllByText(/./, { selector: "legend" }).map((l) => l.textContent);
    expect(legends).toEqual(["Beta Court"]);
  });
  it("is not shown when every listed place is missing from the pack", () => {
    show([entry("zzz")]);
    expect(screen.queryByRole("heading", { level: 3, name: "Questions to ask before you go" })).toBeNull();
  });
  it("is not shown for an empty list", () => {
    const { container } = show([]);
    expect(container.innerHTML).toBe("");
  });
  it("leaves out a listed place the pack lacks and says how many are lacking", () => {
    show([entry("a"), entry("zzz")]);
    fireEvent.click(screen.getByRole("button", { name: "Show the questions" }));
    expect(screen.getAllByText(/./, { selector: "legend" }).map((l) => l.textContent)).toEqual(["Place a"]);
  });
  it("follows the list: removing a place from the table removes its questions", () => {
    const { rerender } = show([entry("a"), entry("b")]);
    fireEvent.click(screen.getByRole("button", { name: "Show the questions" }));
    expect(screen.getAllByText(/./, { selector: "legend" })).toHaveLength(2);
    rerender(<Shortlist list={[entry("b")]} places={places} locale="en" today={TODAY} kept onRemove={vi.fn()} onClear={vi.fn()} />);
    expect(screen.getAllByText(/./, { selector: "legend" }).map((l) => l.textContent)).toEqual(["Beta Court"]);
  });
  it("does not change what the list's own buttons are called", () => {
    show([entry("a")]);
    const group = screen.getByRole("group", { name: "List actions" });
    expect(within(group).getAllByRole("button").map((b) => b.textContent)).toEqual(["Copy the list as text", "Copy the list as CSV", "Show the text", "Empty the list"]);
  });
  it("has no axe violations with the questions open, in both languages", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show([entry("a"), entry("b")], locale);
      fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show the questions" : "Afficher les questions" }));
      expect((await axe.run(container, axeRules)).violations, locale).toEqual([]);
      cleanup();
    }
  });
});
