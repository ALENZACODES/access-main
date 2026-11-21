/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { PackSort } from "./PackSort";
import { place } from "./placeFixtures";

afterEach(cleanup);
const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../styles/global.css"), "utf8");
const focusables = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")].filter((e) => !e.closest("[hidden]") && e.getAttribute("tabindex") !== "-1");
const label = (c: HTMLElement) => c.textContent || c.closest("label")?.textContent || "";
const ps = [place("a", { name: "Alpha" }), place("b", { name: "Bravo" }), place("c", { name: "Charlie" })];
const EN = "Change the order of the list";
const mount = (over: Partial<Parameters<typeof PackSort>[0]> = {}) => render(<PackSort places={ps} sort="name" onSort={() => undefined} locale="en" {...over} />);

describe("PackSort keyboard and controls", () => {
  it("exposes only the toggle while closed", () => {
    const { container } = mount();
    expect(focusables(container).map(label)).toEqual([EN]);
  });
  it("every control is a real button or radio and is named", () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: EN }));
    for (const c of focusables(container)) {
      expect(["BUTTON", "INPUT"]).toContain(c.tagName);
      expect(label(c).trim()).not.toBe("");
    }
    expect(container.querySelectorAll("div[role=button], span[role=button], a[role=button]")).toHaveLength(0);
  });
  it("the tab order is the toggle, the order choice as one stop, then the two saves", () => {
    const { container } = mount();
    fireEvent.click(screen.getByRole("button", { name: EN }));
    const names = focusables(container).map(label);
    expect(names[0]).toBe("Hide the order of the list");
    expect(names.at(-2)).toMatch(/\.txt/);
    expect(names.at(-1)).toMatch(/CSV/);
    const stops = [...container.querySelectorAll<HTMLInputElement>("input[type=radio]")].filter((r) => r.tabIndex === 0);
    expect(stops).toHaveLength(1);
    expect(stops[0]!.checked).toBe(true);
  });
  it("the one tab stop is the chosen order", () => {
    const { container } = mount({ sort: "street" });
    fireEvent.click(screen.getByRole("button", { name: EN }));
    const stop = [...container.querySelectorAll<HTMLInputElement>("input[type=radio]")].find((r) => r.tabIndex === 0)!;
    expect(stop.closest("label")?.textContent).toBe("Street, then number");
  });
  it("keeps focus on the toggle when it opens and closes", () => {
    mount();
    const t = screen.getByRole("button", { name: EN });
    t.focus();
    fireEvent.click(t);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide the order of the list" }));
  });
  it("choosing and saving never close the panel", () => {
    mount({ onSave: () => true });
    fireEvent.click(screen.getByRole("button", { name: EN }));
    fireEvent.click(screen.getByRole("radio", { name: "Kind of place" }));
    fireEvent.click(screen.getByRole("button", { name: /\.txt/ }));
    expect(screen.getByRole("button", { name: "Hide the order of the list" }).getAttribute("aria-expanded")).toBe("true");
  });
  it("the groups are an ordered list, one item per group, not focusable", () => {
    const { container } = mount({ sort: "name" });
    fireEvent.click(screen.getByRole("button", { name: EN }));
    expect(container.querySelectorAll("ol > li")).toHaveLength(3);
    for (const li of container.querySelectorAll("ol > li")) expect(li.hasAttribute("tabindex")).toBe(false);
  });
});

describe("touch targets in the stylesheet", () => {
  it("gives the shared button rule at least 44px of height", () => {
    const m = /\.btn[^{]*\{[^}]*min-height:\s*(\d+)px/.exec(css);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });
});
