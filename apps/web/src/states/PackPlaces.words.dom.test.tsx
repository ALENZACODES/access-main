/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackPlaces } from "./PackPlaces";
import type { Locale } from "./stateCopy";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, category: string, address: string, note = "UNKNOWN") => ({ id, name, wheelchair, category, address, wheelchair_description: note, lat: 43.65, lon: -79.38, provenance: prov });
const data = [
  rec("a", "Alpha Cafe", "yes", "cafe", "1 Main Street", "Ramp at the side door"),
  rec("b", "Beta Bar", "limited", "bar", "2 Main Street"),
  rec("c", "Starbucks", "no", "cafe", "10 Dundas Street East"),
  rec("d", "Corner Pharmacy", "yes", "pharmacy", "4 Queen Street"),
];

afterEach(cleanup);
function show(locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(<MemoryRouter><PackPlaces places={data} locale={locale} today="2026-11-15" /></MemoryRouter>);
}
const box = (locale: Locale = "en") => screen.getByLabelText(locale === "en" ? "Search by name, address or kind" : "Rechercher par nom, adresse ou type");
const search = (value: string, locale: Locale = "en") => fireEvent.change(box(locale), { target: { value } });
const names = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent).sort();

describe("the word help in the pack places page", () => {
  it("shows no word help for a search whose words are all found", () => {
    show();
    search("main");
    expect(document.querySelector("[data-pack-search-words]")).toBeNull();
    expect(names()).toEqual(["Alpha Cafe", "Beta Bar"]);
  });
  it("offers the word the pack has for a misspelt one, and pressing it fills the box and the list", () => {
    show();
    search("starbuks");
    expect(names()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Search for “starbucks”" }));
    expect((box() as HTMLInputElement).value).toBe("starbucks");
    expect(names()).toEqual(["Starbucks"]);
    expect(document.querySelector("[data-pack-search-words]")).toBeNull();
  });
  it("helps a French speaker find a kind the pack names in English", () => {
    show("fr");
    search("pharmacie", "fr");
    expect(names()).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Chercher «\u202fpharmacy\u202f»" }));
    expect(names()).toEqual(["Corner Pharmacy"]);
  });
  it("lists the words of the pack in a closed section, and a word pressed becomes the search", () => {
    show();
    expect(document.querySelector("[data-pack-words-body]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Show the words" }));
    fireEvent.click(screen.getByRole("button", { name: "Search for “dundas”" }));
    expect((box() as HTMLInputElement).value).toBe("dundas");
    expect(names()).toEqual(["Starbucks"]);
  });
  it("keeps the words section when the search changes", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Show the words" }));
    search("zzzz");
    expect(document.querySelector("[data-pack-words-body]")).not.toBeNull();
  });
  it("keeps the other search help in place", () => {
    show();
    expect(document.querySelector("[data-pack-search-help]")).not.toBeNull();
    search("cafe zzzz");
    expect(document.querySelector("[data-pack-search-why]")).not.toBeNull();
    expect(document.querySelector("[data-pack-search-words]")).not.toBeNull();
  });
});
