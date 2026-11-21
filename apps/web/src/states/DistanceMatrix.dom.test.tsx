/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DistanceMatrix } from "./DistanceMatrix";
import type { SavedFile } from "./downloadFile";
import { bare, place, varied } from "./placeFixtures";
import { lintFrench } from "./typography";

afterEach(cleanup);
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const at = (id: string, lat: number | null, lon: number | null) => place(id, { name: `Place ${id}`, lat, lon });
const three = [at("a", 43.65, -79.38), at("b", 43.7, -79.38), bare("z")];
const open = (locale: "en" | "fr" = "en") => fireEvent.click(screen.getByRole("button", { name: locale === "en" ? "Show distances between these places" : "Afficher les distances entre ces lieux" }));

describe("DistanceMatrix", () => {
  it("renders nothing for fewer than two places", () => {
    expect(render(<DistanceMatrix places={[]} locale="en" />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<DistanceMatrix places={[three[0]!]} locale="en" />).container.innerHTML).toBe("");
  });
  it("starts closed with no table", () => {
    render(<DistanceMatrix places={three} locale="en" />);
    const b = screen.getByRole("button", { name: "Show distances between these places" });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("points the toggle at its panel and flips its label", () => {
    render(<DistanceMatrix places={three} locale="en" />);
    open();
    const b = screen.getByRole("button", { name: "Hide distances between places" });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-controls")!)).toBeTruthy();
  });
  it("opens to a captioned table with a row and a column per place", () => {
    render(<DistanceMatrix places={three} locale="en" />);
    open();
    expect(screen.getByRole("table", { name: /Straight-line distance and direction/ })).toBeTruthy();
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Place a", "Place b", "UNKNOWN"]);
    expect(screen.getAllByRole("columnheader").map((h) => h.textContent)).toEqual(["From", "Place a", "Place b", "UNKNOWN"]);
    expect(screen.getAllByRole("cell")).toHaveLength(9);
  });
  it("writes the distance, direction, same place and UNKNOWN in the cells", () => {
    render(<DistanceMatrix places={three} locale="en" />);
    open();
    const cells = screen.getAllByRole("cell").map((c) => c.textContent);
    expect(cells[0]).toBe("same place");
    expect(cells[1]).toBe("5.6\u00a0km, north");
    expect(cells[2]).toBe("UNKNOWN");
    expect(cells[3]).toBe("5.6\u00a0km, south");
    expect(cells[8]).toBe("same place");
  });
  it("states the summary and the straight-line caveat", () => {
    render(<DistanceMatrix places={three} locale="en" />);
    open();
    expect(screen.getByText("2 of 3 places have a map point and can be measured.")).toBeTruthy();
    expect(screen.getByText(/straight lines between map points/)).toBeTruthy();
  });
  it("saves text and CSV with the right names and contents, and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<DistanceMatrix places={three} locale="en" onSave={onSave} />);
    open();
    fireEvent.click(screen.getByRole("button", { name: "Save the distances as text (.txt)" }));
    expect(onSave.mock.calls[0]![0]).toMatchObject({ name: "distances-between-places.txt" });
    expect(onSave.mock.calls[0]![0].mime).toContain("text/plain");
    expect(document.querySelector("[data-distance-matrix-status]")?.textContent).toBe("Saved distances-between-places.txt.");
    fireEvent.click(screen.getByRole("button", { name: "Save the distances as a spreadsheet (CSV)" }));
    expect(onSave.mock.calls[1]![0].name).toBe("distances-between-places.csv");
    expect(onSave.mock.calls[1]![0].content.charCodeAt(0)).toBe(0xfeff);
  });
  it("says so when saving fails or throws", () => {
    for (const onSave of [() => false, () => { throw new Error("x"); }]) {
      const { unmount } = render(<DistanceMatrix places={three} locale="en" onSave={onSave} />);
      open();
      fireEvent.click(screen.getByRole("button", { name: /spreadsheet/ }));
      expect(document.querySelector("[data-distance-matrix-status]")?.textContent).toBe("This browser cannot save a file here.");
      unmount();
    }
  });
  it("updates when the places change while open", () => {
    const { rerender } = render(<DistanceMatrix places={three} locale="en" />);
    open();
    rerender(<DistanceMatrix places={[three[0]!, three[1]!]} locale="en" />);
    expect(screen.getAllByRole("rowheader")).toHaveLength(2);
  });
  it("is French with French names, typography and the token UNKNOWN", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    const { container } = render(<DistanceMatrix places={three} locale="fr" onSave={onSave} />);
    open("fr");
    expect(screen.getByRole("table", { name: /Distance en ligne droite et direction/ })).toBeTruthy();
    expect(screen.getAllByRole("cell")[1]!.textContent).toBe("5,6\u00a0km, nord");
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les distances comme texte (.txt)" }));
    expect(onSave.mock.calls[0]![0].name).toBe("distances-entre-les-lieux.txt");
    expect(document.querySelector("[data-distance-matrix-status]")?.textContent).toBe("Fichier distances-entre-les-lieux.txt enregistré.");
    expect(container.textContent).not.toMatch(/INCONN/i);
    for (const p of container.querySelectorAll("p")) expect(lintFrench(p.textContent ?? ""), p.textContent ?? "").toEqual([]);
  });
  it("has no axe violations, closed or open, in either language", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container, unmount } = render(<DistanceMatrix places={varied(4, 6)} locale={locale} />);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      open(locale);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      unmount();
    }
  });
  it("uses only buttons as controls, each with a name", () => {
    const { container } = render(<DistanceMatrix places={three} locale="en" />);
    open();
    const controls = [...container.querySelectorAll<HTMLElement>("button, a, input, select, [tabindex], [role=button]")];
    expect(controls).toHaveLength(3);
    for (const c of controls) {
      expect(c.tagName).toBe("BUTTON");
      expect((c.textContent ?? "").trim()).not.toBe("");
    }
  });
});
