/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { afterEach, describe, expect, it } from "vitest";
import { LetterJump, focusPlaceAt } from "./LetterJump";
import type { LetterItem } from "./letterIndex";
import { lintFrench } from "./typography";

const axeRules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
afterEach(cleanup);
const named = (name: string): LetterItem => ({ name, nameKnown: true });
const NAMES = ["Alpha", "Apple", "Bravo", "Cafe", "Delta", "Écho", "Echo Two", "Foxtrot", "Golf", "7 Eleven"];
const items: LetterItem[] = [...NAMES.map(named), { name: "UNKNOWN", nameKnown: false }];

function show(list: LetterItem[] = items, locale: "en" | "fr" = "en", withList = true) {
  document.documentElement.lang = locale;
  return render(
    <>
      <LetterJump items={list} locale={locale} />
      {withList ? (
        <ul className="record-list">
          {list.map((i, n) => (
            <li key={n}>
              <h3>{i.name}</h3>
            </li>
          ))}
        </ul>
      ) : null}
    </>,
  );
}

describe("when it shows", () => {
  it("shows nothing for a short list", () => {
    show(items.slice(0, 9));
    expect(document.querySelector("[data-letter-jump]")).toBeNull();
  });
  it("shows nothing when every place starts with the same letter", () => {
    show(Array.from({ length: 12 }, (_, i) => named(`A${i}`)));
    expect(document.querySelector("[data-letter-jump]")).toBeNull();
  });
  it("shows one button for each letter, with the count in its name, and is a labelled navigation", () => {
    show();
    expect(screen.getByRole("navigation", { name: "Jump to a place by its first letter" })).toBeTruthy();
    const names = screen.getAllByRole("button").map((b) => b.getAttribute("aria-label"));
    expect(names).toEqual(["A, 2 places", "B, 1 place", "C, 1 place", "D, 1 place", "E, 2 places", "F, 1 place", "G, 1 place", "Digits and others, 1 place", "UNKNOWN, 1 place"]);
  });
  it("does not add headings, so the places keep the only level 3 headings", () => {
    show();
    expect(screen.getAllByRole("heading", { level: 3 })).toHaveLength(items.length);
  });
});

describe("jumping", () => {
  it("moves focus to the first place under the letter, not to a later one", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "E, 2 places" }));
    expect(document.activeElement?.textContent).toBe("Écho");
    expect(document.activeElement?.tagName).toBe("H3");
  });
  it("makes the heading focusable without putting it in the tab order", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "G, 1 place" }));
    expect(document.activeElement?.getAttribute("tabindex")).toBe("-1");
  });
  it("reaches the digits group and the unknown group", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "Digits and others, 1 place" }));
    expect(document.activeElement?.textContent).toBe("7 Eleven");
    fireEvent.click(screen.getByRole("button", { name: "UNKNOWN, 1 place" }));
    expect(document.activeElement?.textContent).toBe("UNKNOWN");
  });
  it("says where it moved, politely", () => {
    show();
    fireEvent.click(screen.getByRole("button", { name: "B, 1 place" }));
    const status = document.querySelector("[data-letter-jump-status]")!;
    expect(status.textContent).toBe("Moved to the first place under B.");
    expect(status.getAttribute("aria-live")).toBe("polite");
  });
  it("does not change the list", () => {
    show();
    const before = screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    fireEvent.click(screen.getByRole("button", { name: "C, 1 place" }));
    expect(screen.getAllByRole("heading", { level: 3 }).map((h) => h.textContent)).toEqual(before);
  });
  it("says so when the list is not on the page", () => {
    show(items, "en", false);
    fireEvent.click(screen.getByRole("button", { name: "A, 2 places" }));
    expect(document.querySelector("[data-letter-jump-status]")!.textContent).toBe("That place is not on the page.");
  });
});

describe("focusPlaceAt", () => {
  it("returns false for a missing list, a missing index and an item with no heading", () => {
    expect(focusPlaceAt(null, 0)).toBe(false);
    const ul = document.createElement("ul");
    ul.innerHTML = "<li>no heading</li>";
    expect(focusPlaceAt(ul, 0)).toBe(false);
    expect(focusPlaceAt(ul, 5)).toBe(false);
    expect(focusPlaceAt(ul, -1)).toBe(false);
  });
});

describe("in French", () => {
  it("uses French words and French plural names, and passes the French lint", () => {
    show(items, "fr");
    expect(screen.getByRole("navigation", { name: "Aller à un lieu par sa première lettre" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "A, 2 lieux" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Chiffres et autres, 1 lieu" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "B, 1 lieu" }));
    const text = document.querySelector("[data-letter-jump-status]")!.textContent!;
    expect(text).toBe("Déplacé vers le premier lieu sous B.");
    expect(lintFrench(text)).toEqual([]);
    expect(document.body.textContent).not.toMatch(/inconnu/i);
  });
});

describe("accessibility", () => {
  it.each(["en", "fr"] as const)("has no axe violations in %s", async (locale) => {
    const { container } = show(items, locale);
    expect((await axe.run(container, axeRules)).violations).toEqual([]);
  });
  it("uses real buttons that can be reached with the keyboard", () => {
    show();
    for (const b of screen.getAllByRole("button")) {
      expect(b.tagName).toBe("BUTTON");
      expect(b.tabIndex).toBeGreaterThanOrEqual(0);
    }
  });
});
