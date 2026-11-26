/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SameName, moreNames, morePairs } from "./SameName";
import { place } from "./placeFixtures";
import { lintFrench } from "./typography";

afterEach(cleanup);

const named = (id: string, name: string, lon: number) => place(id, { name, lon });
const pairsOf = (n: number) => Array.from({ length: n }, (_, i) => [named(`a${i}`, `Name ${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}`, i), named(`b${i}`, `name ${String.fromCharCode(97 + i)}${String.fromCharCode(97 + i)}`, i + 0.5)]).flat();
const mount = (places = pairsOf(4)) => {
  document.documentElement.lang = "en";
  return render(<SameName places={places} locale="en" onSave={() => true} />);
};
const open = () => fireEvent.click(screen.getByRole("button", { name: /^Show places that share/ }));
const close = () => fireEvent.click(screen.getByRole("button", { name: /^Hide places that share/ }));
const groups = () => document.querySelectorAll("[data-same-name-group]").length;

describe("SameName keeps its choices while the page is open", () => {
  it("closing and opening again keeps the order, size, filter and limit", () => {
    mount();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "By name" }));
    fireEvent.click(screen.getByRole("radio", { name: "3 or more places" }));
    fireEvent.click(screen.getByRole("radio", { name: "Only where the wheelchair tags differ" }));
    fireEvent.click(screen.getByRole("radio", { name: "5" }));
    close();
    open();
    for (const [name, on] of [["By name", true], ["3 or more places", true], ["Only where the wheelchair tags differ", true], ["5", true], ["Most places first", false]] as const) expect((screen.getByRole("radio", { name }) as HTMLInputElement).checked, name).toBe(on);
  });
  it("does no grouping while closed", () => {
    const { container } = mount();
    expect(container.querySelector("[data-same-name-list]")).toBeNull();
    open();
    expect(groups()).toBe(4);
    close();
    expect(container.querySelector("[data-same-name-list]")).toBeNull();
  });
  it("a new set of places is grouped again without touching the choices", () => {
    const view = mount();
    open();
    expect(groups()).toBe(4);
    view.rerender(<SameName places={pairsOf(2)} locale="en" onSave={() => true} />);
    expect(groups()).toBe(2);
    view.rerender(<SameName places={[named("only", "One", 0)]} locale="en" onSave={() => true} />);
    expect(view.container.innerHTML).toBe("");
    view.rerender(<SameName places={pairsOf(4)} locale="en" onSave={() => true} />);
    expect(groups()).toBe(4);
  });
  it("the point can arrive after opening: distances appear and the order help changes", () => {
    const view = mount();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "Closest to the point typed first" }));
    expect(screen.getByText(/Type a point above to measure/)).toBeTruthy();
    view.rerender(<SameName places={pairsOf(4)} locale="en" from={{ lat: 43.65, lon: -79.4 }} onSave={() => true} />);
    expect(screen.queryByText(/Type a point above to measure/)).toBeNull();
    expect(screen.getByText(/closest place to the point typed above/)).toBeTruthy();
    expect(screen.getAllByText(/from the point typed/).length).toBeGreaterThan(0);
  });
  it("the status after a choice counts what is listed", () => {
    mount();
    open();
    fireEvent.click(screen.getByRole("radio", { name: "3 or more places" }));
    expect((document.querySelector("[data-same-name-status]") as HTMLElement).textContent).toBe("Showing 0 of 0 shared names.");
    fireEvent.click(screen.getByRole("radio", { name: "2 or more places" }));
    expect((document.querySelector("[data-same-name-status]") as HTMLElement).textContent).toBe("Showing 4 of 4 shared names.");
  });
});

describe("the more-notes", () => {
  it("are singular for one and plural otherwise, in both languages, and pass lintFrench", () => {
    expect(moreNames(1, "en")).toBe("1 more name is not shown. Save the file to see all of them.");
    expect(moreNames(3, "en")).toBe("3 more names are not shown. Save the file to see all of them.");
    expect(morePairs(1, "en")).toBe("1 more pair is not shown. Save the file to see all of them.");
    expect(morePairs(2, "en")).toBe("2 more pairs are not shown. Save the file to see all of them.");
    for (const s of [moreNames(1, "fr"), moreNames(5, "fr"), morePairs(1, "fr"), morePairs(5, "fr")]) expect(lintFrench(s), s).toEqual([]);
    expect(moreNames(1, "fr")).toContain("1 autre nom");
    expect(morePairs(1, "fr")).toContain("1 autre paire");
  });
  it("one name left out shows the singular note on the page", () => {
    mount(pairsOf(11));
    open();
    expect((document.querySelector("[data-same-name-more]") as HTMLElement).textContent).toBe("1 more name is not shown. Save the file to see all of them.");
    const list = document.querySelector("[data-same-name-list]") as HTMLElement;
    expect(within(list).getAllByRole("heading", { level: 4 })).toHaveLength(10);
  });
});
