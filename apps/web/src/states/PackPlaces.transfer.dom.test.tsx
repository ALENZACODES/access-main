/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PackPlaces } from "./PackPlaces.tsx";
import { MAX_SHORTLIST, SHORTLIST_KEY } from "./shortlist";
import type { Locale } from "./stateCopy.ts";

// Renders the shipped pack with every place tool, often with an axe scan: slow on CI runners.
vi.setConfig({ testTimeout: 20_000 });

const prov = { source_name: "OpenStreetMap, Geofabrik Ontario extract", source_url: "https://www.openstreetmap.org/way/1", licence: "ODbL-1.0", retrieved_at: "2026-11-13", tier: 0 };
const rec = (id: string, name: string, over: Record<string, unknown> = {}) => ({ id, name, wheelchair: "yes", category: "attraction", address: "1 Main Street", lat: 43.65, lon: -79.38, provenance: prov, ...over });
const small = [rec("a", "Alpha Hall"), rec("b", "Beta Court", { lat: null, lon: null }), rec("c", "Gamma Gate", { wheelchair: "no" })];
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

function show(places: unknown, locale: Locale = "en") {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <PackPlaces places={places} locale={locale} today="2026-11-19" />
    </MemoryRouter>,
  );
}
const stored = () => (JSON.parse(localStorage.getItem(SHORTLIST_KEY) ?? "[]") as { id: string }[]).map((e) => e.id);
const openTransfer = () => fireEvent.click(screen.getByRole("button", { name: "Move your list to another device" }));
const paste = (text: string) => fireEvent.change(screen.getByLabelText("Paste a list code here"), { target: { value: text } });

beforeEach(() => localStorage.clear());
afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe("moving the list on the places list", () => {
  it("is offered even before any place is listed", () => {
    show(small);
    expect(screen.getByRole("button", { name: "Move your list to another device" }).getAttribute("aria-expanded")).toBe("false");
  });
  it("adds pasted places to the real list and stores them", () => {
    show(small);
    openTransfer();
    paste("LIST v1\n- c | C\n- a | A\n");
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to your list" }));
    expect(stored()).toEqual(["c", "a"]);
    expect(screen.getByRole("button", { name: "Remove from list Gamma Gate" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove from list Alpha Hall" })).toBeTruthy();
  });
  it("shows the added places in the shortlist table", () => {
    show(small);
    openTransfer();
    paste("- a | A\n- b | B");
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to your list" }));
    const table = screen.getAllByRole("table").find((t) => within(t).queryByText("Alpha Hall"))!;
    expect(within(table).getByText("Beta Court")).toBeTruthy();
  });
  it("round-trips: a list code copied from one list adds the same places on an empty one", async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    show(small);
    fireEvent.click(screen.getByRole("button", { name: "Add to list Gamma Gate" }));
    fireEvent.click(screen.getByRole("button", { name: "Add to list Alpha Hall" }));
    openTransfer();
    fireEvent.click(screen.getByRole("button", { name: "Copy a code for your 2 places" }));
    await screen.findByText("List code copied.");
    const code = writeText.mock.calls[0]![0];
    cleanup();
    localStorage.clear();
    show(small);
    openTransfer();
    paste(code);
    fireEvent.click(screen.getByRole("button", { name: "Add 2 to your list" }));
    expect(stored()).toEqual(["c", "a"]);
  });
  it("leaves out places the pack does not hold, and says so", () => {
    show(small);
    openTransfer();
    paste("- a | A\n- not-here | N");
    expect(screen.getByText(/1 is not in the pack on this device/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Add 1 to your list" }));
    expect(stored()).toEqual(["a"]);
  });
  it("does not add a place that is already listed twice", () => {
    show(small);
    fireEvent.click(screen.getByRole("button", { name: "Add to list Alpha Hall" }));
    openTransfer();
    paste("- a | A");
    expect(screen.getByText(/0 places would be added\. 1 is already on your list\./)).toBeTruthy();
  });
  it("stops at the limit", () => {
    const many = Array.from({ length: MAX_SHORTLIST + 3 }, (_, i) => rec(`p${i}`, `Place ${i}`));
    show(many);
    openTransfer();
    paste(many.map((p) => `- ${p.id} | x`).join("\n"));
    fireEvent.click(screen.getByRole("button", { name: `Add ${MAX_SHORTLIST} to your list` }));
    expect(stored()).toHaveLength(MAX_SHORTLIST);
  });
  it("makes no network request", () => {
    const f = vi.fn();
    vi.stubGlobal("fetch", f);
    show(small);
    openTransfer();
    paste("- a | A");
    fireEvent.click(screen.getByRole("button", { name: "Add 1 to your list" }));
    expect(f).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
  it("is in French when the page is", () => {
    show(small, "fr");
    expect(screen.getByRole("button", { name: "Transférer votre liste vers un autre appareil" })).toBeTruthy();
  });
  it("has no axe violations with the panel open", async () => {
    const { container } = show(small);
    openTransfer();
    paste("- a | A");
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});

describe("large-print page on the shortlist", () => {
  const add = (name: string) => fireEvent.click(screen.getByRole("button", { name: `Add to list ${name}` }));
  it("is not offered with an empty list", () => {
    show(small);
    expect(screen.queryByRole("button", { name: "Make a large-print page" })).toBeNull();
  });
  it("is offered for one place and previews the listed places in order", () => {
    show(small);
    add("Gamma Gate");
    add("Alpha Hall");
    fireEvent.click(screen.getByRole("button", { name: "Make a large-print page" }));
    const preview = document.querySelector("[data-handout-preview]") as HTMLElement;
    expect(within(preview).getAllByRole("listitem").map((l) => l.querySelector("strong")!.textContent)).toEqual(["Gamma Gate", "Alpha Hall"]);
    expect(within(preview).getByRole("heading", { name: "My 2 places" })).toBeTruthy();
  });
  it("follows the list when a place is removed", () => {
    show(small);
    add("Gamma Gate");
    add("Alpha Hall");
    fireEvent.click(screen.getByRole("button", { name: "Make a large-print page" }));
    fireEvent.click(screen.getByRole("button", { name: "Remove from list Gamma Gate" }));
    const preview = document.querySelector("[data-handout-preview]") as HTMLElement;
    expect(within(preview).getAllByRole("listitem")).toHaveLength(1);
  });
  it("has no axe violations with the preview open", async () => {
    const { container } = show(small);
    add("Alpha Hall");
    fireEvent.click(screen.getByRole("button", { name: "Make a large-print page" }));
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});
