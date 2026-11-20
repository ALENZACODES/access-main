/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { Handout } from "./Handout";
import { ListTransfer } from "./ListTransfer";
import { place } from "./placeFixtures";

afterEach(cleanup);
const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../styles/global.css"), "utf8");
const focusables = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")].filter((e) => !e.closest("[hidden]") && e.getAttribute("tabindex") !== "-1");
const ps = [place("a"), place("b")];

describe("Handout controls", () => {
  it("exposes only the toggle while closed", () => {
    const { container } = render(<Handout places={ps} locale="en" today="2026-11-19" />);
    expect(focusables(container).map((c) => c.textContent)).toEqual(["Make a large-print page"]);
  });
  it("reaches size (one stop), options, then save, in reading order", () => {
    const { container } = render(<Handout places={ps} locale="en" today="2026-11-19" />);
    fireEvent.click(screen.getByRole("button"));
    const order = focusables(container).map((c) => (c.tagName === "INPUT" ? (c as HTMLInputElement).type : c.textContent));
    expect(order[0]).toBe("Hide the large-print page");
    // The size choice is one tab stop (the checked radio); the arrow keys move within it.
    expect(order.slice(1, 2)).toEqual(["radio"]);
    expect(order.slice(2, 6)).toEqual(["checkbox", "checkbox", "checkbox", "checkbox"]);
    expect(order.at(-1)).toBe("Save the page (.html)");
  });
  it("lets the radios be chosen with the arrow keys the browser gives, by clicking the input", () => {
    render(<Handout places={ps} locale="en" today="2026-11-19" />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.click(screen.getByRole("radio", { name: "Standard (14 point)" }));
    expect((screen.getByRole("radio", { name: "Standard (14 point)" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "Large (18 point)" }) as HTMLInputElement).checked).toBe(false);
  });
});

describe("ListTransfer controls", () => {
  it("exposes the toggle, then the copy button, the paste box and nothing hidden", () => {
    const { container } = render(<ListTransfer list={[{ id: "a", addedOn: null }]} places={ps} locale="en" add={() => "added"} />);
    expect(focusables(container).map((c) => c.tagName)).toEqual(["BUTTON"]);
    fireEvent.click(screen.getByRole("button"));
    expect(focusables(container).map((c) => c.tagName)).toEqual(["BUTTON", "BUTTON", "TEXTAREA"]);
  });
  it("labels the paste box", () => {
    render(<ListTransfer list={[]} places={ps} locale="en" add={() => "added"} />);
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByLabelText("Paste a list code here").tagName).toBe("TEXTAREA");
  });
});

describe("touch targets", () => {
  it("the stylesheet gives every .btn at least 44px", () => {
    const rule = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((m) => /(^|,)\s*\.btn\s*(,|$)/.test(m[1]!.trim()) && /min-height/.test(m[2]!))![2]!;
    const m = rule.match(/min-height:\s*([\d.]+)(px|rem)/)!;
    expect(m[2] === "rem" ? Number(m[1]) * 16 : Number(m[1])).toBeGreaterThanOrEqual(44);
  });
  it("every button in both panels carries the btn class", () => {
    render(
      <>
        <Handout places={ps} locale="en" today="2026-11-19" />
        <ListTransfer list={[{ id: "a", addedOn: null }]} places={ps} locale="en" add={() => "added"} />
      </>,
    );
    for (const b of screen.getAllByRole("button")) fireEvent.click(b);
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/\bbtn\b/);
  });
  it("the check and radio options use the stylesheet classes that carry the minimum height", () => {
    const { container } = render(<Handout places={ps} locale="en" today="2026-11-19" />);
    fireEvent.click(screen.getByRole("button"));
    expect(container.querySelectorAll(".radio-option, .check-option").length).toBe(7);
  });
});
