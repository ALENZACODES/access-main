/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PackSearchHelp } from "./PackSearchHelp";
import { searchPlaces } from "./packSearchFixtures";

afterEach(cleanup);
const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};
const toggle = () => screen.getByRole("button", { name: /^(Show|Hide) the search tips$/ });
const stops = () => [...document.querySelectorAll<HTMLElement>("button, input, select, [tabindex='0']")];

describe("PackSearchHelp by keyboard", () => {
  it("opens and closes with Enter and Space and keeps focus on the toggle", () => {
    render(<PackSearchHelp places={searchPlaces()} locale="en" onTry={() => undefined} />);
    const b = toggle();
    b.focus();
    press(b, "Enter");
    expect(b.getAttribute("aria-expanded")).toBe("true");
    expect(document.activeElement).toBe(b);
    press(b, " ");
    expect(b.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(b);
  });
  it("puts the first Try button straight after the toggle, and every Try button in the tab order", () => {
    render(<PackSearchHelp places={searchPlaces()} locale="en" onTry={() => undefined} />);
    press(toggle(), "Enter");
    const s = stops();
    expect(s[0]).toBe(toggle());
    expect(s[1]!.getAttribute("aria-label")).toBe("Try this search: cafe OR bar");
    expect(s.filter((e) => /^Try this search/.test(e.getAttribute("aria-label") ?? ""))).toHaveLength(7);
    for (const el of document.querySelectorAll("[tabindex]")) expect(Number(el.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
  });
  it("tries an example with Enter and with Space", () => {
    const onTry = vi.fn();
    render(<PackSearchHelp places={searchPlaces()} locale="en" onTry={onTry} />);
    press(toggle(), "Enter");
    const b = screen.getByRole("button", { name: "Try this search: note:washroom" });
    b.focus();
    press(b, "Enter");
    press(b, " ");
    expect(onTry).toHaveBeenCalledTimes(2);
    expect(onTry).toHaveBeenLastCalledWith("note:washroom");
  });
});
