/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SavedFile } from "./downloadFile";
import { NearGroups } from "./NearGroups";
import { bare, place, varied } from "./placeFixtures";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const at = (id: string, dLat: number, over: Record<string, unknown> = {}) => place(id, { lat: 43.65 + dLat, lon: -79.38, ...over });
const STEP = 0.0004;
const ps = [at("a", 0, { name: "Alpha" }), at("b", STEP, { name: "Bravo", wheelchair: "no" }), at("c", 0.02, { name: "Charlie" }), bare("z")];
/** The two view radios come first, then the four distances. */
const distances = () => screen.getAllByRole("radio").slice(2);
const EN = "Show which of these places are close together";
const FR = "Afficher quels lieux sont proches les uns des autres";

function open(over: { places?: typeof ps; locale?: "en" | "fr"; onSave?: (f: SavedFile) => boolean } = {}) {
  const locale = over.locale ?? "en";
  document.documentElement.lang = locale;
  const view = render(<NearGroups places={over.places ?? ps} locale={locale} onSave={over.onSave} />);
  fireEvent.click(screen.getByRole("button", { name: locale === "en" ? EN : FR }));
  return view;
}

describe("opening", () => {
  it("renders nothing for fewer than two places", () => {
    expect(render(<NearGroups places={[]} locale="en" />).container.innerHTML).toBe("");
    cleanup();
    expect(render(<NearGroups places={[ps[0]!]} locale="en" />).container.innerHTML).toBe("");
  });
  it("starts closed and builds nothing", () => {
    render(<NearGroups places={ps} locale="en" />);
    const b = screen.getByRole("button", { name: EN });
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByRole("heading")).toBeNull();
    expect(document.querySelector("[hidden]")).not.toBeNull();
  });
  it("opens, names the panel it controls, and closes", () => {
    open();
    const b = screen.getByRole("button", { name: "Hide places close together" });
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById(b.getAttribute("aria-controls")!)).not.toBeNull();
    fireEvent.click(b);
    expect(screen.queryByRole("heading")).toBeNull();
  });
  it("keeps focus on the toggle", () => {
    render(<NearGroups places={ps} locale="en" />);
    const b = screen.getByRole("button", { name: EN });
    b.focus();
    fireEvent.click(b);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide places close together" }));
  });
});

describe("the result", () => {
  it("shows the summary, the caveat, each group and those alone", () => {
    open();
    expect(screen.getByText(/1 group with 2 places/)).toBeTruthy();
    expect(screen.getByText(/does not say that a person can get/)).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Group 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "On their own" })).toBeTruthy();
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Alpha", "Bravo", "Charlie"]);
    expect(screen.getByText("1 without a map point: UNKNOWN.")).toBeTruthy();
  });
  it("leaves out the alone and no-point parts when empty", () => {
    open({ places: [at("a", 0), at("b", STEP)] });
    expect(screen.queryByRole("heading", { name: "On their own" })).toBeNull();
    expect(screen.queryByText(/without a map point/)).toBeNull();
  });
  it("shows an unnamed place as UNKNOWN", () => {
    open({ places: [at("a", 0, { name: null }), at("b", STEP, { name: "Bravo" })] });
    expect(screen.getAllByRole("listitem").map((l) => l.textContent)).toEqual(["Bravo", "UNKNOWN"]);
  });
});

describe("the distance choice", () => {
  it("offers the four distances with 100 m chosen", () => {
    open();
    const radios = distances();
    expect(radios.map((r) => r.closest("label")?.textContent)).toEqual(["50\u00a0m", "100\u00a0m", "250\u00a0m", "500\u00a0m"]);
    expect((radios[1] as HTMLInputElement).checked).toBe(true);
  });
  it("regroups when a larger distance is chosen", () => {
    open({ places: [at("a", 0), at("b", 0.001), at("c", 0.02)] });
    expect(screen.getByText(/No two places are within 100/)).toBeTruthy();
    fireEvent.click(distances()[2]!);
    expect(screen.getByText(/1 group with 2 places/)).toBeTruthy();
  });
  it("keeps the chosen distance when closed and reopened", () => {
    open();
    fireEvent.click(distances()[3]!);
    fireEvent.click(screen.getByRole("button", { name: "Hide places close together" }));
    fireEvent.click(screen.getByRole("button", { name: EN }));
    expect((distances()[3] as HTMLInputElement).checked).toBe(true);
  });
});

