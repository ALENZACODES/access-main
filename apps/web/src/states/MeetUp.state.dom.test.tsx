/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { MeetUp } from "./MeetUp";
import { MEET_UP_ORDERS } from "./meetUp";
import { meetUpOrderHelp, meetUpOrderLabel } from "./meetUpCopy";
import { place } from "./placeFixtures";

afterEach(cleanup);

const set = Array.from({ length: 8 }, (_, i) => place(`p${i}`, { name: `Place ${i}`, lat: 43.65, lon: -79.4 + i * 0.006 }));
const mount = (places = set) => {
  document.documentElement.lang = "en";
  return render(<MeetUp places={places} locale="en" onSave={() => true} />);
};
const open = () => fireEvent.click(screen.getByRole("button", { name: /^Show places for two/ }));
const close = () => fireEvent.click(screen.getByRole("button", { name: /^Hide places for two/ }));
const typeAll = () => {
  for (const [l, v] of [["First point latitude", "43.65"], ["First point longitude", "-79.4"], ["Second point latitude", "43.65"], ["Second point longitude", "-79.36"]] as const) fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
};
const rowCount = () => screen.getAllByRole("row").length - 1;

describe("MeetUp keeps what was typed while the page is open", () => {
  it("closing and opening again keeps the points, the order and the limit", () => {
    mount();
    open();
    typeAll();
    fireEvent.click(screen.getByRole("radio", { name: "Nearest to the second point" }));
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    close();
    expect(screen.queryByLabelText("First point latitude")).toBeNull();
    open();
    expect((screen.getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65");
    expect((screen.getByRole("radio", { name: "Nearest to the second point" }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByRole("radio", { name: "5" }) as HTMLInputElement).checked).toBe(true);
    expect(rowCount()).toBe(5);
  });
  it("does no measuring while closed", () => {
    const { container } = mount();
    expect(container.querySelector("table")).toBeNull();
    open();
    typeAll();
    expect(container.querySelector("table")).not.toBeNull();
    close();
    expect(container.querySelector("table")).toBeNull();
  });
  it("a new set of places on screen is measured without retyping the points", () => {
    const view = mount();
    open();
    typeAll();
    expect(rowCount()).toBe(8);
    view.rerender(<MeetUp places={set.slice(0, 3)} locale="en" onSave={() => true} />);
    expect(rowCount()).toBe(3);
    view.rerender(<MeetUp places={set.slice(0, 1)} locale="en" onSave={() => true} />);
    expect(view.container.innerHTML).toBe("");
    view.rerender(<MeetUp places={set} locale="en" onSave={() => true} />);
    expect((screen.getByLabelText("First point latitude") as HTMLInputElement).value).toBe("43.65");
    expect(rowCount()).toBe(8);
  });
});

describe("MeetUp explains each order", () => {
  it("shows the help for the order chosen as the group's description", () => {
    mount();
    open();
    for (const o of MEET_UP_ORDERS) {
      fireEvent.click(screen.getByRole("radio", { name: meetUpOrderLabel(o, "en") }));
      const group = screen.getByRole("radiogroup", { name: "Order of the places" });
      expect(group.getAttribute("aria-describedby")).toBeTruthy();
      expect(within(group.closest("div")!.parentElement!).getAllByText(meetUpOrderHelp(o, "en")).length).toBeGreaterThan(0);
    }
  });
  it("offers exactly the four orders and the three limits, one of each selected", () => {
    mount();
    open();
    const order = screen.getByRole("radiogroup", { name: "Order of the places" });
    const limit = screen.getByRole("radiogroup", { name: "How many to show" });
    expect(within(order).getAllByRole("radio")).toHaveLength(4);
    expect(within(limit).getAllByRole("radio").map((r) => (r as HTMLInputElement).value)).toEqual(["5", "10", "25"]);
    expect(within(order).getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
    expect(within(limit).getAllByRole("radio").filter((r) => (r as HTMLInputElement).checked)).toHaveLength(1);
  });
  it("says how many are shown after an order is chosen", () => {
    mount();
    open();
    typeAll();
    fireEvent.click(screen.getByRole("radio", { name: "Shortest total of the two distances" }));
    expect((document.querySelector("[data-meet-up-status]") as HTMLElement).textContent).toBe("Ordered by: Shortest total of the two distances. Showing 8 of 8.");
  });
});

describe("MeetUp with the points the same", () => {
  it("lists every place at the same two distances and calls them the same distance from both", () => {
    mount();
    open();
    for (const [l, v] of [["First point latitude", "43.65"], ["First point longitude", "-79.38"], ["Second point latitude", "43.65"], ["Second point longitude", "-79.38"]] as const) fireEvent.change(screen.getByLabelText(l), { target: { value: v } });
    expect(rowCount()).toBe(8);
    for (const row of screen.getAllByRole("row").slice(1)) expect(within(row).getByText("the same distance from both")).toBeTruthy();
    expect(document.querySelector("[data-meet-up-apart]")!.textContent).toContain("0\u00a0m apart");
  });
});
