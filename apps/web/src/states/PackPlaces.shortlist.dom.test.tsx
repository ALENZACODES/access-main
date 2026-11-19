/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces.tsx";
import { MAX_SHORTLIST, SHORTLIST_KEY } from "./shortlist";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, over: Record<string, unknown> = {}) => ({ id, name, wheelchair, category: "attraction", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov, ...over });
const small = [rec("a", "Alpha Hall", "yes", { lat: 43.656 }), rec("b", "Beta Court", "no", { lat: 43.7, lon: -79.4 }), rec("c", "Gamma Gate", "UNKNOWN", { lat: 43.66, lon: -79.39 })];
const realPlaces = (JSON.parse(contentText) as { places: unknown[] }).places;
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-15" />
    </MemoryRouter>,
  );
}
const addButton = (name: string) => screen.getByRole("button", { name: `Add to list ${name}` });
const stored = () => JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? "[]") as { id: string }[];

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("shortlist on the places list", () => {
  it("puts an Add to list button on every card, named with the place", () => {
    show(small);
    expect(screen.getAllByRole("button", { name: /^Add to list / })).toHaveLength(3);
    expect(addButton("Alpha Hall").getAttribute("aria-pressed")).toBe("false");
  });
  it("shows no list until a place is added", () => {
    show(small);
    expect(screen.queryByRole("heading", { name: /Your list/ })).toBeNull();
  });
  it("adds a place: the button reads Remove from list and is pressed, and the list appears", () => {
    show(small);
    fireEvent.click(addButton("Beta Court"));
    const button = screen.getByRole("button", { name: "Remove from list Beta Court" });
    expect(button.getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("heading", { level: 2, name: "Your list (1 of 12)" })).toBeTruthy();
    expect(screen.getByText("Beta Court added to the list.")).toBeTruthy();
  });
  it("keeps the list on the device so it is there after the page is opened again", () => {
    const first = show(small);
    fireEvent.click(addButton("Alpha Hall"));
    fireEvent.click(addButton("Gamma Gate"));
    expect(stored().map((e) => e.id)).toEqual(["a", "c"]);
    first.unmount();
    show(small);
    expect(screen.getByRole("heading", { level: 2, name: "Your list (2 of 12)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from list Alpha Hall" })).toBeTruthy();
  });
  it("shows the chosen places side by side with what the pack reports", () => {
    show(small);
    fireEvent.click(addButton("Alpha Hall"));
    fireEvent.click(addButton("Gamma Gate"));
    const table = screen.getByRole("table", { name: /Shortlisted places/ });
    expect(within(table).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Alpha Hall", "Gamma Gate"]);
    const gamma = within(table).getByRole("row", { name: /Gamma Gate/ });
    expect(within(gamma).getAllByRole("cell")[0]!.textContent).toBe("UNKNOWN");
  });
  it("removes a place from the card button and from the table", () => {
    show(small);
    fireEvent.click(addButton("Alpha Hall"));
    fireEvent.click(addButton("Beta Court"));
    fireEvent.click(screen.getByRole("button", { name: "Remove from list Alpha Hall" }));
    expect(screen.getByText("Alpha Hall removed from the list.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Remove Beta Court from the list" }));
    expect(screen.queryByRole("table", { name: /Shortlisted places/ })).toBeNull();
    expect(stored()).toEqual([]);
  });
  it("empties the list and the stored key", () => {
    show(small);
    fireEvent.click(addButton("Alpha Hall"));
    fireEvent.click(screen.getByRole("button", { name: "Empty the list" }));
    expect(screen.queryByRole("heading", { name: /Your list/ })).toBeNull();
    expect(localStorage.getItem(SHORTLIST_KEY)).toBeNull();
    expect(screen.getByRole("button", { name: "Add to list Alpha Hall" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("keeps a chosen place on the list when a search hides its card", () => {
    show(small);
    fireEvent.click(addButton("Alpha Hall"));
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "zzz" } });
    expect(screen.getByRole("heading", { level: 2, name: "Your list (1 of 12)" })).toBeTruthy();
    expect(within(screen.getByRole("table", { name: /Shortlisted places/ })).getAllByRole("rowheader")).toHaveLength(1);
  });
  it("says the list is full at the limit and does not add the next place", () => {
    const many = Array.from({ length: MAX_SHORTLIST + 1 }, (_, i) => rec(`p${i}`, `Spot ${String(i).padStart(2, "0")}`, "yes"));
    show(many);
    for (let i = 0; i < MAX_SHORTLIST; i++) fireEvent.click(addButton(`Spot ${String(i).padStart(2, "0")}`));
    fireEvent.click(addButton(`Spot ${String(MAX_SHORTLIST).padStart(2, "0")}`));
    expect(screen.getByText(`The list is full (${MAX_SHORTLIST} places). Remove one to add another.`)).toBeTruthy();
    expect(stored()).toHaveLength(MAX_SHORTLIST);
  });
  it("starts from a stored list, ignoring damaged entries and ids the pack no longer has", () => {
    localStorage.setItem(SHORTLIST_KEY, JSON.stringify([{ id: "a", addedOn: "2026-11-01" }, { id: "ghost", addedOn: "2026-11-01" }, { id: "bad id" }, 5]));
    show(small);
    expect(screen.getByRole("heading", { level: 2, name: "Your list (2 of 12)" })).toBeTruthy();
    expect(screen.getByText("1 listed place is not in the pack on this device, so nothing about it is known.")).toBeTruthy();
  });
  it("starts empty when the stored value is not JSON", () => {
    localStorage.setItem(SHORTLIST_KEY, "{{{");
    show(small);
    expect(screen.queryByRole("heading", { name: /Your list/ })).toBeNull();
  });
  it("adds distance to the table once a starting point is typed", () => {
    show(small);
    fireEvent.click(addButton("Alpha Hall"));
    expect(screen.queryByRole("columnheader", { name: "Distance" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Latitude"), { target: { value: "43.65" } });
    fireEvent.change(screen.getByLabelText("Longitude"), { target: { value: "-79.38" } });
    expect(screen.getByRole("columnheader", { name: "Distance" })).toBeTruthy();
  });
  it("does not store anything for a pack it cannot read", () => {
    show([null, 5]);
    expect(screen.queryByRole("button", { name: /Add to list/ })).toBeNull();
    expect(localStorage.getItem(SHORTLIST_KEY)).toBeNull();
  });
});

describe("shortlist in French and with the shipped pack", () => {
  it("is French on the cards and in the list", () => {
    show(small, "fr");
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à la liste Alpha Hall" }));
    expect(screen.getByRole("heading", { level: 2, name: "Votre liste (1 sur 12)" })).toBeTruthy();
    expect(screen.getByText("Alpha Hall ajouté à la liste.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Retirer de la liste Alpha Hall" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("has no axe violations with places on the list, in both languages", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container } = show(realPlaces, locale);
      const buttons = screen.getAllByRole("button", { name: locale === "en" ? /^Add to list / : /^Ajouter à la liste / });
      fireEvent.click(buttons[0]!);
      fireEvent.click(buttons[1]!);
      expect((await axe.run(container, axeRules)).violations, locale).toEqual([]);
      cleanup();
      localStorage.clear();
    }
  });
  it("lets the person list the first two places of the shipped pack and see both in the table", () => {
    show(realPlaces);
    const buttons = screen.getAllByRole("button", { name: /^Add to list / });
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[1]!);
    expect(within(screen.getByRole("table", { name: /Shortlisted places/ })).getAllByRole("rowheader")).toHaveLength(2);
  });
});
