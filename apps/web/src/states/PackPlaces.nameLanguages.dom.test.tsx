/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string | null) => ({ id, ...(name === null ? {} : { name }), wheelchair: "yes", category: "attraction", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov });

afterEach(cleanup);

function show(places: unknown[], locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-21" />
    </MemoryRouter>,
  );
}
const toggle = () => screen.getByRole("button", { name: "Look at the language of the names" });
const names = () => Array.from(document.querySelectorAll("[data-name-languages-list] > li > strong")).map((e) => e.textContent);

describe("the language check on the places list", () => {
  it("is on the page, closed", () => {
    show([rec("a", "Bibliothèque municipale")]);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });
  it("is not on the page when no place has a name", () => {
    show([rec("a", null)]);
    expect(screen.queryByRole("button", { name: "Look at the language of the names" })).toBeNull();
  });
  it("reads the names of the places on the list", () => {
    show([rec("a", "Bibliothèque municipale"), rec("b", "Public Library")]);
    fireEvent.click(toggle());
    expect(names()).toEqual(["Bibliothèque municipale", "Public Library"]);
  });
  it("follows a search that narrows the list", () => {
    show([rec("a", "Bibliothèque municipale"), rec("b", "Public Library")]);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "Public" } });
    fireEvent.click(toggle());
    expect(names()).toEqual(["Public Library"]);
  });
  it("is in French on the French page", () => {
    show([rec("a", "Bibliothèque municipale")], "fr");
    fireEvent.click(screen.getByRole("button", { name: "Examiner la langue des noms" }));
    expect(screen.getByText(/Chaque nom est examiné/)).toBeTruthy();
  });
});
