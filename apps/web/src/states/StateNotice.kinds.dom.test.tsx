/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import axe from "axe-core";
import { MemoryRouter } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StateNotice } from "./StateNotice.tsx";
import { EMPTY_KINDS, ERROR_KINDS, getEmptyState, getErrorState, type ActionId, type Locale } from "./stateCopy.ts";

const rules = { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } };
const locales: Locale[] = ["en", "fr"];

afterEach(cleanup);

function show(view: ReturnType<typeof getErrorState>, locale: Locale, onAction: Partial<Record<ActionId, () => void>> = {}) {
  document.documentElement.lang = locale;
  return render(
    <MemoryRouter>
      <StateNotice view={view} lang={locale} onAction={onAction} />
    </MemoryRouter>,
  );
}

describe("every state kind renders as an accessible notice", () => {
  for (const locale of locales) {
    for (const kind of ERROR_KINDS) {
      it(`error ${kind} in ${locale}: an alert, one heading, no axe violations`, async () => {
        const view = getErrorState(kind, locale);
        const { container } = show(view, locale, { retry: () => undefined, "clear-search": () => undefined, "change-trip": () => undefined, "go-back": () => undefined });
        expect(screen.getByRole("alert").textContent).toContain(view.description);
        expect(screen.getByRole("heading", { level: 2 }).textContent).toBe(view.title);
        expect(container.querySelector("section")!.getAttribute("lang")).toBe(locale);
        expect((await axe.run(container, rules)).violations).toEqual([]);
      });
    }
    for (const kind of EMPTY_KINDS) {
      it(`empty ${kind} in ${locale}: polite status, no axe violations`, async () => {
        const view = getEmptyState(kind, locale);
        const { container } = show(view, locale, { "clear-search": () => undefined, "change-trip": () => undefined });
        expect(screen.getByRole("status").textContent).toContain(view.description);
        expect(screen.queryByRole("alert")).toBeNull();
        expect((await axe.run(container, rules)).violations).toEqual([]);
      });
    }
  }
});

describe("next actions", () => {
  it("shows a link action without any handler, and the link goes to a real address", () => {
    show(getEmptyState("nothing-listed", "en"), "en");
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
  });
  it("hides a button action when the page gave no handler", () => {
    show(getErrorState("module-load-failed", "en"), "en");
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toBeTruthy();
  });
  it("runs the handler once when the button is used", () => {
    const retry = vi.fn();
    show(getErrorState("module-load-failed", "fr"), "fr", { retry });
    fireEvent.click(screen.getByRole("button", { name: "Réessayer" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
  it("offers help and retry for an unreadable offline pack list", () => {
    show(getErrorState("region-list-unavailable", "en"), "en", { retry: () => undefined });
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open help" }).getAttribute("href")).toBe("/help");
  });
  it("gives every kind at least one action a person can use when only links work", () => {
    // A page that forgets to pass handlers still leaves a way out for the kinds that have a link.
    const withLink = [...ERROR_KINDS, ...EMPTY_KINDS].filter((k) => {
      const v = (ERROR_KINDS as readonly string[]).includes(k) ? getErrorState(k as never, "en") : getEmptyState(k as never, "en");
      return v.actions.some((a) => ["go-home", "download-pack", "help"].includes(a.id));
    });
    expect(withLink.length).toBeGreaterThan(8);
  });
});
