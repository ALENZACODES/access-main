/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { GapMatrix } from "./GapMatrix";
import { PlaceSheet } from "./PlaceSheet";
import { ShortlistFiles } from "./ShortlistFiles";
import { bare, place } from "./placeFixtures";

const TODAY = "2026-11-19";
afterEach(cleanup);
const css = readFileSync(path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../styles/global.css"), "utf8");

/** Elements a keyboard can reach, in document order, ignoring hidden ones. */
const focusables = (root: ParentNode) => [...root.querySelectorAll<HTMLElement>("button, a[href], input, select, textarea, [tabindex]")].filter((e) => !e.closest("[hidden]") && e.getAttribute("tabindex") !== "-1");

describe("the buttons and link are real, labelled controls", () => {
  it("every control in an open sheet has a name and none is a div or span with a role", () => {
    const { container } = render(<PlaceSheet place={place("a")} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Details and gaps" }));
    const controls = focusables(container);
    expect(controls.length).toBeGreaterThanOrEqual(4);
    for (const c of controls) {
      expect(["BUTTON", "A"]).toContain(c.tagName);
      expect((c.textContent ?? "").trim()).not.toBe("");
    }
    expect(container.querySelectorAll('[role="button"]')).toHaveLength(0);
  });
  it("reaches the controls in reading order: toggle, map link, then the three saves, as they are laid out", () => {
    const { container } = render(<PlaceSheet place={place("a")} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Details and gaps" }));
    expect(focusables(container).map((c) => c.textContent)).toEqual(["Hide details and gaps", "Open in your maps app", "Save as a contact card (.vcf)", "Save the details as text (.txt)", "Save as a waypoint (GPX)"]);
  });
  it("keeps focus on the toggle when it opens and closes", () => {
    render(<PlaceSheet place={place("a")} locale="en" today={TODAY} />);
    const toggle = screen.getByRole("button", { name: "Details and gaps" });
    toggle.focus();
    fireEvent.click(toggle);
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "Hide details and gaps" }));
  });
  it("hides the panel from the keyboard while closed", () => {
    const { container } = render(<PlaceSheet place={place("a")} locale="en" today={TODAY} />);
    expect(focusables(container).map((c) => c.textContent)).toEqual(["Details and gaps"]);
  });
  it("the grid and the file buttons expose only their own controls", () => {
    const { container } = render(
      <>
        <GapMatrix places={[place("a"), bare("z")]} locale="en" today={TODAY} />
        <ShortlistFiles places={[place("a")]} locale="en" />
      </>,
    );
    expect(focusables(container).map((c) => c.textContent)).toEqual(["Show the gaps grid", "Save the list as contact cards (.vcf)", "Save the list as waypoints (GPX, 1 with a map point)"]);
  });
});

describe("touch targets", () => {
  it("the stylesheet gives every .btn a minimum height of at least 44px", () => {
    const rule = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].find((m) => /(^|,)\s*\.btn\s*(,|$)/.test(m[1]!.trim()) && /min-height/.test(m[2]!))![2]!;
    const m = rule.match(/min-height:\s*([\d.]+)(px|rem)/);
    expect(m).not.toBeNull();
    const px = m![2] === "rem" ? Number(m![1]) * 16 : Number(m![1]);
    expect(px).toBeGreaterThanOrEqual(44);
  });
  it("the map link carries the same class as the buttons, so it gets the same size", () => {
    render(<PlaceSheet place={place("a")} locale="en" today={TODAY} />);
    fireEvent.click(screen.getByRole("button", { name: "Details and gaps" }));
    expect(screen.getByRole("link", { name: "Open in your maps app" }).className).toMatch(/\bbtn\b/);
    for (const b of screen.getAllByRole("button")) expect(b.className).toMatch(/\bbtn\b/);
  });
});
