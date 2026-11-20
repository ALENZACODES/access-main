/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackPlaces } from "./PackPlaces";
import { PackSearchWhy } from "./PackSearchHelp";
import { searchPlaces } from "./packSearchFixtures";
import type { Locale } from "./stateCopy";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const places = searchPlaces();
afterEach(cleanup);

const why = (text: string, onUse: (t: string) => void = () => undefined, locale: Locale = "en") => {
  document.documentElement.lang = locale;
  return render(<PackSearchWhy places={places} text={text} locale={locale} onUse={onUse} />);
};

describe("PackSearchWhy", () => {
  it("shows nothing for a search that finds places, a one-part search, or no search", () => {
    for (const q of ["", "cafe", "tag:yes has:note", "zzzz", "cafe OR zzzz"]) {
      expect(why(q).container.innerHTML, q).toBe("");
      cleanup();
    }
  });
  it("counts each part of a search that finds nothing", () => {
    why("tag:no kind:cafe");
    expect(screen.getByText("Why nothing matched")).toBeTruthy();
    expect(screen.getByText(/does not say which part is wrong/)).toBeTruthy();
    expect(screen.getByText("“tag:no” finds 1 place on its own. Without it, the search finds 2 places.")).toBeTruthy();
    expect(screen.getByText("“kind:cafe” finds 2 places on its own. Without it, the search finds 1 place.")).toBeTruthy();
  });
  it("offers to take out each part that would find something, and gives the search without it", () => {
    const onUse = vi.fn();
    why("tag:no kind:cafe", onUse);
    fireEvent.click(screen.getByRole("button", { name: "Take out “tag:no”" }));
    expect(onUse).toHaveBeenLastCalledWith("kind:cafe");
    fireEvent.click(screen.getByRole("button", { name: "Take out “kind:cafe”" }));
    expect(onUse).toHaveBeenLastCalledWith("tag:no");
  });
  it("offers no button for a part whose removal still finds nothing, and says so when none does", () => {
    why("kind:zzzz note:xxxx name:yyyy");
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("Taking out any one part still finds nothing.")).toBeTruthy();
    cleanup();
    why("kind:zzzz tag:no");
    expect(screen.getAllByRole("button")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Take out “kind:zzzz”" })).toBeTruthy();
    expect(screen.queryByText("Taking out any one part still finds nothing.")).toBeNull();
  });
  it("is polite to a screen reader", () => {
    const { container } = why("tag:no kind:cafe");
    expect(container.querySelector("[aria-live]")!.getAttribute("aria-live")).toBe("polite");
  });
  it("is French in French, keeping what was typed as it was", () => {
    why("tag:no kind:cafe", undefined, "fr");
    expect(screen.getByText("Pourquoi rien ne correspond")).toBeTruthy();
    expect(document.body.textContent).toContain("«\u202ftag:no\u202f» trouve 1 lieu à lui seul. Sans lui, la recherche trouve 2 lieux.");
    expect(screen.getByRole("button", { name: "Retirer «\u202ftag:no\u202f»" })).toBeTruthy();
    expect(document.body.textContent).not.toMatch(/inconnu/i);
  });
  it("has no axe violations in both languages", async () => {
    for (const l of ["en", "fr"] as const) {
      const { container } = why("tag:no kind:cafe", undefined, l);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      cleanup();
    }
  });
  it("can be used by keyboard", () => {
    const onUse = vi.fn();
    why("tag:no kind:cafe", onUse);
    const b = screen.getByRole("button", { name: "Take out “tag:no”" });
    b.focus();
    fireEvent.keyDown(b, { key: "Enter" });
    fireEvent.keyUp(b, { key: "Enter" });
    fireEvent.click(b);
    expect(onUse).toHaveBeenCalled();
    expect(document.activeElement).toBe(b);
  });
});

describe("on the pack page", () => {
  const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
  const rec = (id: string, name: string, wheelchair: string, category: string) => ({ id, name, wheelchair, category, address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov });
  const data = [rec("a", "Alpha Cafe", "yes", "cafe"), rec("b", "Beta Bar", "limited", "bar"), rec("c", "Gamma Fast Food", "no", "fast_food")];
  const page = () => render(<MemoryRouter><PackPlaces places={data} locale="en" today="2026-11-15" /></MemoryRouter>);
  const box = () => screen.getByLabelText("Search by name, address or kind");
  const names = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent).sort();

  it("appears when a search of several parts finds nothing, and takes a part out when asked", () => {
    page();
    fireEvent.change(box(), { target: { value: "tag:no kind:cafe" } });
    expect(names()).toEqual([]);
    expect(document.querySelector("[data-pack-search-why]")).not.toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Take out “tag:no”" }));
    expect((box() as HTMLInputElement).value).toBe("kind:cafe");
    expect(names()).toEqual(["Alpha Cafe"]);
    expect(document.querySelector("[data-pack-search-why]")).toBeNull();
  });
  it("is not there when the search finds places or is only one part", () => {
    page();
    fireEvent.change(box(), { target: { value: "cafe" } });
    expect(document.querySelector("[data-pack-search-why]")).toBeNull();
    fireEvent.change(box(), { target: { value: "zzzz" } });
    expect(document.querySelector("[data-pack-search-why]")).toBeNull();
    expect(within(document.body).queryByText("Why nothing matched")).toBeNull();
  });
});
