/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { offset } from "./aroundFixtures";
import { PackPlaces } from "./PackPlaces";
import type { Locale } from "./stateCopy";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, north: number | null, east: number | null) => ({
  id, name, wheelchair, category: "cafe", address: "1 Main Street", wheelchair_description: "UNKNOWN", ...(north === null || east === null ? {} : offset(north, east)), provenance: prov,
});
const data = [rec("a", "Alpha Hall", "yes", 0, 0), rec("b", "Beta Cafe", "no", 60, 0), rec("c", "Gamma Bar", "limited", 0, 90), rec("d", "Delta Shop", "yes", 900, 900), rec("e", "Epsilon", "no", null, null)];

afterEach(cleanup);

function show(locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(<MemoryRouter><PackPlaces places={data} locale={locale} today="2026-11-15" /></MemoryRouter>);
}
const search = (value: string) => fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value } });
const titles = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent);

describe("places around a place on the pack page", () => {
  it("is closed on the page to begin with and adds no heading or table", () => {
    show();
    expect(screen.getByRole("button", { name: "Show places around a place" }).getAttribute("aria-expanded")).toBe("false");
    expect([...titles()].sort()).toEqual(["Alpha Hall", "Beta Cafe", "Delta Shop", "Epsilon", "Gamma Bar"]);
  });
  it("lists the neighbours of a chosen card and agrees with the cards on the page", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Show places around a place" }));
    fireEvent.change(screen.getByLabelText("Place to look around"), { target: { value: "a" } });
    const list = screen.getByRole("table", { name: /Places listed around/ });
    expect(within(list).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Beta Cafe", "Gamma Bar"]);
    for (const name of ["Beta Cafe", "Gamma Bar"]) expect(titles()).toContain(name);
  });
  it("goes away when the search leaves a single place, since there is nothing around it", () => {
    show();
    search("alpha");
    expect(titles()).toEqual(["Alpha Hall"]);
    expect(screen.queryByRole("button", { name: "Show places around a place" })).toBeNull();
  });
  it("follows the search: with two places left both can be chosen", () => {
    show();
    search("a");
    fireEvent.click(screen.getByRole("button", { name: "Show places around a place" }));
    const options = within(screen.getByLabelText("Place to look around")).getAllByRole("option").map((o) => o.textContent);
    expect(options.length).toBeGreaterThan(2);
    expect(options.some((o) => o?.startsWith("Epsilon"))).toBe(false);
  });
  it("is in French on the French page", () => {
    show("fr");
    expect(screen.getByRole("button", { name: "Afficher les lieux autour d’un lieu" })).toBeTruthy();
  });
  it("keeps the credit to OpenStreetMap on the page once", () => {
    const { container } = show();
    expect(container.textContent!.split("© OpenStreetMap contributors").length).toBe(2);
  });
});
