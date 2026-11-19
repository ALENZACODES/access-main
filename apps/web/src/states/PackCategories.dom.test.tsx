/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { containsForbiddenOrg } from "../../../../packages/shared/test/forbiddenOrg";
import type { SavedFile } from "./downloadFile";
import { PackCategories } from "./PackCategories";
import { parsePackPlaces, type PackPlaceRecord } from "./packPlaces";
import { lintFrench } from "./typography";

const TODAY = "2026-11-19";
const OSM = { source_name: "OpenStreetMap, Geofabrik Ontario extract", licence: "ODbL-1.0", retrieved_at: "2026-11-10", tier: 0 };
const place = (id: string, over: Record<string, unknown> = {}) => ({ id, name: `Place ${id}`, category: "cafe", wheelchair: "yes", lat: 43.65, lon: -79.38, provenance: OSM, ...over });
const parse = (items: unknown[]): PackPlaceRecord[] => [...parsePackPlaces(items).places];
const sample = parse([place("a", { category: "fast_food" }), place("b", { category: "fast_food", wheelchair: "no" }), place("c", { category: null, wheelchair: "" }), place("d", { category: "bar" })]);
const shipped = parse((JSON.parse(contentText) as { places: unknown[] }).places);
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };

afterEach(cleanup);

function show(places: readonly PackPlaceRecord[], over: { locale?: "en" | "fr"; selected?: string | null; onSelect?: (k: string | null) => void; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  return render(<PackCategories places={places} locale={locale} today={TODAY} selected={over.selected ?? null} onSelect={over.onSelect ?? (() => undefined)} onSave={over.onSave} />);
}
const savedLine = () => document.querySelector("[data-kinds-saved]") as HTMLElement;
const bodyRows = () => within(screen.getAllByRole("rowgroup")[1]!).getAllByRole("row");
const cellsOf = (row: HTMLElement) => [within(row).getByRole("rowheader").textContent, ...within(row).getAllByRole("cell").map((c) => c.textContent)];

describe("PackCategories table", () => {
  it("renders nothing for no places", () => {
    const { container } = show([]);
    expect(container.innerHTML).toBe("");
  });
  it("is a named region with no heading of its own and a captioned table with column and row headers", () => {
    show(sample);
    expect(screen.queryAllByRole("heading")).toEqual([]);
    expect(screen.getByRole("region", { name: "Kinds of place" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Places by kind and wheelchair tag" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader").map((c) => c.textContent)).toEqual(["Kind", "Places", "Yes", "Limited", "No", "Designated", "UNKNOWN", "Tag reported with a source", "Show"]);
    expect(screen.getAllByRole("rowheader")).toHaveLength(3);
  });
  it("lists kinds by count with UNKNOWN last and the counts per tag", () => {
    show(sample);
    expect(bodyRows().map(cellsOf)).toEqual([
      ["fast food", "2", "1", "0", "1", "0", "0", "100%", "Show"],
      ["bar", "1", "1", "0", "0", "0", "0", "100%", "Show"],
      ["No kind stated (UNKNOWN)", "1", "0", "0", "0", "0", "1", "0%", "Show"],
    ]);
  });
  it("says what the table is and is not", () => {
    show(sample);
    expect(screen.getByText("4 places: 2 kinds as tagged. 1 place has no kind (UNKNOWN).")).toBeTruthy();
    expect(screen.getByText("Kinds are shown as the pack tags them. A count is not a rating.")).toBeTruthy();
  });
  it("names each Show button by the kind and the count", () => {
    show(sample);
    expect(screen.getByRole("button", { name: "Show fast food (2)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show bar (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Show places with no kind (UNKNOWN) (1)" })).toBeTruthy();
  });
});

describe("PackCategories selection", () => {
  it("reports the chosen kind key", () => {
    const onSelect = vi.fn();
    show(sample, { onSelect });
    fireEvent.click(screen.getByRole("button", { name: "Show fast food (2)" }));
    expect(onSelect).toHaveBeenCalledWith("fast food");
    fireEvent.click(screen.getByRole("button", { name: "Show places with no kind (UNKNOWN) (1)" }));
    expect(onSelect).toHaveBeenLastCalledWith("unknown");
  });
  it("marks the chosen row and pressed button, and the others not", () => {
    show(sample, { selected: "bar" });
    const pressed = screen.getAllByRole("button", { pressed: true });
    expect(pressed.map((b) => b.getAttribute("aria-label"))).toEqual(["Show bar (1)"]);
    expect(pressed[0]!.textContent).toBe("Shown");
    expect(document.querySelectorAll("tr[aria-current='true']")).toHaveLength(1);
    expect(document.querySelector("tr[data-kind='bar']")?.getAttribute("aria-current")).toBe("true");
  });
  it("pressing the chosen kind again clears the choice", () => {
    const onSelect = vi.fn();
    show(sample, { selected: "bar", onSelect });
    fireEvent.click(screen.getByRole("button", { name: "Show bar (1)" }));
    expect(onSelect).toHaveBeenCalledWith(null);
  });
  it("offers a button to show every kind only while a kind is chosen", () => {
    const onSelect = vi.fn();
    const { rerender } = show(sample, { selected: "bar", onSelect });
    expect(screen.getByText("Showing one kind.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Show every kind" }));
    expect(onSelect).toHaveBeenCalledWith(null);
    rerender(<PackCategories places={sample} locale="en" today={TODAY} selected={null} onSelect={onSelect} />);
    expect(screen.queryByRole("button", { name: "Show every kind" })).toBeNull();
  });
  it("says so when the chosen kind has no place under the other filters", () => {
    show(sample, { selected: "museum" });
    expect(screen.getByText(/No place of the chosen kind passes the other filters\./)).toBeTruthy();
    expect(screen.queryAllByRole("button", { pressed: true })).toHaveLength(0);
  });
  it("works as a controlled pair with a parent that holds the choice", () => {
    function Host() {
      const [kind, setKind] = useState<string | null>(null);
      return (
        <>
          <PackCategories places={sample} locale="en" today={TODAY} selected={kind} onSelect={setKind} />
          <p data-testid="chosen">{kind ?? "none"}</p>
        </>
      );
    }
    render(<Host />);
    fireEvent.click(screen.getByRole("button", { name: "Show bar (1)" }));
    expect(screen.getByTestId("chosen").textContent).toBe("bar");
    fireEvent.click(screen.getByRole("button", { name: "Show every kind" }));
    expect(screen.getByTestId("chosen").textContent).toBe("none");
  });
});

describe("PackCategories saving", () => {
  it("saves a CSV with a byte order mark and the English header", () => {
    const files: SavedFile[] = [];
    show(sample, { onSave: (f) => (files.push(f), true) });
    fireEvent.click(screen.getByRole("button", { name: "Save the table (CSV)" }));
    expect(files).toHaveLength(1);
    expect(files[0]).toMatchObject({ name: "pack-kinds.csv", mime: "text/csv;charset=utf-8" });
    expect(files[0]!.content.startsWith("﻿kind,places,tag_yes")).toBe(true);
    expect(savedLine().textContent).toBe("Saved pack-kinds.csv.");
  });
  it("saves the text copy with the credit line", () => {
    const files: SavedFile[] = [];
    show(sample, { onSave: (f) => (files.push(f), true) });
    fireEvent.click(screen.getByRole("button", { name: "Save the table (text)" }));
    expect(files[0]).toMatchObject({ name: "pack-kinds.txt", mime: "text/plain;charset=utf-8" });
    expect(files[0]!.content).toContain("© OpenStreetMap contributors");
  });
  it("saves the table as it is on screen: only the places it was given", () => {
    const files: SavedFile[] = [];
    show(sample.filter((p) => p.category === "bar"), { onSave: (f) => (files.push(f), true) });
    fireEvent.click(screen.getByRole("button", { name: "Save the table (CSV)" }));
    expect(files[0]!.content.split("\r\n").filter(Boolean)).toHaveLength(2);
  });
  it("says plainly when the browser cannot save a file", () => {
    show(sample, { onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the table (CSV)" }));
    expect(savedLine().textContent).toBe("This browser cannot save a file here.");
  });
  it("has an empty polite live line until something is saved, and does not add a second status region", () => {
    show(sample);
    expect(savedLine().getAttribute("aria-live")).toBe("polite");
    expect(screen.queryAllByRole("status")).toEqual([]);
    expect(savedLine().textContent).toBe("");
  });
});

describe("PackCategories in French", () => {
  it("uses French copy, the token UNKNOWN and the French file names", () => {
    const files: SavedFile[] = [];
    show(sample, { locale: "fr", onSave: (f) => (files.push(f), true) });
    expect(screen.getByRole("region", { name: "Types de lieux" })).toBeTruthy();
    expect(screen.getAllByText(/UNKNOWN/).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toMatch(/INCONNU/);
    expect(bodyRows().map(cellsOf)[0]).toEqual(["fast food", "2", "1", "0", "1", "0", "0", "100\u202f%", "Afficher"]);
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer le tableau (CSV)" }));
    expect(files[0]!.name).toBe("types-du-pack.csv");
    expect(savedLine().textContent).toBe("Fichier types-du-pack.csv enregistré.");
  });
  it("sets lang on the section and has no French typography problems", () => {
    show(sample, { locale: "fr", selected: "bar" });
    expect(document.querySelector("[data-pack-kinds]")?.getAttribute("lang")).toBe("fr");
    const text = [...document.querySelectorAll("p, caption, th, button")].map((n) => n.textContent ?? "").join("\n");
    for (const line of text.split("\n")) expect(lintFrench(line), line).toEqual([]);
  });
  it("gives each French Show button a name with the kind and the count", () => {
    show(sample, { locale: "fr" });
    expect(screen.getByRole("button", { name: "Afficher bar (1)" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Afficher lieux sans type (UNKNOWN) (1)" })).toBeTruthy();
  });
});

describe("PackCategories accessibility and safety", () => {
  it.each(["en", "fr"] as const)("has no axe violations (%s)", async (locale) => {
    const { container } = show(shipped, { locale, selected: "cafe" });
    const results = await axe.run(container, axeRules);
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
  });
  it("renders text from the pack as text, never as markup", () => {
    const hostile = parse([place("a", { category: "<img src=x onerror=alert(1)>" })]);
    const { container } = show(hostile);
    expect(container.querySelector("img")).toBeNull();
    expect(container.textContent).toContain("<img src=x onerror=alert(1)>");
  });
  it("shows the shipped pack without naming any organisation and without a verdict word", () => {
    const { container } = show(shipped);
    expect(containsForbiddenOrg(container.textContent ?? "")).toBe(false);
    expect(container.textContent).not.toMatch(/\b(accessible|safe|recommended|best)\b/i);
  });
  it("gives every button a name and a table with no empty header", () => {
    show(shipped);
    for (const b of screen.getAllByRole("button")) expect((b.getAttribute("aria-label") ?? b.textContent ?? "").trim(), b.outerHTML).not.toBe("");
    for (const h of [...screen.getAllByRole("columnheader"), ...screen.getAllByRole("rowheader")]) expect(h.textContent?.trim()).not.toBe("");
  });
});

describe("PackCategories order and minimum", () => {
  const many = parse([
    place("a", { category: "zoo" }),
    place("b", { category: "bar" }),
    place("c", { category: "bar" }),
    place("d", { category: "cafe" }),
    place("e", { category: "cafe" }),
    place("f", { category: "cafe" }),
    place("g", { category: null }),
  ]);
  const kinds = () => screen.getAllByRole("rowheader").map((h) => h.textContent);
  it("starts by count and offers name and share orders as radios", () => {
    show(many);
    expect(kinds()).toEqual(["cafe", "bar", "zoo", "No kind stated (UNKNOWN)"]);
    expect(screen.getByRole("radiogroup", { name: "Order the table by" })).toBeTruthy();
    expect((screen.getByRole("radio", { name: "Number of places" }) as HTMLInputElement).checked).toBe(true);
  });
  it("re-orders by name and keeps UNKNOWN last", () => {
    show(many);
    fireEvent.click(screen.getByRole("radio", { name: "Name" }));
    expect(kinds()).toEqual(["bar", "cafe", "zoo", "No kind stated (UNKNOWN)"]);
  });
  it("hides small kinds, says how many, and brings them back", () => {
    show(many);
    fireEvent.click(screen.getByRole("radio", { name: "At least 2 places" }));
    expect(kinds()).toEqual(["cafe", "bar", "No kind stated (UNKNOWN)"]);
    expect(screen.getByText("1 kind with fewer than 2 places is not shown (1 place).")).toBeTruthy();
    fireEvent.click(screen.getByRole("radio", { name: "Every kind" }));
    expect(kinds()).toHaveLength(4);
    expect(screen.queryByText(/is not shown/)).toBeNull();
  });
  it("keeps the kind that is being shown even when the minimum would hide it", () => {
    show(many, { selected: "zoo" });
    fireEvent.click(screen.getByRole("radio", { name: "At least 5 places" }));
    expect(kinds()).toContain("zoo");
    expect(screen.getByRole("button", { name: "Show zoo (1)" }).getAttribute("aria-pressed")).toBe("true");
  });
  it("saves every kind even while some are hidden from the table", () => {
    const files: SavedFile[] = [];
    show(many, { onSave: (f) => (files.push(f), true) });
    fireEvent.click(screen.getByRole("radio", { name: "At least 5 places" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the table (CSV)" }));
    expect(files[0]!.content.split("\r\n").filter(Boolean)).toHaveLength(5);
  });
  it("is in French", () => {
    show(many, { locale: "fr" });
    fireEvent.click(screen.getByRole("radio", { name: "Au moins 2 lieux" }));
    expect(screen.getByText("1 type de moins de 2 lieux n’est pas affiché (1 lieu).")).toBeTruthy();
    expect(screen.getByRole("radiogroup", { name: "Trier le tableau par" })).toBeTruthy();
  });
});
