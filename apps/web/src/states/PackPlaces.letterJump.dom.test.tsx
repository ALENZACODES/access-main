/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { PackPlaces } from "./PackPlaces";
import type { Locale } from "./stateCopy";
import { foldText } from "./suggest";

const shipped = (JSON.parse(contentText) as { places: unknown[] }).places;
const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const small = ["Alpha", "Beta", "Gamma"].map((name, i) => ({ id: `s${i}`, name, wheelchair: "yes", category: "cafe", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov }));

afterEach(cleanup);
function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(<MemoryRouter><PackPlaces places={places} locale={locale} today="2026-11-19" /></MemoryRouter>);
}
const titles = () => screen.queryAllByRole("heading", { level: 3 }).map((h) => h.textContent ?? "");
const nav = () => document.querySelector("[data-letter-jump]");

describe("the letter jump in the pack places page", () => {
  it("is not shown for a short list", () => {
    show(small);
    expect(nav()).toBeNull();
  });
  it("is shown for the shipped pack, above the list, with a button for every starting letter", () => {
    show(shipped);
    expect(nav()).not.toBeNull();
    const list = document.querySelector("ul.record-list")!;
    expect(nav()!.compareDocumentPosition(list) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const letters = new Set(titles().map((t) => foldText(t).charAt(0)).filter((c) => /[a-z]/.test(c)).map((c) => c.toUpperCase()));
    const buttons = [...nav()!.querySelectorAll("button")].map((b) => b.textContent);
    for (const l of letters) expect(buttons).toContain(l);
  });
  it("moves focus to the first shown place that starts with the letter pressed", () => {
    show(shipped);
    const first = (l: string) => titles().find((t) => foldText(t).startsWith(l.toLowerCase()))!;
    const button = [...nav()!.querySelectorAll("button")].find((b) => /^[A-Z]$/.test(b.textContent ?? ""))!;
    fireEvent.click(button);
    expect(document.activeElement?.tagName).toBe("H3");
    expect(document.activeElement?.textContent).toBe(first(button.textContent!));
  });
  it("follows the list: a search that leaves a short list hides it", () => {
    show(shipped);
    fireEvent.change(screen.getByLabelText("Search by name, address or kind"), { target: { value: titles()[0]!.split(" ")[0]! } });
    expect(titles().length).toBeLessThan(10);
    expect(nav()).toBeNull();
  });
  it("leaves the earlier tools on the page", () => {
    show(shipped);
    for (const attr of ["data-list-transfer", "data-note-topics"]) expect(document.querySelector(`[${attr}]`), attr).not.toBeNull();
    expect(screen.getByText("© OpenStreetMap contributors")).toBeTruthy();
  });
  it("works in French", () => {
    show(shipped, "fr");
    expect(screen.getByRole("navigation", { name: "Aller à un lieu par sa première lettre" })).toBeTruthy();
  });
});
