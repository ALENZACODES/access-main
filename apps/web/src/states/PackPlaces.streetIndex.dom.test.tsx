/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string, address: string) => ({ id, name, wheelchair, category: "attraction", address, lat: 43.65, lon: -79.38, provenance: prov });
const small = [rec("a", "Alpha Hall", "yes", "279 Yonge St"), rec("b", "Beta Court", "no", "281 Yonge Street"), rec("c", "Gamma Gate", "UNKNOWN", "20 Dundas Square")];
const realPlaces = (JSON.parse(contentText) as { places: unknown[] }).places;

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-15" />
    </MemoryRouter>,
  );
}
beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});
const toggle = () => screen.getByRole("button", { name: "Show these places by street" });

describe("PackPlaces with the street index: adding a street to the list", () => {
  it("adds the street's places to the real list, once, and shows them in Your list", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-street-index]")!).getByRole("button", { name: "Yonge Street" }));
    fireEvent.click(screen.getByRole("button", { name: "Add the 2 places on this street to my list" }));
    expect(document.querySelector("[data-street-index-add]")?.textContent).toBe("Yonge Street: 2 places added.");
    expect(screen.getByRole("heading", { level: 2, name: "Your list (2 of 12)" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add the 2 places on this street to my list" }));
    expect(document.querySelector("[data-street-index-add]")?.textContent).toBe("Yonge Street: 2 already on the list.");
    expect(screen.getByRole("heading", { level: 2, name: "Your list (2 of 12)" })).toBeTruthy();
  });
  it("marks the cards of those places as listed", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-street-index]")!).getByRole("button", { name: "Yonge Street" }));
    fireEvent.click(screen.getByRole("button", { name: "Add the 2 places on this street to my list" }));
    expect(screen.getByRole("button", { name: "Remove from list Alpha Hall" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Add to list Gamma Gate" }).getAttribute("aria-pressed")).toBe("false");
  });
  it("is in French on the page", () => {
    show(small, "fr");
    fireEvent.click(screen.getByRole("button", { name: "Afficher ces lieux par rue" }));
    fireEvent.click(within(document.querySelector<HTMLElement>("[data-street-index]")!).getByRole("button", { name: "Yonge Street" }));
    fireEvent.click(screen.getByRole("button", { name: "Ajouter à ma liste les 2 lieux de cette rue" }));
    expect(document.querySelector("[data-street-index-add]")?.textContent).toBe("Yonge Street\u00a0: 2 lieux ajoutés.");
  });
});

describe("PackPlaces with the street index", () => {
  it("offers the street index on the page for the shown places", () => {
    show(small);
    expect(toggle()).toBeTruthy();
    fireEvent.click(toggle());
    expect(screen.getByText("3 of 3 places have an address that reads as one street, on 2 streets.")).toBeTruthy();
  });
  it("follows the filters: only the places shown are grouped", () => {
    show(small);
    fireEvent.click(toggle());
    expect(within(document.querySelector<HTMLElement>("[data-street-index]")!).getAllByRole("rowheader").map((h) => h.textContent)).toContain("Yonge Street");
    fireEvent.click(screen.getByRole("radio", { name: /^No/ }));
    expect(screen.getByText("1 of 1 places have an address that reads as one street, on 1 street.")).toBeTruthy();
  });
  it("follows a search by name", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "Gamma" } });
    expect(within(document.querySelector<HTMLElement>("[data-street-index]")!).getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Dundas Square"]);
  });
  it("is not offered when the search finds nothing", () => {
    show(small);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: "zzzzqqq" } });
    expect(screen.queryByRole("button", { name: "Show these places by street" })).toBeNull();
  });
  it("writes nothing to this device", () => {
    show(small);
    fireEvent.click(toggle());
    fireEvent.click(document.querySelector<HTMLElement>("[data-street-index] tbody th button")!);
    expect(localStorage.length).toBe(0);
  });
  it("works with the shipped pack in both languages, using only the addresses it gives", () => {
    for (const locale of ["en", "fr"] as const) {
      const { unmount } = show(realPlaces, locale);
      fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show these places by street" : "Afficher ces lieux par rue" }));
      const root = document.querySelector("[data-street-index]")!;
      const rows = [...root.querySelectorAll("tbody th")];
      expect(rows.length).toBeGreaterThan(0);
      for (const r of rows) expect((r.textContent ?? "").trim()).not.toBe("");
      expect(root.textContent).not.toMatch(/INCONN/i);
      unmount();
    }
  });
  it("never places a shipped place with the address UNKNOWN on a street", () => {
    show(realPlaces);
    fireEvent.click(toggle());
    const unknownAddress = (realPlaces as { address?: string }[]).filter((p) => p.address === "UNKNOWN" || p.address === undefined).length;
    const text = screen.getByText(/places have an address that reads as one street/).textContent ?? "";
    const onStreet = Number(/^(\d+) of/.exec(text)![1]);
    expect(onStreet).toBeLessThanOrEqual(realPlaces.length - unknownAddress);
  });
});
