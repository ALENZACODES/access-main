/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackPlaces } from "./PackPlaces";
import type { Locale } from "./stateCopy";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, note: string) => ({ id, name, wheelchair, category: "cafe", address: "1 Main Street", wheelchair_description: note, lat: 43.65, lon: -79.38, provenance: prov });
const data = [rec("a", "Alpha Hall", "yes", "Level entrance at the side door"), rec("b", "Beta Cafe", "no", "Two steps at the front"), rec("c", "Gamma Bar", "limited", "UNKNOWN"), rec("d", "Delta Shop", "yes", "UNKNOWN")];

afterEach(cleanup);

function show(locale: Locale = "en", places: unknown = data) {
  document.documentElement.lang = locale;
  return render(<MemoryRouter><PackPlaces places={places} locale={locale} today="2026-11-15" /></MemoryRouter>);
}
const search = (value: string) => fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value } });
const cards = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("the notes reader on the pack page", () => {
  it("is closed to begin with and adds no heading", () => {
    show();
    expect(screen.getByRole("button", { name: "Show the notes" }).getAttribute("aria-expanded")).toBe("false");
    expect([...cards()].sort()).toEqual(["Alpha Hall", "Beta Cafe", "Delta Shop", "Gamma Bar"]);
  });
  it("reads the notes of the places the page shows", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Show the notes" }));
    const list = screen.getByRole("list", { name: "Notes" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("2 of 4 places have a note.")).toBeTruthy();
  });
  it("follows the page's own search: places the search hides are not read", () => {
    show();
    search("beta");
    fireEvent.click(screen.getByRole("button", { name: "Show the notes" }));
    expect(screen.getByText("1 of 1 place has a note.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Notes" })).getAllByRole("listitem")).toHaveLength(1);
  });
  it("goes away when the places shown have no note", () => {
    show();
    search("delta");
    expect(screen.queryByRole("button", { name: "Show the notes" })).toBeNull();
  });
  it("is not there for a pack with no note at all", () => {
    show("en", data.map((p) => ({ ...p, wheelchair_description: "UNKNOWN" })));
    expect(screen.queryByRole("button", { name: "Show the notes" })).toBeNull();
  });
  it("is French on the French page", () => {
    show("fr");
    expect(screen.getByRole("button", { name: "Afficher les notes" })).toBeTruthy();
  });
  it("keeps the OpenStreetMap credit on the page once", () => {
    const { container } = show();
    expect(container.textContent!.split("© OpenStreetMap contributors")).toHaveLength(2);
  });
});
