/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { type PackSort as Sort, sortPlaces } from "./packSort";
import { PackSort } from "./PackSort";
import { PROV, place, varied } from "./placeFixtures";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const on = (date: string) => ({ ...PROV, retrieved_at: date });
const ps = [
  place("a", { name: "Alpha", category: "cafe", address: "20 Dundas Street East", wheelchair: "no", provenance: on("2026-03-01") }),
  place("b", { name: "Bravo", category: "bar", address: "5 Dundas Street East", wheelchair: "yes", provenance: on("2026-01-01") }),
  place("c", { name: null, category: null, address: null, wheelchair: null, provenance: null }),
];

function Host({ places, first = "name", locale = "en" }: { places: typeof ps; first?: Sort; locale?: "en" | "fr" }) {
  const [sort, setSort] = useState<Sort>(first);
  return <PackSort places={sortPlaces(places, sort)} sort={sort} onSort={setSort} locale={locale} />;
}
const open = (over: { places?: typeof ps; first?: Sort; locale?: "en" | "fr" } = {}) => {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const v = render(<Host places={over.places ?? ps} first={over.first} locale={locale} />);
  fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Change the order of the list" : "Changer l’ordre de la liste" }));
  return v;
};
const rows = () => within(screen.getByRole("table")).getAllByRole("row").slice(1).map((r) => [...r.querySelectorAll("td, th")].map((c) => c.textContent));

describe("the order table", () => {
  it("has a caption and three column headings", () => {
    open();
    const table = screen.getByRole("table", { name: "The places in the order shown" });
    expect([...table.querySelectorAll("thead th")].map((h) => h.textContent)).toEqual(["Position", "Place", "Name"]);
  });
  it("has one row per place, the place name as the row heading", () => {
    open();
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Alpha", "Bravo", "UNKNOWN"]);
    expect(rows()).toEqual([["1", "Alpha", "Alpha"], ["2", "Bravo", "Bravo"], ["3", "UNKNOWN", "UNKNOWN"]]);
  });
  it("shows the field of the chosen order and reorders when it changes", () => {
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Street, then number" }));
    expect([...screen.getByRole("table").querySelectorAll("thead th")].at(-1)!.textContent).toBe("Street and number");
    expect(rows()).toEqual([["1", "Bravo", "5 Dundas Street East"], ["2", "Alpha", "20 Dundas Street East"], ["3", "UNKNOWN", "UNKNOWN"]]);
    fireEvent.click(screen.getByRole("radio", { name: "Wheelchair tag" }));
    expect(rows().map((r) => r[2])).toEqual(["Yes", "No", "UNKNOWN"]);
    fireEvent.click(screen.getByRole("radio", { name: "Record retrieved, newest first" }));
    expect(rows().map((r) => r[2])).toEqual(["1 March 2026", "1 January 2026", "UNKNOWN"]);
  });
  it("is not built while the section is closed", () => {
    render(<Host places={ps} />);
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("is in French", () => {
    open({ locale: "fr", first: "kind" });
    expect(screen.getByRole("table", { name: "Les lieux dans l’ordre affiché" })).toBeTruthy();
    expect([...screen.getByRole("table").querySelectorAll("thead th")].map((h) => h.textContent)).toEqual(["Position", "Lieu", "Type"]);
  });
  it("cuts a long list at 200 rows and says so", () => {
    open({ places: varied(1, 260) as unknown as typeof ps });
    expect(screen.getAllByRole("rowheader")).toHaveLength(200);
    expect(screen.getByText("Showing the first 200 of 260 places. The saved files hold all of them.")).toBeTruthy();
  });
  it("says nothing about cutting a short list", () => {
    open();
    expect(screen.queryByText(/Showing the first/)).toBeNull();
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations with the table open, in ${locale}`, async () => {
      const { container } = open({ locale, first: "street", places: varied(8, 40) as unknown as typeof ps });
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
});
