/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, note: string | null) => ({ id, name, wheelchair: "yes", category: "attraction", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov, ...(note === null ? {} : { wheelchair_description: note }) });
const NOTE = "Ramp at the side door. Ring the bell. Staff will help you in.";

afterEach(cleanup);

function show(places: unknown[], locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-21" />
    </MemoryRouter>,
  );
}
const name = (l: Locale) => (l === "en" ? "Show the reading ease of the notes" : "Afficher la facilité de lecture des notes");

describe("the reading check on the places list", () => {
  it("is on the page, closed, when a place has a note", () => {
    show([rec("a", "Alpha Hall", NOTE)]);
    expect(screen.getByRole("button", { name: name("en") }).getAttribute("aria-expanded")).toBe("false");
  });
  it("is not on the page when no place has a note", () => {
    show([rec("a", "Alpha Hall", null)]);
    expect(screen.queryByRole("button", { name: name("en") })).toBeNull();
  });
  it("scores the notes of the places on the list", () => {
    show([rec("a", "Alpha Hall", NOTE), rec("b", "Beta Court", NOTE)]);
    fireEvent.click(screen.getByRole("button", { name: name("en") }));
    const table = document.querySelector<HTMLElement>("[data-note-reading-table]")!;
    expect(within(table).getAllByRole("rowheader").map((r) => r.textContent).sort()).toEqual(["Alpha Hall", "Beta Court"]);
  });
  it("follows a search that narrows the list", () => {
    show([rec("a", "Alpha Hall", NOTE), rec("b", "Beta Court", NOTE)]);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: name("en") }));
    const table = document.querySelector<HTMLElement>("[data-note-reading-table]")!;
    expect(within(table).getAllByRole("rowheader").map((r) => r.textContent)).toEqual(["Alpha Hall"]);
  });
  it("is in French on the French page", () => {
    show([rec("a", "Alpha Hall", "Entrée par le côté. Sonnez la sonnette. Le personnel vous aide.")], "fr");
    fireEvent.click(screen.getByRole("button", { name: name("fr") }));
    expect(screen.getByText(/Score moyen/)).toBeTruthy();
  });
});
