/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import { mountOfflineDashboard } from "./offlineDashboard";
import { PACK_RECEIPT_COPY } from "./packReceiptCopy";
import { packChangeCopy } from "./packChangeImpactCopy";
import { HANDBACK_COPY } from "./sharedDeviceHandbackCopy";

function setup(language: "en" | "fr" = "en") {
  const root = document.createElement("div");
  const unmount = mountOfflineDashboard(root, { regionId: "north", cells: [] }, {
    store: { get: async () => undefined, put: async () => undefined },
    fetchCell: vi.fn(),
    estimateStorage: async () => ({ quota: 1024, usage: 0 }),
  }, language);
  const button = (name: string): HTMLButtonElement => {
    const node = [...root.querySelectorAll("button")].find((el) => el.textContent === name);
    if (!node) throw new Error("Missing button: " + name);
    return node;
  };
  const handback = () => root.querySelector(`section[aria-label="${HANDBACK_COPY[language].title}"]`);
  return { root, unmount, button, handback };
}

describe("the shared-device handback launcher", () => {
  it.each(["en", "fr"] as const)("keeps change review, receipts and handback independent in %s", async (language) => {
    const view = setup(language);
    const receipt = PACK_RECEIPT_COPY[language];
    const handback = HANDBACK_COPY[language];
    const changeButton = language === "fr" ? "Ouvrir l’examen des changements du pack" : "Open pack change review";
    const change = view.button(changeButton);
    const receipts = view.button(receipt.open);
    const review = view.button(handback.open);
    const heading = (button: HTMLButtonElement) => button.parentElement?.querySelector("section h3")?.textContent;
    try {
      expect([change, receipts, review].map(heading)).toEqual([undefined, undefined, undefined]);
      change.click();
      receipts.click();
      review.click();
      await vi.dynamicImportSettled();
      expect([change, receipts, review].map(heading)).toEqual([packChangeCopy(language).title, receipt.title, handback.title]);
      expect(view.handback()?.textContent).toContain(handback.empty);

      view.button(receipt.close).click();
      expect([change, receipts, review].map(heading)).toEqual([packChangeCopy(language).title, undefined, handback.title]);
      change.click();
      view.button(receipt.open).click();
      await vi.dynamicImportSettled();
      view.button(handback.close).click();
      expect([change, receipts, review].map(heading)).toEqual([undefined, receipt.title, undefined]);
    } finally {
      view.unmount();
    }
  });

  it("abandons a pending import on close or dashboard teardown", async () => {
    const view = setup();
    const launch = view.button(HANDBACK_COPY.en.open);
    const host = launch.parentElement!;
    launch.click();
    launch.click();
    await vi.dynamicImportSettled();
    expect(view.handback()).toBeNull();
    launch.click();
    view.unmount();
    await vi.dynamicImportSettled();
    expect(host.querySelector("section")).toBeNull();
    launch.click();
    await vi.dynamicImportSettled();
    expect(host.querySelector("section")).toBeNull();
    expect(view.root.childElementCount).toBe(0);
  });
});
