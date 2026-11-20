/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces";
import type { Locale } from "./stateCopy";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, note: string) => ({ id, name, wheelchair, category: "cafe", address: "1 Main Street", wheelchair_description: note, lat: 43.65, lon: -79.38, provenance: prov });
const data = [rec("a", "Alpha Hall", "yes", "Ramp at the side door"), rec("b", "Beta Cafe", "no", "Two steps at the front"), rec("c", "Gamma Bar", "limited", "UNKNOWN"), rec("d", "Delta Shop", "yes", "UNKNOWN")];

afterEach(cleanup);

function show(locale: Locale = "en", places: unknown = data) {
  document.documentElement.lang = locale;
  return render(<MemoryRouter><PackPlaces places={places} locale={locale} today="2026-11-15" /></MemoryRouter>);
}
const search = (value: string) => fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value } });

describe("the words reader on the pack page", () => {
  it("is closed to begin with and adds no heading to the page", () => {
    show();
    expect(screen.getByRole("button", { name: "Show the words in the notes" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent).sort()).toEqual(["Alpha Hall", "Beta Cafe", "Delta Shop", "Gamma Bar"]);
  });
  it("reads the notes of the places the page shows", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Show the words in the notes" }));
    expect(within(screen.getByRole("list", { name: "Notes" })).getAllByRole("listitem")).toHaveLength(2);
    expect(screen.getByText("At least one of these words appears in 2 of 2 notes.")).toBeTruthy();
  });
  it("follows the page's own search: places the search hides are not read", () => {
    show();
    search("beta");
    fireEvent.click(screen.getByRole("button", { name: "Show the words in the notes" }));
    expect(screen.getByText("At least one of these words appears in 1 of 1 note.")).toBeTruthy();
    expect(within(screen.getByRole("list", { name: "Notes" })).getAllByRole("listitem")).toHaveLength(1);
  });
  it("goes away when the places shown have no note", () => {
    show();
    search("delta");
    expect(screen.queryByRole("button", { name: "Show the words in the notes" })).toBeNull();
  });
  it("is not there for a pack with no note at all", () => {
    show("en", data.map((p) => ({ ...p, wheelchair_description: "UNKNOWN" })));
    expect(screen.queryByRole("button", { name: "Show the words in the notes" })).toBeNull();
  });
  it("is French on the French page", () => {
    show("fr");
    expect(screen.getByRole("button", { name: "Afficher les mots des notes" })).toBeTruthy();
  });
  it("keeps the OpenStreetMap credit on the page once", () => {
    const { container } = show();
    expect(container.textContent!.split("© OpenStreetMap contributors")).toHaveLength(2);
  });
});
