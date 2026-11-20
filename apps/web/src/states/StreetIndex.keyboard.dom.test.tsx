/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import { StreetIndex } from "./StreetIndex";

afterEach(cleanup);
const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../styles/global.css"), "utf8");
const focusables = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")].filter((e) => !e.closest("[hidden]") && e.getAttribute("tabindex") !== "-1");
const at = (id: string, address: string) => place(id, { name: `Place ${id}`, address });
const places = [at("a", "279 Yonge St"), at("b", "281 Yonge Street"), at("c", "20 Dundas Square")];
const openIt = () => fireEvent.click(screen.getByRole("button", { name: "Show these places by street" }));

describe("StreetIndex keyboard and controls", () => {
  it("exposes only the toggle while closed", () => {
    const { container } = render(<StreetIndex places={places} locale="en" />);
    expect(focusables(container).map((c) => c.textContent)).toEqual(["Show these places by street"]);
  });
  it("every control is a button or an input, named, with no div or span acting as a button", () => {
    const { container } = render(<StreetIndex places={places} locale="en" />);
    openIt();
    for (const c of focusables(container)) {
      expect(["BUTTON", "INPUT"]).toContain(c.tagName);
      expect((c.textContent ?? "").trim() !== "" || ((c as HTMLInputElement).labels?.length ?? 0) > 0).toBe(true);
    }
    expect(container.querySelectorAll("div[role=button], span[role=button]")).toHaveLength(0);
  });
  it("reaches the controls in reading order: toggle, order, filter, streets, saves", () => {
    const { container } = render(<StreetIndex places={places} locale="en" />);
    openIt();
    const names = focusables(container).map((c) => c.textContent || c.closest("label")?.textContent || "");
    expect(names[0]).toBe("Hide places by street");
    expect(names.indexOf("Yonge Street")).toBeGreaterThan(2);
    expect(names.indexOf("Yonge Street")).toBeLessThan(names.indexOf("Save all streets as text (.txt)"));
    expect(names.at(-1)).toBe("Save all streets as a spreadsheet (CSV)");
  });
  it("the order choice is one tab stop", () => {
    const { container } = render(<StreetIndex places={places} locale="en" />);
    openIt();
    const radios = [...container.querySelectorAll<HTMLInputElement>("input[type=radio]")];
    expect(radios).toHaveLength(3);
    expect(radios.filter((r) => r.tabIndex === 0)).toHaveLength(1);
  });
  it("pressing a street never moves focus off its button", () => {
    render(<StreetIndex places={places} locale="en" />);
    openIt();
    const b = screen.getByRole("button", { name: "Yonge Street" });
    b.focus();
    fireEvent.click(b);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Yonge Street" }));
  });
  it("saving never closes the panel or hides a shown street", () => {
    render(<StreetIndex places={places} locale="en" onSave={() => true} />);
    openIt();
    fireEvent.click(screen.getByRole("button", { name: "Yonge Street" }));
    fireEvent.click(screen.getByRole("button", { name: /Save all streets as text/ }));
    expect(screen.getAllByRole("table")).toHaveLength(2);
  });
  it("renders its buttons through the shared button", () => {
    const { container } = render(<StreetIndex places={places} locale="en" />);
    openIt();
    for (const b of container.querySelectorAll("button")) expect(b.className).toContain("btn");
  });
  it("the shared button rule gives at least 44px of height", () => {
    const m = /\.btn[^{]*\{[^}]*min-height:\s*(\d+)px/.exec(css);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBeGreaterThanOrEqual(44);
  });
});
