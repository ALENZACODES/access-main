/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string | null, address: string | null) => ({ id, name, wheelchair: "yes", category: "attraction", address, lat: 43.65, lon: -79.38, provenance: prov });

afterEach(cleanup);

function show(places: unknown[], locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-21" />
    </MemoryRouter>,
  );
}
const toggleName = (locale: Locale) => (locale === "en" ? "Write a call script for a place" : "Préparer un script d’appel pour un lieu");

describe("the call script on the places list", () => {
  it("is on the page, closed, when a place has a name", () => {
    show([rec("a", "Alpha Hall", "5 Elm Street")]);
    expect(screen.getByRole("button", { name: toggleName("en") }).getAttribute("aria-expanded")).toBe("false");
  });
  it("is not on the page when no place has a name", () => {
    show([rec("a", null, "5 Elm Street")]);
    expect(screen.queryByRole("button", { name: toggleName("en") })).toBeNull();
  });
  it("writes a script for a place of the list", () => {
    show([rec("a", "Alpha Hall", "5 Elm Street"), rec("b", "Beta Court", "7 Oak Avenue")]);
    fireEvent.click(screen.getByRole("button", { name: toggleName("en") }));
    fireEvent.click(screen.getByRole("radio", { name: "Beta Court" }));
    expect(document.querySelector("[data-call-script-text]")!.textContent).toContain("seven Oak Avenue");
  });
  it("offers only the places the list shows after a search narrows it", () => {
    show([rec("a", "Alpha Hall", "5 Elm Street"), rec("b", "Beta Court", "7 Oak Avenue")]);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "Alpha" } });
    fireEvent.click(screen.getByRole("button", { name: toggleName("en") }));
    const body = within(document.querySelector<HTMLElement>("[data-call-script-body]")!);
    expect(body.getAllByRole("radio").map((r) => r.closest("label")!.textContent)).toEqual(["Alpha Hall"]);
  });
  it("is in French on the French page", () => {
    show([rec("a", "Alpha Hall", "5 rue Principale")], "fr");
    fireEvent.click(screen.getByRole("button", { name: toggleName("fr") }));
    fireEvent.click(screen.getByRole("radio", { name: "Alpha Hall" }));
    expect(document.querySelector("[data-call-script-text]")!.textContent).toContain("cinq Rue Principale");
  });
});
