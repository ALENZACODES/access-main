/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { place } from "./placeFixtures";
import type { KeyValueStore } from "./submissionQueue";
import { VisitMarks } from "./VisitMarks";
import { useVisitMarks } from "./useVisitMarks";

const store: KeyValueStore = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
const places = [place("a", { name: "Alpha Hall" }), place("b", { name: "Beta Court" })];
function Harness() {
  const state = useVisitMarks("2026-11-21", store);
  return <VisitMarks places={places} state={state} locale="en" today="2026-11-21" />;
}
afterEach(cleanup);

describe("VisitMarks from the keyboard", () => {
  it("opens with Enter or Space on the button and keeps focus on it", () => {
    render(<Harness />);
    const btn = screen.getByRole("button", { name: /Mark places as to visit/ });
    btn.focus();
    fireEvent.keyDown(btn, { key: "Enter" });
    fireEvent.keyUp(btn, { key: "Enter" });
    expect(document.activeElement).toBe(btn);
  });
  it("is reached in order: the button, then each group's radios, then the save buttons", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Mark places as to visit/ }));
    const order = Array.from(document.querySelectorAll("[data-visit-marks] button, [data-visit-marks] input[type=radio]")).map((el) => (el.tagName === "BUTTON" ? el.textContent : `radio:${(el as HTMLInputElement).value}`));
    expect(order[0]).toMatch(/Hide marks/);
    const at = (label: string) => order.indexOf(label);
    expect(at("Move your marks to another device")).toBeGreaterThan(at("Save the marks as a CSV file"));
    expect(at("Save the marks as a CSV file")).toBe(at("Save the marks as a text file") + 1);
    expect(order.every((o) => o !== null)).toBe(true);
    expect(order.filter((o) => String(o).startsWith("radio:"))).toHaveLength(8);
    expect(at("Save the marks as a text file")).toBeGreaterThan(order.lastIndexOf("radio:ruled-out"));
  });
  it("has no positive tabindex and no element that cannot be reached", () => {
    render(<Harness />);
    fireEvent.click(screen.getByRole("button", { name: /Mark places as to visit/ }));
    for (const el of Array.from(document.querySelectorAll("[data-visit-marks] [tabindex]"))) expect(Number(el.getAttribute("tabindex"))).toBeLessThanOrEqual(0);
  });
});
