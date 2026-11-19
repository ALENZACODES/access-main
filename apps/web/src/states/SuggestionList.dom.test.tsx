/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SuggestionList } from "./SuggestionList";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);

describe("SuggestionList", () => {
  const hints = [{ key: "a", label: "Union Station" }, { key: "b", label: "Café du Coin" }];
  it("renders nothing without hints, not even a heading", () => {
    const { container } = render(<SuggestionList hints={[]} locale="en" onPick={() => undefined} />);
    expect(container.innerHTML).toBe("");
  });
  it("offers one button per hint and passes the label to onPick", () => {
    const onPick = vi.fn();
    render(<SuggestionList hints={hints} locale="en" onPick={onPick} />);
    expect(screen.getByText("Did you mean one of these?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Search for Café du Coin" }));
    expect(onPick).toHaveBeenCalledWith("Café du Coin");
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });
  it("reads in French", () => {
    render(<SuggestionList hints={hints} locale="fr" onPick={() => undefined} />);
    expect(screen.getByText(/Vouliez-vous dire l’un de ceux-ci/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chercher Union Station" })).toBeTruthy();
  });
  it("shows a name as text, never as markup", () => {
    render(<SuggestionList hints={[{ key: "x", label: "<img src=x onerror=alert(1)>" }]} locale="en" onPick={() => undefined} />);
    expect(document.querySelector("img")).toBeNull();
    expect(screen.getByRole("button").textContent).toContain("<img src=x");
  });
  it("has no accessibility violations", async () => {
    const { container } = render(<SuggestionList hints={hints} locale="en" onPick={() => undefined} />);
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
});
