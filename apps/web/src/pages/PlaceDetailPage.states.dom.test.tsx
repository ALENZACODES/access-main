/** @vitest-environment jsdom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { initI18n } from "../i18n/index.ts";

const get = vi.fn();
const flags = vi.hoisted(() => ({ online: true }));

vi.mock("../modules/linked.ts", () => ({
  getModules: () => ({ places: { get } }),
}));
vi.mock("../profile/ProfileProvider.tsx", () => ({ useProfileState: () => ({ profile: null }) }));
vi.mock("../shell/useOnline.ts", () => ({ useOnline: () => flags.online }));
vi.mock("@access-tools/place", () => ({
  PackPlaceView: () => <div>pack view</div>,
}));

const { PlaceDetailPage } = await import("./PlaceDetailPage.tsx");
const i18n = initI18n();

function renderPage() {
  return render(
    <I18nextProvider i18n={i18n}>
      <MemoryRouter initialEntries={["/places/hall"]}>
        <Routes>
          <Route path="/places/:id" element={<PlaceDetailPage />} />
          <Route path="/places" element={<div>place list</div>} />
        </Routes>
      </MemoryRouter>
    </I18nextProvider>,
  );
}

beforeAll(async () => {
  i18n.options.react = { ...i18n.options.react, useSuspense: false };
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  flags.online = true;
});

const ready = (items: object[]) => ({
  moduleId: "places",
  availability: "ready" as const,
  items,
  messageKey: "placeDetail.found",
  asOf: "2026-11-13",
  liveStatus: "unavailable" as const,
});

describe("placeRouteView on the live place page", () => {
  it("shows the not-found state when the pack has no record", async () => {
    get.mockResolvedValue(ready([]));
    await i18n.changeLanguage("en");
    renderPage();
    expect(await screen.findByRole("heading", { name: "This place was not found" })).toBeTruthy();
    expect(document.querySelector(".state-notice")).not.toBeNull();
  });

  it("shows the load-failed state when the pack cannot be read", async () => {
    get.mockResolvedValue({
      moduleId: "places",
      availability: "error",
      items: [],
      messageKey: "placeDetail.unavailable",
      asOf: null,
      liveStatus: "unavailable",
    });
    await i18n.changeLanguage("en");
    renderPage();
    expect(await screen.findByRole("heading", { name: "This place could not be loaded" })).toBeTruthy();
  });

  it("keeps the place view and announces a saved copy when offline", async () => {
    flags.online = false;
    get.mockResolvedValue(
      ready([
        {
          id: "hall",
          name: "Hall",
          record: { id: "hall", tranche: "venue", region: "toronto", fields: {} },
          sources: [],
        },
      ]),
    );
    await i18n.changeLanguage("en");
    renderPage();
    await waitFor(() => expect(screen.getByText("Hall")).toBeTruthy());
    expect(screen.getByText(/You are offline/)).toBeTruthy();
    expect(screen.getByText("These details come from a copy saved on this device.")).toBeTruthy();
    expect(screen.getByText(/Loading this section|pack view/)).toBeTruthy();
    expect(document.querySelector(".state-notice")).toBeNull();
  });

  it("uses French typography in the saved-copy notice", async () => {
    flags.online = false;
    get.mockResolvedValue(
      ready([
        {
          id: "hall",
          name: "Hall",
          record: { id: "hall", tranche: "venue", region: "toronto", fields: {} },
          sources: [],
        },
      ]),
    );
    await i18n.changeLanguage("fr");
    renderPage();
    expect(await screen.findByText(/d’une copie enregistrée/)).toBeTruthy();
    expect(screen.getByText(/d’une copie enregistrée/).textContent).not.toContain("'");
  });
});
