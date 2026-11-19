/** @vitest-environment jsdom */
import { cleanup, fireEvent, render, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { initI18n } from "../i18n/index.ts";
import { PRIVACY_STORAGE_PREFIX, ROUTE_REPORTS_PURPOSE, ROUTE_REPORTS_STORAGE_KEY, liveStorage, saveGated } from "../privacy/panel/live.ts";
import { saveConsent, setConsent } from "../privacy/panel/consent.ts";
import { safeLocalStorage } from "../privacy/panel/storage.ts";
import { AboutPage } from "./AboutPage.tsx";

/** The privacy panel on the About page: declining route reports there removes the saved reports. */
const i18n = initI18n();

beforeAll(async () => {
  await i18n.changeLanguage("en");
});
afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe("About page, privacy panel", () => {
  it("removes saved route reports when the person chooses not to allow them, and leaves other data", async () => {
    const storage = safeLocalStorage();
    expect(storage).not.toBeNull();
    saveConsent(storage, PRIVACY_STORAGE_PREFIX, setConsent({}, ROUTE_REPORTS_PURPOSE, "granted", new Date()));
    expect(saveGated(liveStorage(storage), ROUTE_REPORTS_STORAGE_KEY, "[]")).toBe("saved");
    localStorage.setItem("access.language", "en");
    const { container } = render(
      <I18nextProvider i18n={i18n}>
        <MemoryRouter><AboutPage /></MemoryRouter>
      </I18nextProvider>,
    );
    await waitFor(() => expect(container.querySelector("[data-privacy-consent]")).not.toBeNull());
    const decline = container.querySelector<HTMLButtonElement>('[data-action="consent-decline"][data-purpose="route-reports"]');
    expect(decline).not.toBeNull();
    fireEvent.click(decline as HTMLButtonElement);
    await waitFor(() => expect(localStorage.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBeNull());
    expect(localStorage.getItem("access.language")).toBe("en");
    expect(container.querySelector("[data-privacy-status]")?.textContent).toContain("Removed from this device: 1 item.");
  });

  it("says what the erase button does not reach, in English and French", async () => {
    for (const [lang, heading, item] of [["en", "Also kept on this device", "Your display preferences"], ["fr", "Aussi conservé sur cet appareil", "Vos préférences d’affichage"]] as const) {
      await i18n.changeLanguage(lang);
      const { container, unmount } = render(
        <I18nextProvider i18n={i18n}>
          <MemoryRouter><AboutPage /></MemoryRouter>
        </I18nextProvider>,
      );
      await waitFor(() => expect(container.querySelector("[data-privacy-outside]")).not.toBeNull());
      const box = container.querySelector("[data-privacy-outside]");
      expect(box?.textContent).toContain(heading);
      expect(box?.textContent).toContain(item);
      unmount();
    }
    await i18n.changeLanguage("en");
  });
});
