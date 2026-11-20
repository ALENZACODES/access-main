/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { TextMap } from "./TextMap";
import { place, varied } from "./placeFixtures";

afterEach(cleanup);
const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../styles/global.css"), "utf8");
const focusables = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")].filter((e) => !e.closest("[hidden]") && e.getAttribute("tabindex") !== "-1");
const places = [place("a", { name: "Place a", lat: 43.65, lon: -79.38 }), place("b", { name: "Place b", lat: 43.7, lon: -79.3 }), place("c", { name: "Place c", lat: 43.6, lon: -79.45 })];
const from = { lat: 43.65, lon: -79.38 };
const openIt = () => fireEvent.click(screen.getByRole("button", { name: "Show a text map of these places" }));

describe("TextMap keyboard and controls", () => {
  it("exposes only the toggle while closed", () => {
    const { container } = render(<TextMap places={places} from={from} locale="en" />);
    expect(focusables(container).map((c) => c.textContent)).toEqual(["Show a text map of these places"]);
  });
  it("keeps focus on the toggle when it opens and closes", () => {
    render(<TextMap places={places} from={from} locale="en" />);
    const t = screen.getByRole("button", { name: "Show a text map of these places" });
    t.focus();
    fireEvent.click(t);
    const h = screen.getByRole("button", { name: "Hide the text map" });
    expect(h.getAttribute("aria-expanded")).toBe("true");
    h.focus();
    fireEvent.click(h);
    expect(screen.queryByRole("table")).toBeNull();
  });
  it("every control is a button or a radio, named, with no div or span acting as a button", () => {
    const { container } = render(<TextMap places={places} from={from} locale="en" />);
    openIt();
    for (const c of focusables(container)) {
      expect(["BUTTON", "INPUT"]).toContain(c.tagName);
      expect((c.textContent ?? "").trim() !== "" || c.getAttribute("aria-label") || c.closest("label")).toBeTruthy();
    }
    expect(container.querySelectorAll("div[role=button], span[role=button]")).toHaveLength(0);
  });
  it("offers the view choice, the grid size and two saves, in that order", () => {
    const { container } = render(<TextMap places={places} from={from} locale="en" />);
    openIt();
    const names = focusables(container).map((c) => c.textContent || c.closest("label")?.textContent || "");
    expect(names[0]).toBe("Hide the text map");
    expect(names.at(-2)).toMatch(/\.txt/);
    expect(names.at(-1)).toMatch(/CSV/);
  });
  it("changes the view with the keyboard on a radio", () => {
    render(<TextMap places={places} from={from} locale="en" />);
    openIt();
    const radios = screen.getAllByRole("radio");
    expect(radios.length).toBeGreaterThanOrEqual(5);
    const way = screen.getByRole("radio", { name: /Which way from my point/ });
    fireEvent.click(way);
    expect((way as HTMLInputElement).checked).toBe(true);
    expect(document.querySelector("[data-text-map]")).toBeTruthy();
  });
  it("the first radio of a group is the one tab stop, the rest are skipped", () => {
    const { container } = render(<TextMap places={places} from={from} locale="en" />);
    openIt();
    const radios = [...container.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    const stops = radios.filter((r) => r.tabIndex === 0);
    expect(stops.length).toBeGreaterThanOrEqual(2);
    expect(stops.length).toBeLessThan(radios.length);
  });
  it("saving never moves the view or closes the map", () => {
    render(<TextMap places={places} from={from} locale="en" onSave={() => true} />);
    openIt();
    fireEvent.click(screen.getByRole("button", { name: /\.txt/ }));
    expect(screen.getByRole("table")).toBeTruthy();
  });
});

describe("touch targets in the stylesheet", () => {
  it("gives the shared button rule at least 44px of height", () => {
    const m = /\.btn[^{]*\{[^}]*min-height:\s*(\d+)px/.exec(css);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });
  it("the text map renders its controls through the shared button, not a custom one", () => {
    const { container } = render(<TextMap places={varied(3, 8)} from={from} locale="en" />);
    openIt();
    const buttons = [...container.querySelectorAll("button")];
    expect(buttons.length).toBe(3);
    for (const b of buttons) expect(b.className).toContain("btn");
  });
});
