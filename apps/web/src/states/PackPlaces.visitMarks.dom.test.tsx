/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import { SHORTLIST_KEY } from "./shortlist";
import { VISIT_MARKS_KEY, parseVisitMarks } from "./visitMarks";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string) => ({ id, name, wheelchair, category: "attraction", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov });
const small = [rec("a", "Alpha Hall", "yes"), rec("b", "Beta Court", "no"), rec("c", "Gamma Gate", "UNKNOWN")];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

const show = () => render(<MemoryRouter><PackPlaces places={small} locale="en" today="2026-11-15" /></MemoryRouter>);
const add = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Add to list ${name}` }));
const marksButton = () => screen.queryByRole("button", { name: /Mark places as to visit/ });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("visit marks on the places list", () => {
  it("offers no marks until a place is listed", () => {
    show();
    expect(marksButton()).toBeNull();
  });
  it("offers marks for the listed places only, in the order they were listed", () => {
    show();
    add("Gamma Gate");
    add("Alpha Hall");
    fireEvent.click(marksButton()!);
    const groups = screen.getAllByRole("radiogroup").map((g) => document.getElementById(g.getAttribute("aria-labelledby")!)?.textContent);
    expect(groups.filter((g) => g?.startsWith("Mark for"))).toEqual(["Mark for Gamma Gate", "Mark for Alpha Hall"]);
  });
  it("keeps a mark on the device with its own key, apart from the list", () => {
    show();
    add("Alpha Hall");
    fireEvent.click(marksButton()!);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Mark for Alpha Hall" })).getByRole("radio", { name: "To visit" }));
    expect(parseVisitMarks(localStorage.getItem(VISIT_MARKS_KEY))).toEqual([{ id: "a", status: "to-visit", markedOn: "2026-11-15" }]);
    expect(JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? "[]")).toEqual([{ id: "a", addedOn: "2026-11-15" }]);
  });
  it("does not change the list or the pack's facts when a place is marked", () => {
    show();
    add("Beta Court");
    const before = document.body.textContent;
    fireEvent.click(marksButton()!);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Mark for Beta Court" })).getByRole("radio", { name: "Ruled out" }));
    expect(screen.getByRole("heading", { level: 2, name: "Your list (1 of 12)" })).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? "[]")).toHaveLength(1);
    expect(before).toContain("Beta Court");
  });
  it("shows a stored mark again after the page is opened again", () => {
    const first = show();
    add("Alpha Hall");
    fireEvent.click(marksButton()!);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Mark for Alpha Hall" })).getByRole("radio", { name: "Been there" }));
    first.unmount();
    show();
    fireEvent.click(marksButton()!);
    expect((within(screen.getByRole("radiogroup", { name: "Mark for Alpha Hall" })).getByRole("radio", { name: "Been there" }) as HTMLInputElement).checked).toBe(true);
  });
  it("keeps a mark when its place leaves the list and offers to remove it", () => {
    show();
    add("Alpha Hall");
    fireEvent.click(marksButton()!);
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Mark for Alpha Hall" })).getByRole("radio", { name: "Been there" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from list Alpha Hall" }));
    expect(parseVisitMarks(localStorage.getItem(VISIT_MARKS_KEY))).toHaveLength(1);
  });
  it("has no axe violation on the page with marks open", async () => {
    const { container } = show();
    add("Alpha Hall");
    fireEvent.click(marksButton()!);
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});
