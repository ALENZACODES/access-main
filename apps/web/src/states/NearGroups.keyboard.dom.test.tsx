/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { NearGroups } from "./NearGroups";
import { place } from "./placeFixtures";

afterEach(cleanup);
const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../styles/global.css"), "utf8");
const focusables = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")].filter((e) => !e.closest("[hidden]") && e.getAttribute("tabindex") !== "-1");
const at = (id: string, dLat: number) => place(id, { name: `Place ${id}`, lat: 43.65 + dLat, lon: -79.38 });
const places = [at("a", 0), at("b", 0.0004), at("c", 0.02), at("d", 0.0204)];
const EN = "Show which of these places are close together";
const openIt = () => fireEvent.click(screen.getByRole("button", { name: EN }));
const label = (c: HTMLElement) => c.textContent || c.closest("label")?.textContent || "";

describe("NearGroups keyboard and controls", () => {
  it("every control is a real button or radio and is named", () => {
    const { container } = render(<NearGroups places={places} locale="en" onUsePoint={() => undefined} />);
    openIt();
    for (const c of focusables(container)) {
      expect(["BUTTON", "INPUT"]).toContain(c.tagName);
      expect(label(c).trim()).not.toBe("");
    }
    expect(container.querySelectorAll("div[role=button], span[role=button], a[role=button]")).toHaveLength(0);
  });
  it("the tab order is toggle, view, distance, a point button for each group, then the two saves", () => {
    const { container } = render(<NearGroups places={places} locale="en" onUsePoint={() => undefined} />);
    openIt();
    const names = focusables(container).map(label);
    expect(names[0]).toBe("Hide places close together");
    expect(names.filter((n) => /as my point/.test(n))).toEqual(["Use the middle of Group 1 as my point", "Use the middle of Group 2 as my point"]);
    expect(names.at(-2)).toMatch(/\.txt/);
    expect(names.at(-1)).toMatch(/CSV/);
    expect(names.findIndex((n) => /my point/.test(n))).toBeGreaterThan(names.findIndex((n) => n === "100\u00a0m"));
  });
  it("each radio group is one tab stop", () => {
    const { container } = render(<NearGroups places={places} locale="en" />);
    openIt();
    const stops = [...container.querySelectorAll<HTMLInputElement>("input[type=radio]")].filter((r) => r.tabIndex === 0);
    expect(stops).toHaveLength(2);
  });
  it("changes the distance by clicking a radio and keeps the toggle open", () => {
    render(<NearGroups places={places} locale="en" />);
    openIt();
    const r = screen.getAllByRole("radio")[4] as HTMLInputElement;
    fireEvent.click(r);
    expect(r.checked).toBe(true);
    expect(screen.getByRole("button", { name: "Hide places close together" }).getAttribute("aria-expanded")).toBe("true");
  });
  it("saving and choosing a point never close the panel or move the view", () => {
    render(<NearGroups places={places} locale="en" onSave={() => true} onUsePoint={() => undefined} />);
    openIt();
    fireEvent.click(screen.getByRole("button", { name: /\.txt/ }));
    fireEvent.click(screen.getByRole("button", { name: "Use the middle of Group 1 as my point" }));
    expect(screen.getByRole("heading", { name: "Group 1" })).toBeTruthy();
  });
  it("the status line is a polite live region that is empty until something happens", () => {
    render(<NearGroups places={places} locale="en" />);
    openIt();
    const s = screen.getByRole("status");
    expect(s.textContent).toBe("");
  });
  it("the table in the nearest view has header cells and a caption, so a screen reader can read it by row", () => {
    render(<NearGroups places={places} locale="en" />);
    openIt();
    fireEvent.click(screen.getByRole("radio", { name: "The nearest place to each place" }));
    const table = screen.getByRole("table");
    expect(table.querySelector("caption")?.textContent).toBeTruthy();
    expect(table.querySelectorAll("thead th[scope=col]")).toHaveLength(3);
    expect(table.querySelectorAll("tbody th[scope=row]")).toHaveLength(4);
  });
});

describe("touch targets in the stylesheet", () => {
  it("gives the shared button rule at least 44px of height", () => {
    const m = /\.btn[^{]*\{[^}]*min-height:\s*(\d+)px/.exec(css);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });
});
