/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, note: string | null) => ({ id, name, wheelchair, category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov, ...(note === null ? {} : { wheelchair_description: note }) });

afterEach(cleanup);

function show(places: unknown[], locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-21" />
    </MemoryRouter>,
  );
}
const name = (l: Locale) => (l === "en" ? "Look for a tag and a note that point different ways" : "Chercher une balise et une note qui vont en sens contraire");

describe("the tag and note check on the places list", () => {
  it("is on the page, closed, when a place has a note", () => {
    show([rec("a", "Alpha Hall", "yes", "Two steps at the door.")]);
    expect(screen.getByRole("button", { name: name("en") }).getAttribute("aria-expanded")).toBe("false");
  });
  it("is not on the page when no place has a note", () => {
    show([rec("a", "Alpha Hall", "yes", null)]);
    expect(screen.queryByRole("button", { name: name("en") })).toBeNull();
  });
  it("finds a place whose tag and note point different ways", () => {
    show([rec("a", "Alpha Hall", "yes", "Two steps at the door."), rec("b", "Beta Court", "yes", "Ramp at the side.")]);
    fireEvent.click(screen.getByRole("button", { name: name("en") }));
    expect(screen.getByText("1 place points different ways.")).toBeTruthy();
    expect(document.querySelector("[data-tag-note-list]")!.textContent).toContain("Alpha Hall");
  });
  it("follows a search that narrows the list", () => {
    show([rec("a", "Alpha Hall", "yes", "Two steps at the door."), rec("b", "Beta Court", "no", "Step free entrance.")]);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "Beta" } });
    fireEvent.click(screen.getByRole("button", { name: name("en") }));
    const list = document.querySelector("[data-tag-note-list]")!.textContent!;
    expect(list).toContain("Beta Court");
    expect(list).not.toContain("Alpha Hall");
  });
  it("is in French on the French page", () => {
    show([rec("a", "Alpha Hall", "yes", "Escaliers seulement.")], "fr");
    fireEvent.click(screen.getByRole("button", { name: name("fr") }));
    expect(screen.getByText("1 lieu va en sens contraire.")).toBeTruthy();
  });
});
