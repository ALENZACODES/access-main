/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces";
import type { Locale } from "./stateCopy";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, category: string, address: string, note = "UNKNOWN") => ({ id, name, wheelchair, category, address, wheelchair_description: note, lat: 43.65, lon: -79.38, provenance: prov });
const data = [
  rec("a", "Alpha Cafe", "yes", "cafe", "1 Main Street", "Ramp at the side door"),
  rec("b", "Beta Bar", "limited", "bar", "2 Main Street"),
  rec("c", "Gamma Fast Food", "no", "fast_food", "10 Dundas Street East"),
  rec("d", "Delta Restaurant", "yes", "restaurant", "4 Queen Street"),
];

afterEach(cleanup);

function show(locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(<MemoryRouter><PackPlaces places={data} locale={locale} today="2026-11-15" /></MemoryRouter>);
}
const box = (locale: Locale = "en") => screen.getByLabelText(locale === "en" ? "Search by name, address or kind" : "Rechercher par nom, adresse ou type");
const search = (value: string, locale: Locale = "en") => fireEvent.change(box(locale), { target: { value } });
const names = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent).sort();

describe("the pack search with operators", () => {
  it("searches plain words as before and shows no explanation for them", () => {
    show();
    search("main");
    expect(names()).toEqual(["Alpha Cafe", "Beta Bar"]);
    expect(document.querySelector("[data-pack-search-echo]")).toBeNull();
  });
  it("finds a field, a tag and a phrase", () => {
    show();
    search("kind:fast");
    expect(names()).toEqual(["Gamma Fast Food"]);
    search("tag:yes");
    expect(names()).toEqual(["Alpha Cafe", "Delta Restaurant"]);
    search('"main street"');
    expect(names()).toEqual(["Alpha Cafe", "Beta Bar"]);
  });
  it("finds words in the note, with note:", () => {
    show();
    search("note:ramp");
    expect(names()).toEqual(["Alpha Cafe"]);
    search("ramp");
    expect(names()).toEqual([]);
  });
  it("leaves out and joins with OR", () => {
    show();
    search("main -bar");
    expect(names()).toEqual(["Alpha Cafe"]);
    search("bar OR restaurant");
    expect(names()).toEqual(["Beta Bar", "Delta Restaurant"]);
  });
  it("says how the search was read", () => {
    show();
    search("kind:cafe -bar");
    const echo = document.querySelector("[data-pack-search-echo]")!;
    expect(echo.textContent).toContain("Kind contains “cafe”");
    expect(echo.textContent).toContain("Name, address or kind does not contain “bar”");
  });
  it("still applies the tag menu on top of the search", () => {
    show();
    search("main");
    fireEvent.click(screen.getByRole("radio", { name: /^Limited/ }));
    expect(names()).toEqual(["Beta Bar"]);
  });
  it("says when part of the search was left out, and still searches the rest", () => {
    show();
    search("cafe tag:yess");
    expect(names()).toEqual(["Alpha Cafe"]);
    expect(document.querySelector("[data-pack-search-echo]")!.textContent).toContain("“tag:yess” was left out");
  });
  it("keeps the usual empty-result view when nothing matches", () => {
    show();
    search("kind:zzzz");
    expect(names()).toEqual([]);
    expect(screen.getAllByRole("status").length).toBeGreaterThan(0);
  });
  it("tries an example from the search tips", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Show the search tips" }));
    fireEvent.click(screen.getByRole("button", { name: "Try this search: tag:yes has:note" }));
    expect((box() as HTMLInputElement).value).toBe("tag:yes has:note");
    expect(names()).toEqual(["Alpha Cafe"]);
  });
  it("counts the places each example finds in this pack", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Show the search tips" }));
    const list = screen.getByRole("list", { name: "Examples" });
    expect(within(list).getAllByRole("listitem")[0]!.textContent).toContain("2 places in the pack.");
  });
  it("is French on the French page", () => {
    show("fr");
    expect(screen.getByRole("button", { name: "Afficher les conseils de recherche" })).toBeTruthy();
    search("genre:cafe", "fr");
    expect(names()).toEqual(["Alpha Cafe"]);
    expect(document.querySelector("[data-pack-search-echo]")!.textContent).toContain("Le genre contient");
  });
});
