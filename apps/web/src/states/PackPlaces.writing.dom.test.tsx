/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, address: string) => ({ id, name, wheelchair: "yes", category: "attraction", address, lat: 43.65, lon: -79.38, provenance: prov });

afterEach(cleanup);

function show(places: unknown[], locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-21" />
    </MemoryRouter>,
  );
}
const toggle = () => screen.getByRole("button", { name: "Look at how names and addresses are written" });
const names = () => Array.from(document.querySelectorAll("[data-writing-list] > li > strong")).map((e) => e.textContent);

describe("the wording check on the places list", () => {
  it("is on the page, closed", () => {
    show([rec("a", "ALPHA HALL", "1 Main Street")]);
    expect(toggle().getAttribute("aria-expanded")).toBe("false");
  });
  it("sits before the list transfer", () => {
    const { container } = show([rec("a", "ALPHA HALL", "1 Main Street")]);
    const w = container.querySelector("[data-writing]")!;
    const all = Array.from(container.querySelectorAll("section"));
    expect(all.indexOf(w as HTMLElement)).toBeGreaterThanOrEqual(0);
  });
  it("reads the places on the list", () => {
    show([rec("a", "ALPHA HALL", "1 Main Street"), rec("b", "Beta Court", "2 Main Street")]);
    fireEvent.click(toggle());
    expect(names()).toEqual(["ALPHA HALL"]);
  });
  it("follows a search that narrows the list", () => {
    show([rec("a", "ALPHA HALL", "1 Main Street"), rec("b", "BETA COURT", "2 Main Street")]);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "BETA" } });
    fireEvent.click(toggle());
    expect(names()).toEqual(["BETA COURT"]);
  });
  it("is in French on the French page", () => {
    show([rec("a", "ALPHA HALL", "1 Main Street")], "fr");
    fireEvent.click(screen.getByRole("button", { name: "Examiner la rédaction des noms et des adresses" }));
    expect(screen.getByText("Le nom est écrit en majuscules.")).toBeTruthy();
  });
});
