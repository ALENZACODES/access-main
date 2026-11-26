/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import type { Locale } from "./stateCopy.ts";
import { VISIT_MARKS_KEY, parseVisitMarks } from "./visitMarks";

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, wheelchair: string) => ({ id, name, wheelchair, category: "attraction", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov });
const small = [rec("a", "Alpha Hall", "yes"), rec("b", "Beta Court", "no"), rec("c", "Gamma Gate", "UNKNOWN")];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

const show = (locale: Locale = "en") => render(<MemoryRouter><PackPlaces places={small} locale={locale} today="2026-11-15" /></MemoryRouter>);
const add = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Add to list ${name}` }));
const openMarks = () => fireEvent.click(screen.getByRole("button", { name: /Mark places as to visit|Marquer les lieux/ }));
const openTransfer = () => fireEvent.click(screen.getByRole("button", { name: /Move your marks|Transférer vos marques/ }));
const paste = (value: string) => fireEvent.change(screen.getByLabelText(/Paste a marks code here|Collez un code de marques/), { target: { value } });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("moving marks from the places list", () => {
  it("has the transfer inside the marks tools, closed until asked for", () => {
    show();
    add("Alpha Hall");
    expect(screen.queryByRole("button", { name: /Move your marks/ })).toBeNull();
    openMarks();
    const toggle = screen.getByRole("button", { name: "Move your marks to another device" });
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByLabelText("Paste a marks code here")).toBeNull();
  });
  it("sets marks from a pasted code for places the pack holds, and keeps them on the device", () => {
    show();
    add("Alpha Hall");
    openMarks();
    openTransfer();
    paste("MARKS v1\n- a | been | Alpha Hall\n- c | to-visit | Gamma Gate\n- elsewhere | been | Nowhere");
    expect(screen.getByText(/2 marks would be set\. 1 is on a place that is not in the pack on this device\./)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Set 2 marks" }));
    expect(parseVisitMarks(localStorage.getItem(VISIT_MARKS_KEY)).map((x) => [x.id, x.status])).toEqual([["a", "been"], ["c", "to-visit"]]);
  });
  it("shows a mark set from a code on the listed place's own group, and on a place listed later", () => {
    show();
    add("Alpha Hall");
    openMarks();
    openTransfer();
    paste("- a | ruled-out\n- b | been");
    fireEvent.click(screen.getByRole("button", { name: "Set 2 marks" }));
    expect((within(screen.getByRole("radiogroup", { name: "Mark for Alpha Hall" })).getByRole("radio", { name: "Ruled out" }) as HTMLInputElement).checked).toBe(true);
    add("Beta Court");
    expect((within(screen.getByRole("radiogroup", { name: "Mark for Beta Court" })).getByRole("radio", { name: "Been there" }) as HTMLInputElement).checked).toBe(true);
  });
  it("sets nothing until the button is pressed", () => {
    show();
    add("Alpha Hall");
    openMarks();
    openTransfer();
    paste("- a | been");
    expect(localStorage.getItem(VISIT_MARKS_KEY)).toBeNull();
  });
  it("is in French on the French page and has no axe violation", async () => {
    const { container } = show("fr");
    fireEvent.click(screen.getByRole("button", { name: /Ajouter à la liste Alpha Hall/ }));
    openMarks();
    openTransfer();
    paste("- a | been");
    expect(screen.getByText("1 marque serait appliquée.")).toBeTruthy();
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("copies a code that another page can read back to the same marks", async () => {
    let copied = "";
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => { copied = t; } }, configurable: true });
    const first = show();
    add("Alpha Hall");
    add("Gamma Gate");
    openMarks();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Mark for Alpha Hall" })).getByRole("radio", { name: "Been there" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Mark for Gamma Gate" })).getByRole("radio", { name: "To visit" }));
    openTransfer();
    fireEvent.click(screen.getByRole("button", { name: "Copy a code for your 2 marks" }));
    await screen.findByText("Marks code copied.");
    expect(copied).toBe("MARKS v1\n- a | been | Alpha Hall\n- c | to-visit | Gamma Gate\n");
    first.unmount();
    localStorage.clear();
    show();
    add("Alpha Hall");
    openMarks();
    openTransfer();
    paste(copied);
    expect(screen.getByText("2 marks would be set.")).toBeTruthy();
  });
});