describe("saving", () => {
  it("saves the text and says so", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    open({ onSave });
    fireEvent.click(screen.getByRole("button", { name: "Save the groups as text (.txt)" }));
    expect(onSave).toHaveBeenCalledOnce();
    const f = onSave.mock.calls[0]![0];
    expect(f.name).toBe("places-close-together.txt");
    expect(f.mime).toBe("text/plain;charset=utf-8");
    expect(f.content).toContain("Group 1");
    expect(screen.getByRole("status").textContent).toBe("Saved places-close-together.txt.");
  });
  it("saves the CSV with the chosen distance", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    open({ onSave });
    fireEvent.click(distances()[3]!);
    fireEvent.click(screen.getByRole("button", { name: "Save the groups as a spreadsheet (CSV)" }));
    const f = onSave.mock.calls[0]![0];
    expect(f.name).toBe("places-close-together.csv");
    expect(f.content).toContain(",500\r\n");
  });
  it("says so when the browser cannot save, or saving throws", () => {
    open({ onSave: () => false });
    fireEvent.click(screen.getByRole("button", { name: "Save the groups as text (.txt)" }));
    expect(screen.getByRole("status").textContent).toBe("This browser cannot save a file here.");
    cleanup();
    open({ onSave: () => { throw new Error("no"); } });
    fireEvent.click(screen.getByRole("button", { name: "Save the groups as text (.txt)" }));
    expect(screen.getByRole("status").textContent).toBe("This browser cannot save a file here.");
  });
});

describe("French", () => {
  it("has French words and typographic spacing", () => {
    open({ locale: "fr" });
    expect(screen.getByRole("heading", { name: "Groupe 1" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Seuls" })).toBeTruthy();
    expect(document.body.textContent).toContain("sans point de carte\u00a0: UNKNOWN");
    expect(lintFrench(document.body.textContent ?? "")).toEqual([]);
  });
  it("saves French files", () => {
    const onSave = vi.fn<(f: SavedFile) => boolean>(() => true);
    open({ locale: "fr", onSave });
    fireEvent.click(screen.getByRole("button", { name: "Enregistrer les groupes comme texte (.txt)" }));
    expect(onSave.mock.calls[0]![0].name).toBe("lieux-proches.txt");
    expect(screen.getByRole("status").textContent).toBe("Fichier lieux-proches.txt enregistré.");
  });
});

describe("keyboard and accessibility", () => {
  const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../styles/global.css"), "utf8");
  it("exposes only the toggle while closed", () => {
    const { container } = render(<NearGroups places={ps} locale="en" />);
    const f = [...container.querySelectorAll<HTMLElement>("button, input, [tabindex]")].filter((e) => !e.closest("[hidden]"));
    expect(f.map((e) => e.textContent)).toEqual([EN]);
  });
  it("adds no positive tabindex, and only the radios rove (one tab stop for the group)", () => {
    open();
    const all = [...document.querySelectorAll("[tabindex]")];
    expect(all.every((e) => Number(e.getAttribute("tabindex")) <= 0)).toBe(true);
    expect(all.filter((e) => e.getAttribute("tabindex") === "-1").every((e) => e.getAttribute("type") === "radio")).toBe(true);
  });
  it("global styles give controls a visible focus outline and a 44px target", () => {
    expect(css).toMatch(/:focus-visible/);
    expect(css).toMatch(/44px/);
  });
  for (const locale of ["en", "fr"] as const) {
    it(`has no axe violations open, in ${locale}`, async () => {
      const { container } = open({ locale });
      expect((await axe.run(container, axeRules)).violations).toEqual([]);
    });
  }
  it("has no axe violations with many places", async () => {
    const { container } = open({ places: varied(5, 40) });
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});
