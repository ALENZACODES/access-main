/** @vitest-environment jsdom */
import { lazy } from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import axe from "axe-core";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";
import { Section } from "./Section.tsx";

const i18n = initI18n();

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const Failing = lazy(() => Promise.reject(new Error("Failed to fetch dynamically imported module")));
const Working = lazy(async () => ({ default: () => <h1>Loaded page</h1> }));

async function show(lang: "en" | "fr", child: React.ReactNode) {
  await i18n.changeLanguage(lang);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><Section>{child}</Section></MemoryRouter>
    </I18nextProvider>,
  );
}

describe("a lazy page that fails to load", () => {
  it("shows the page-load state with Try again and a way home, not a bare alert", async () => {
    const { container } = await show("en", <Failing />);
    expect(await screen.findByRole("heading", { name: "This page could not be loaded" })).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("try again once it is back");
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Go to the home page" }).getAttribute("href")).toBe("/");
    expect((await axe.run(container, { rules: { region: { enabled: false }, "color-contrast": { enabled: false } } })).violations).toEqual([]);
  });
  it("is in French", async () => {
    await show("fr", <Failing />);
    expect(await screen.findByRole("heading", { name: "Cette page n’a pas pu être chargée" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Réessayer" })).toBeTruthy();
  });
  it("reloads the page on Try again, because a failed lazy page stays failed until it is requested again", async () => {
    const reload = vi.fn();
    const original = window.location;
    Object.defineProperty(window, "location", { configurable: true, value: { ...original, reload } });
    try {
      await show("en", <Failing />);
      fireEvent.click(await screen.findByRole("button", { name: "Try again" }));
      expect(reload).toHaveBeenCalledTimes(1);
    } finally {
      Object.defineProperty(window, "location", { configurable: true, value: original });
    }
  });
  it("shows a page that loads normally", async () => {
    await show("en", <Working />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Loaded page" })).toBeTruthy());
    expect(document.querySelector(".state-notice")).toBeNull();
  });
});
