/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GapMatrix } from "./GapMatrix";
import { bare, place, varied } from "./placeFixtures";
import { lintFrench } from "./typography";
import type { SavedFile } from "./downloadFile";

const TODAY = "2026-11-19";
const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const two = [place("a"), bare("z")];

describe("GapMatrix", () => {
  it("renders nothing for fewer than two places", () => {
    expect(render(<GapMatrix places={[]} locale="en" today={TODAY} />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<GapMatrix places={[two[0]!]} locale="en" today={TODAY} />).container.innerHTML).toBe("");
  });
  it("starts closed with no table", () => {
    render(<GapMatrix places={two} locale="en" today={TODAY} />);
    expect(screen.getByRole("button", { name: "Show the gaps grid" }).getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("opens to a table with a caption, ten column headers and a row per place", () => {
    render(<GapMatrix places={two} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
    expect(screen.getByRole("table", { name: "Details the pack gives for each listed place" })).toBeTruthy();
    expect(screen.getAllByRole("columnheader")).toHaveLength(10);
    expect(screen.getAllByRole("rowheader").map((h) => h.textContent)).toEqual(["Place a", "Name UNKNOWN"]);
  });
  it("shows the word Given or UNKNOWN in every cell, so colour is never the only signal", () => {
    render(<GapMatrix places={two} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
    const cells = screen.getAllByRole("cell");
    expect(cells).toHaveLength(18);
    for (const c of cells) expect(["Given", "UNKNOWN"]).toContain(c.textContent);
  });
  it("says in one sentence how many details are UNKNOWN", () => {
    render(<GapMatrix places={two} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
    expect(screen.getByText("2 places, 18 details: the pack leaves 9 UNKNOWN.")).toBeTruthy();
  });
  it("saves a CSV and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    render(<GapMatrix places={two} locale="en" today={TODAY} onSave={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
    fireEvent.click(screen.getByRole("button", { name: "Save the grid as a spreadsheet (CSV)" }));
    expect(onSave.mock.calls[0]![0].name).toBe("place-gaps.csv");
    expect(onSave.mock.calls[0]![0].mime).toContain("text/csv");
    expect(document.querySelector("[data-gap-status]")?.textContent).toBe("Saved place-gaps.csv.");
  });
  it("says so when saving fails or throws", () => {
    for (const onSave of [() => false, () => { throw new Error("x"); }]) {
      const { unmount } = render(<GapMatrix places={two} locale="en" today={TODAY} onSave={onSave} />);
      fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
      fireEvent.click(screen.getByRole("button", { name: /spreadsheet/ }));
      expect(document.querySelector("[data-gap-status]")?.textContent).toBe("This browser cannot save a file here.");
      unmount();
    }
  });
  it("closes again", () => {
    render(<GapMatrix places={two} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
    fireEvent.click(screen.getByRole("button", { name: "Hide the gaps grid" }));
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("copes with a long list", () => {
    render(<GapMatrix places={varied(6, 60)} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Show the gaps grid" }));
    expect(within(screen.getByRole("table")).getAllByRole("row")).toHaveLength(61);
  });
  it("is correct French with no French word for UNKNOWN", () => {
    const { container } = render(<GapMatrix places={two} locale="fr" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Afficher la grille des lacunes" }));
    for (const el of container.querySelectorAll("p, caption, button, th")) expect(lintFrench(el.textContent ?? ""), el.textContent ?? "").toEqual([]);
    expect(container.textContent).not.toMatch(/INCONN/i);
    expect(container.textContent).toContain("Donné");
  });
  it("has no axe violations open or closed, in either language", async () => {
    for (const locale of ["en", "fr"] as const) {
      const { container, unmount } = render(<GapMatrix places={two} locale={locale} today={TODAY} />);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      fireEvent.click(screen.getAllByRole("button")[0]!);
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
      unmount();
    }
  });
});
