/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, name, wheelchair: "yes", category: "attraction", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov, ...over });
const small = [rec("a", "Alpha Hall"), rec("b", "Beta Court", { lat: null, lon: null }), rec("c", "Gamma Gate", { provenance: null })];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-15" />
    </MemoryRouter>,
  );
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("place sheet on each card", () => {
  it("puts one closed Details and gaps button on every card", () => {
    show(small);
    const buttons = screen.getAllByRole("button", { name: "Details and gaps" });
    expect(buttons).toHaveLength(3);
    for (const b of buttons) expect(b.getAttribute("aria-expanded")).toBe("false");
  });
  it("opens only the card it was pressed on", () => {
    const { container } = show(small);
    fireEvent.click(screen.getAllByRole("button", { name: "Details and gaps" })[0]!);
    expect(container.querySelectorAll("[data-place-sheet] table")).toHaveLength(1);
    expect(container.querySelector('[data-place-sheet="a"] table')).not.toBeNull();
  });
  it("shows UNKNOWN and the reason for the place with a tag but no source", () => {
    const { container } = show(small);
    const sheet = container.querySelector('[data-place-sheet="c"]') as HTMLElement;
    fireEvent.click(within(sheet).getByRole("button", { name: "Details and gaps" }));
    expect(sheet.textContent).toContain("The tag has no usable source, so it is not shown as known.");
  });
  it("gives the place with no map point no map link", () => {
    const { container } = show(small);
    const sheet = container.querySelector('[data-place-sheet="b"]') as HTMLElement;
    fireEvent.click(within(sheet).getByRole("button", { name: "Details and gaps" }));
    expect(within(sheet).queryByRole("link", { name: /maps app/ })).toBeNull();
  });
  it("sits beside the Add to list button without changing it", () => {
    show(small);
    expect(screen.getByRole("button", { name: "Add to list Alpha Hall" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("is in French when the page is", () => {
    show(small, "fr");
    expect(screen.getAllByRole("button", { name: "Détails et lacunes" })).toHaveLength(3);
  });
  it("adds no storage of its own", () => {
    show(small);
    fireEvent.click(screen.getAllByRole("button", { name: "Details and gaps" })[0]!);
    expect(localStorage.length).toBe(0);
  });
  it("has no axe violations with a sheet open, in either language", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container, unmount } = show(small, locale);
      fireEvent.click(screen.getAllByRole("button", { name: locale === "en" ? "Details and gaps" : "Détails et lacunes" })[0]!);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      unmount();
    }
  });
});

describe("take the list along, in the shortlist", () => {
  it("appears once a place is on the list, and saves only listed places", () => {
    show(small);
    expect(screen.queryByRole("group", { name: "Take the list along" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Add to list Alpha Hall" }));
    expect(screen.getByRole("group", { name: "Take the list along" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Save the list as contact cards (.vcf)" })).toBeTruthy();
  });
  it("disappears again when the list is emptied", () => {
    show(small);
    fireEvent.click(screen.getByRole("button", { name: "Add to list Alpha Hall" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from list Alpha Hall" }));
    expect(screen.queryByRole("group", { name: "Take the list along" })).toBeNull();
  });
});

describe("gaps grid in the shortlist", () => {
  const add = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Add to list ${name}` }));
  it("is not offered for one listed place", () => {
    show(small);
    add("Alpha Hall");
    expect(screen.queryByRole("button", { name: "Show the gaps grid" })).toBeNull();
  });
  it("is offered for two and lists them in the order they were added", () => {
    show(small);
    add("Gamma Gate");
    add("Alpha Hall");
    fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
    const grid = screen.getByRole("table", { name: "Details the pack gives for each listed place" });
    expect(within(grid).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Gamma Gate", "Alpha Hall"]);
  });
  it("loses the removed place", () => {
    show(small);
    add("Alpha Hall");
    add("Beta Court");
    add("Gamma Gate");
    fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from list Beta Court" }));
    const grid = screen.getByRole("table", { name: "Details the pack gives for each listed place" });
    expect(within(grid).getAllByRole("rowheader")).toHaveLength(2);
  });
  it("has no axe violations with the grid open", async () => {
    const { container } = show(small);
    add("Alpha Hall");
    add("Beta Court");
    fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});
