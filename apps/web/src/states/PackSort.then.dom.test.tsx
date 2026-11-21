/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { type PackSort as Sort, cleanThen, sortPlaces } from "./packSort";
import { PackSort } from "./PackSort";
import { PROV, place, varied } from "./placeFixtures";
import type { PackPlaceRecord } from "./packPlaces";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const on = (date: string) => ({ ...PROV, retrieved_at: date });
const ps = [
  place("a", { name: "Alpha", category: "cafe", address: "20 Dundas Street East", provenance: on("2026-03-01") }),
  place("b", { name: "Bravo", category: "cafe", address: "5 Dundas Street East", provenance: on("2026-01-01") }),
  place("c", { name: "Charlie", category: "bar", address: "7 Queen Street West", provenance: on("2026-02-01") }),
];

function Host({ places, locale = "en", first = "kind" as Sort }: { places: readonly PackPlaceRecord[]; locale?: "en" | "fr"; first?: Sort }) {
  const [sort, setSort] = useState<Sort>(first);
  const [then, setThen] = useState<Sort | null>(null);
  return (
    <>
      <PackSort places={sortPlaces(places, sort, null, cleanThen(sort, then))} sort={sort} onSort={setSort} then={then} onThen={setThen} locale={locale} />
      <p data-testid="state">{`${sort}/${then ?? "none"}`}</p>
    </>
  );
}
const open = (over: { places?: readonly PackPlaceRecord[]; locale?: "en" | "fr"; first?: Sort } = {}) => {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const v = render(<Host places={over.places ?? ps} locale={locale} first={over.first} />);
  fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Change the order of the list" : "Changer l’ordre de la liste" }));
  return v;
};
const group = (label: string) => screen.getByRole("radiogroup", { name: label });
const rowNames = () => screen.getAllByRole("rowheader").map((h) => h.textContent);

describe("the Then by choice", () => {
  it("is offered only when the parent handles it", () => {
    render(<PackSort places={ps} sort="kind" onSort={() => undefined} locale="en" />);
    fireEvent.click(screen.getByRole("button", { name: "Change the order of the list" }));
    expect(screen.queryByRole("radiogroup", { name: "Then by" })).toBeNull();
  });
  it("starts on no second order and lists the other seven orders after it", () => {
    open();
    const radios = within(group("Then by")).getAllByRole("radio") as HTMLInputElement[];
    expect(radios).toHaveLength(7);
    expect(radios[0]!.closest("label")?.textContent).toBe("No second order");
    expect(radios[0]!.checked).toBe(true);
    expect(radios.map((r) => r.closest("label")?.textContent)).not.toContain("Kind of place");
  });
  it("does not offer the chosen first order as the second", () => {
    open({ first: "street" });
    const names = within(group("Then by")).getAllByRole("radio").map((r) => r.closest("label")?.textContent);
    expect(names).not.toContain("Street, then number");
    expect(names).toContain("Kind of place");
  });
  it("reorders by the second order and says so", () => {
    open();
    expect(rowNames()).toEqual(["Charlie", "Alpha", "Bravo"]);
    fireEvent.click(within(group("Then by")).getByRole("radio", { name: "Street, then number" }));
    expect(rowNames()).toEqual(["Charlie", "Bravo", "Alpha"]);
    expect(screen.getByRole("status").textContent).toBe("Ordered by: Kind of place, then Street, then number. 3 places.");
    expect(screen.getByTestId("state").textContent).toBe("kind/street");
  });
  it("adds a column for the second order to the table", () => {
    open();
    fireEvent.click(within(group("Then by")).getByRole("radio", { name: "Record retrieved, newest first" }));
    expect([...screen.getByRole("table").querySelectorAll("thead th")].map((h) => h.textContent)).toEqual(["Position", "Place", "Kind", "Retrieved"]);
  });
  it("goes back to no second order", () => {
    open();
    fireEvent.click(within(group("Then by")).getByRole("radio", { name: "Street, then number" }));
    fireEvent.click(within(group("Then by")).getByRole("radio", { name: "No second order" }));
    expect(screen.getByTestId("state").textContent).toBe("kind/none");
    expect([...screen.getByRole("table").querySelectorAll("thead th")]).toHaveLength(3);
  });
  it("drops a second order that becomes the same as the first, without error", () => {
    open();
    fireEvent.click(within(group("Then by")).getByRole("radio", { name: "Street, then number" }));
    fireEvent.click(within(group("Order the places by")).getByRole("radio", { name: "Street, then number" }));
    expect([...screen.getByRole("table").querySelectorAll("thead th")]).toHaveLength(3);
    expect(screen.getByRole("status").textContent).toBe("Ordered by: Street, then number. 3 places.");
  });
  it("is in French", () => {
    open({ locale: "fr" });
    expect(screen.getByRole("radiogroup", { name: "Puis par" })).toBeTruthy();
    fireEvent.click(within(group("Puis par")).getByRole("radio", { name: "Rue, puis numéro" }));
    expect(screen.getByRole("status").textContent).toBe("Ordre\u00a0: Type de lieu, puis Rue, puis numéro. 3 lieux.");
  });
  it("the file is saved with both orders in its status line", () => {
    let saved = "";
    render(<PackSort places={ps} sort="kind" onSort={() => undefined} then="street" onThen={() => undefined} locale="en" onSave={(f) => ((saved = f.content), true)} />);
    fireEvent.click(screen.getByRole("button", { name: "Change the order of the list" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the list in this order (.txt)" }));
    expect(saved).toContain("Ordered by: Kind of place, then Street, then number. 3 places.");
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations with a second order, in ${locale}`, async () => {
      const { container } = open({ locale, places: varied(5, 30) });
      fireEvent.click(within(group(locale === "en" ? "Then by" : "Puis par")).getByRole("radio", { name: locale === "en" ? "Street, then number" : "Rue, puis numéro" }));
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
});
