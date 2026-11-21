/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OutingPlanner } from "./OutingPlanner";
import { onLine } from "./outingFixtures";

afterEach(cleanup);

const set = [onLine("a", 1, { name: "Aa" }), onLine("b", 2, { name: "Bb" }), onLine("c", 3, { name: "Cc" })];
const mount = () => render(<OutingPlanner places={set} locale="en" today="2026-11-19" onSave={() => true} />);
const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};
const order = () => screen.getAllByRole("row").slice(1).map((r) => r.querySelector("th")!.textContent);
const tabStops = () => [...document.querySelectorAll<HTMLElement>("button, input, [tabindex='0']")];

describe("OutingPlanner by keyboard", () => {
  it("moves a stop with Enter and with Space on its Up and Down buttons", () => {
    mount();
    const down = screen.getByRole("button", { name: "Move Aa down" });
    down.focus();
    press(down, "Enter");
    expect(order()).toEqual(["Bb", "Aa", "Cc"]);
    const up = screen.getByRole("button", { name: "Move Cc up" });
    up.focus();
    press(up, " ");
    expect(order()).toEqual(["Bb", "Cc", "Aa"]);
  });
  it("keeps focus on the button that was pressed, so a second press moves the same stop again", () => {
    mount();
    const down = screen.getByRole("button", { name: "Move Aa down" });
    down.focus();
    press(down, "Enter");
    expect(document.activeElement).toBe(down);
    press(down, "Enter");
    expect(order()).toEqual(["Bb", "Cc", "Aa"]);
  });
  it("tells a keyboard user when a stop cannot move further, and keeps focus there", () => {
    mount();
    const up = screen.getByRole("button", { name: "Move Aa up" });
    up.focus();
    press(up, "Enter");
    expect(document.activeElement).toBe(up);
    expect(document.querySelector("[data-outing-status]")!.textContent).toBe("Aa is already first (position 1).");
  });
  it("has the scrolling table region as a tab stop before the buttons that sit in it, and no stop above tabindex 0", () => {
    mount();
    const stops = tabStops();
    const region = screen.getByRole("region", { name: "Stops in order" });
    const firstMove = screen.getByRole("button", { name: "Move Aa up" });
    expect(stops.indexOf(region)).toBeLessThan(stops.indexOf(firstMove));
    expect(document.querySelectorAll("[tabindex]:not([tabindex='0']):not([tabindex='-1'])")).toHaveLength(0);
  });
  it("puts the order choice and the pace field before the table, and the save buttons after it", () => {
    mount();
    const stops = tabStops();
    const radio = screen.getAllByRole("radio")[0]!;
    const pace = screen.getByRole("textbox");
    const region = screen.getByRole("region", { name: "Stops in order" });
    const save = screen.getByRole("button", { name: "Save the outing (text)" });
    expect(stops.indexOf(radio)).toBeLessThan(stops.indexOf(pace));
    expect(stops.indexOf(pace)).toBeLessThan(stops.indexOf(region));
    expect(stops.indexOf(region)).toBeLessThan(stops.indexOf(save));
  });
});
