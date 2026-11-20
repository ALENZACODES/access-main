/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, lon: number | null) => ({ id, name, wheelchair, category: "attraction", address: "1 Main Street", ...(lon === null ? {} : { lat: 43.65, lon }), provenance: prov });
const places = [rec("a", "Alpha Hall", "yes", -79.38), rec("b", "Beta Court", "no", -79.4), rec("c", "Gamma Gate", "UNKNOWN", -79.39), rec("n", "No Point Place", "limited", null)];

function show(locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-19" />
    </MemoryRouter>,
  );
}
const add = (name: string, locale: Locale = "en") => fireEvent.click(screen.getByRole("button", { name: `${locale === "fr" ? "Ajouter à la liste" : "Add to list"} ${name}` }));
const stops = () => within(screen.getByRole("table", { name: /stops in the order|arrêts dans l’ordre/i })).getAllByRole("row").slice(1).map((r) => within(r).getByRole("rowheader").textContent);

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("the outing planner on the places list", () => {
  it("is not shown with no places on the list, or with one", () => {
    show();
    expect(screen.queryByRole("heading", { name: "Plan an outing" })).toBeNull();
    add("Alpha Hall");
    expect(screen.queryByRole("heading", { name: "Plan an outing" })).toBeNull();
  });
  it("appears when a second place is added, in the order added", () => {
    show();
    add("Beta Court");
    add("Alpha Hall");
    expect(screen.getByRole("heading", { name: "Plan an outing" })).toBeTruthy();
    expect(stops()).toEqual(["Beta Court", "Alpha Hall"]);
  });
  it("follows the list when a place is removed from it", () => {
    show();
    add("Alpha Hall");
    add("Beta Court");
    add("Gamma Gate");
    expect(stops()).toHaveLength(3);
    fireEvent.click(screen.getByRole("button", { name: "Remove from list Gamma Gate" }));
    expect(stops()).toEqual(["Alpha Hall", "Beta Court"]);
  });
  it("disappears when the list is back to one place", () => {
    show();
    add("Alpha Hall");
    add("Beta Court");
    fireEvent.click(screen.getByRole("button", { name: "Remove from list Beta Court" }));
    expect(screen.queryByRole("heading", { name: "Plan an outing" })).toBeNull();
  });
  it("uses the starting point typed above for the first distance, and says it is not stored with the list", () => {
    show();
    add("Alpha Hall");
    add("Beta Court");
    expect(screen.getByText("No starting point is set, so the first stop has no distance.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText(/Latitude/i), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText(/Longitude/i), { target: { value: "-79.45" } });
    expect(screen.getByText("The first distance is from your starting point.")).toBeTruthy();
  });
  it("shows UNKNOWN for a listed place with no map point, and does not invent a distance for it", () => {
    show();
    add("Alpha Hall");
    add("No Point Place");
    const table = screen.getByRole("table", { name: /stops in the order/i });
    const row = within(table).getAllByRole("row").find((r) => within(r).queryByRole("rowheader", { name: "No Point Place" }))!;
    expect(within(row).getAllByRole("cell")[2]!.textContent).toBe("UNKNOWN");
  });
  it("keeps a moved order while the page is open, and writes nothing about it to storage", () => {
    show();
    add("Alpha Hall");
    add("Beta Court");
    const keys = () => Object.keys(localStorage).sort();
    const before = keys();
    fireEvent.click(screen.getByRole("button", { name: "Move Beta Court up" }));
    expect(stops()).toEqual(["Beta Court", "Alpha Hall"]);
    expect(keys()).toEqual(before);
  });
  it("is in French on the French page", () => {
    show("fr");
    add("Alpha Hall", "fr");
    add("Beta Court", "fr");
    expect(screen.getByRole("heading", { name: "Planifier une sortie" })).toBeTruthy();
  });
  it("keeps the page's one credit line after the planner", () => {
    show();
    add("Alpha Hall");
    add("Beta Court");
    const credit = screen.getAllByText("© OpenStreetMap contributors").at(-1)!;
    const planner = document.querySelector("[data-outing]")!;
    expect(planner.compareDocumentPosition(credit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
