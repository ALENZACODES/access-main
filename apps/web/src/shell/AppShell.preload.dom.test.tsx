/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";
import { routeChunks } from "../perf/routeChunks.ts";

/**
 * Preloading a route chunk on focus or pointer must not announce anything.
 * The fetch is silent: live regions, status, and alerts stay unchanged.
 */

vi.mock("../profile/ProfileProvider.tsx", () => ({
  useProfileState: () => ({ profile: null, setLanguage: vi.fn() }),
}));
vi.mock("./useApplyPreferences.ts", () => ({ useApplyPreferences: () => undefined }));
vi.mock("./useOnline.ts", () => ({ useOnline: () => true }));
vi.mock("./UpdatePrompt.tsx", () => ({ UpdatePrompt: () => null }));

const { AppShell } = await import("./AppShell.tsx");
const i18n = initI18n();

function liveSnapshot(container: HTMLElement) {
  return [...container.querySelectorAll("[aria-live], [role='status'], [role='alert']")].map((el) => ({
    role: el.getAttribute("role"),
    live: el.getAttribute("aria-live"),
    busy: el.getAttribute("aria-busy"),
    text: (el.textContent ?? "").trim(),
  }));
}

async function view() {
  await i18n.changeLanguage("en");
  document.documentElement.lang = "en";
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/"]}>
        <AppShell />
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
afterEach(cleanup);

describe("AppShell route preload", () => {
  it("announces nothing when a nav link is focused or pointed at", async () => {
    const { container } = await view();
    const before = liveSnapshot(container);
    expect(before.length).toBeGreaterThan(0);

    const nav = screen.getByRole("navigation");
    const dataStatus = within(nav).getByRole("link", { name: "Data status" });
    dataStatus.focus();
    fireEvent.focus(dataStatus);
    await routeChunks["/data-status"].preload();
    expect(liveSnapshot(container)).toEqual(before);
    expect(document.activeElement).toBe(dataStatus);
    expect(container.querySelector("[aria-busy='true']")).toBeNull();

    fireEvent.pointerEnter(within(nav).getByRole("link", { name: "Settings" }));
    await routeChunks["/settings"].preload();
    expect(liveSnapshot(container)).toEqual(before);
    expect(document.activeElement).toBe(dataStatus);
    expect(container.querySelector("[aria-busy='true']")).toBeNull();
  });
});
