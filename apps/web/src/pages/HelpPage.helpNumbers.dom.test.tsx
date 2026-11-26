/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";

const list = vi.fn(async () => ({ moduleId: "help", availability: "ready", items: [], messageKey: "modules.ready", asOf: null, liveStatus: "unavailable" }));
const pack = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("../modules/stubs.ts", () => ({ modules: { help: { list: (...a: unknown[]) => (list as (...x: unknown[]) => unknown)(...a) } } }));
vi.mock("../profile/ProfileProvider.tsx", () => ({ useProfileState: () => ({ profile: null }) }));
vi.mock("../shell/useOnline.ts", () => ({ useOnline: () => true }));
vi.mock("../storage/repository.ts", () => ({ getPack: (id: string) => pack.get(id) }));

const { HelpPage } = await import("./HelpPage.tsx");
const i18n = initI18n();

async function page(lang: "en" | "fr" = "en") {
  await i18n.changeLanguage(lang);
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter><HelpPage /></MemoryRouter>
    </I18nextProvider>,
  );
}
beforeAll(() => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});
const entry = { id: "e1", name: { en: "Test line", fr: "Ligne d’essai" }, contact: "211", how: { en: "Ask here.", fr: "Demandez ici." } };

describe("help numbers on the help page", () => {
  it("asks for the Toronto pack and shows its help numbers", async () => {
    pack.get.mockResolvedValue({ content: { help_numbers: [entry] } });
    await page();
    expect(await screen.findByRole("heading", { level: 2, name: "Saved help numbers" })).toBeTruthy();
    expect(pack.get).toHaveBeenCalledWith("toronto");
    expect(screen.getByRole("heading", { level: 3, name: "Test line" })).toBeTruthy();
  });
  it("shows them in French on the French page", async () => {
    pack.get.mockResolvedValue({ content: { help_numbers: [entry] } });
    await page("fr");
    expect(await screen.findByRole("heading", { level: 3, name: "Ligne d’essai" })).toBeTruthy();
  });
  it("shows no section when there is no pack", async () => {
    pack.get.mockResolvedValue(null);
    await page();
    await waitFor(() => expect(pack.get).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Saved help numbers" })).toBeNull();
  });
  it("shows no section when the pack cannot be read", async () => {
    pack.get.mockRejectedValue(new Error("no storage"));
    await page();
    await waitFor(() => expect(pack.get).toHaveBeenCalled());
    expect(screen.queryByRole("heading", { name: "Saved help numbers" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 })).toBeTruthy();
  });
  it("shows no section when the pack has no help numbers or an empty list", async () => {
    for (const content of [{}, { help_numbers: [] }, undefined]) {
      pack.get.mockResolvedValue({ content });
      await page();
      await waitFor(() => expect(pack.get).toHaveBeenCalled());
      expect(screen.queryByRole("heading", { name: "Saved help numbers" })).toBeNull();
      cleanup();
      pack.get.mockClear();
    }
  });
  it("does not set state after the page is gone", async () => {
    let resolve: (v: unknown) => void = () => {};
    pack.get.mockReturnValue(new Promise((r) => { resolve = r; }));
    const err = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = await page();
    unmount();
    resolve({ content: { help_numbers: [entry] } });
    await Promise.resolve();
    expect(err).not.toHaveBeenCalled();
    err.mockRestore();
  });
  it("puts the numbers after the article search, not before the page heading", async () => {
    pack.get.mockResolvedValue({ content: { help_numbers: [entry] } });
    await page();
    const numbers = await screen.findByRole("heading", { level: 2, name: "Saved help numbers" });
    const h1 = screen.getByRole("heading", { level: 1 });
    expect(h1.compareDocumentPosition(numbers) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });
});
