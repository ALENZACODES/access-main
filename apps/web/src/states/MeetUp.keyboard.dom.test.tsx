/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MeetUp } from "./MeetUp";
import { place } from "./placeFixtures";

afterEach(cleanup);

const set = [place("a", { name: "Aa", lat: 43.65, lon: -79.39 }), place("b", { name: "Bb", lat: 43.65, lon: -79.37 }), place("c", { name: "Cc", lat: 43.65, lon: -79.3 })];
const mount = () => render(<MeetUp places={set} locale="en" from={{ lat: 43.65, lon: -79.4 }} onSave={() => true} />);
const press = (el: Element, key: string) => {
  fireEvent.keyDown(el, { key });
  fireEvent.keyUp(el, { key });
};

describe("MeetUp by keyboard", () => {
  it("opens with Enter and with Space on the button, and keeps focus on it", () => {
    mount();
    const btn = screen.getByRole("button", { name: "Show places for two people to meet" });
    btn.focus();
    press(btn, "Enter");
    expect(screen.getByLabelText("First point latitude")).toBeTruthy();
    const hide = screen.getByRole("button", { name: "Hide places for two people to meet" });
    expect(document.activeElement).toBe(hide);
    press(hide, " ");
    expect(screen.queryByLabelText("First point latitude")).toBeNull();
    expect(document.activeElement?.textContent).toMatch(/^Show places/);
  });
  it("copies the near-me point with Enter on its button", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Show places for two people to meet" }));
    const use = screen.getByRole("button", { name: "Use the point typed above" });
    use.focus();
    press(use, "Enter");
    expect((screen.getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65000");
  });
  it("shows the order and limit as radio groups, each with one tab stop", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Show places for two people to meet" }));
    const groups = screen.getAllByRole("radiogroup");
    expect(groups).toHaveLength(2);
    for (const g of groups) expect(g.querySelectorAll<HTMLInputElement>("input[type=radio]:not([tabindex='-1'])").length).toBeLessThanOrEqual(1);
    expect(screen.getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked).map((r) => (r as HTMLInputElement).value)).toEqual(["balanced", "10"]);
  });
  it("puts the first point fields before the second point fields in tab order", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Show places for two people to meet" }));
    const order = [...document.querySelectorAll<HTMLElement>("input[type=text], input:not([type])")].map((i) => i.getAttribute("aria-label") ?? i.id);
    const labels = ["First point latitude", "First point longitude", "Second point latitude", "Second point longitude"].map((l) => (screen.getByLabelText(l) as HTMLElement).id);
    expect(labels.map((id) => order.indexOf(id))).toEqual([...labels.map((id) => order.indexOf(id))].sort((x, y) => x - y));
  });
  it("makes the scrolling table region a tab stop once there is a list", () => {
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Show places for two people to meet" }));
    expect(screen.queryByRole("region", { name: "Places by distance from both points" })).toBeNull();
    for (const [l, v] of [["First point latitude", "43.65"], ["First point longitude", "-79.4"], ["Second point latitude", "43.65"], ["Second point longitude", "-79.36"]] as const) fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
    expect(screen.getByRole("region", { name: "Places by distance from both points" }).tabIndex).toBe(0);
  });
});
