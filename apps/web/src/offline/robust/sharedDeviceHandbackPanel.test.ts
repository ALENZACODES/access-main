/** @vitest-environment jsdom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountSharedDeviceHandback } from "./sharedDeviceHandbackPanel";
import { createSharedDeviceHandback } from "./sharedDeviceHandback";
import { HANDBACK_COPY } from "./sharedDeviceHandbackCopy";

function mount(language: "en" | "fr" = "en", region: string | null = "north") {
  const root = document.createElement("div");
  document.body.append(root);
  const unmount = mountSharedDeviceHandback(root, region, language);
  return { root, unmount, copy: HANDBACK_COPY[language] };
}

function button(root: HTMLElement, label: string): HTMLButtonElement {
  const found = [...root.querySelectorAll("button")].find((candidate) => candidate.textContent === label);
  if (!found) throw new Error("Button not found: " + label);
  return found;
}

function byLabel(root: HTMLElement, label: string): HTMLLabelElement {
  const found = [...root.querySelectorAll("label")].find((candidate) => candidate.textContent?.startsWith(label));
  if (!found) throw new Error("Label not found: " + label);
  return found;
}

afterEach(() => {
  document.body.replaceChildren();
});

describe("shared-device handback panel", () => {
  it("mounts the English panel with explicit boundaries and a live status region", () => {
    const view = mount();
    expect(view.root.querySelector("section")?.getAttribute("aria-label")).toBe(view.copy.title);
    expect(view.root.textContent).toContain(view.copy.boundary);
    expect(view.root.textContent).toContain(view.copy.privacy);
    expect(view.root.textContent).toContain(view.copy.history);
    expect(view.root.querySelector('[role="status"][aria-live="polite"]')).toBeTruthy();
    expect(view.root.querySelector("input[type=file]")).toBeNull();
    expect(button(view.root, view.copy.exportJson).disabled).toBe(true);
    expect(button(view.root, view.copy.reset).disabled).toBe(true);
    view.unmount();
  });

  it("mounts French copy with exact UNKNOWN", () => {
    const view = mount("fr");
    expect(view.root.textContent).toContain("Examen de restitution");
    expect(view.root.textContent).toContain("UNKNOWN");
    expect(view.root.textContent).not.toMatch(/\bUnknown\b|\bInconnu\b/);
    expect(view.root.textContent).not.toContain("'");
    view.unmount();
  });

  it("gives all native controls minimum 44px dimensions", () => {
    const view = mount();
    for (const control of view.root.querySelectorAll("button, input, select, textarea")) {
      const style = (control as HTMLElement).style;
      expect(Number.parseFloat(style.minHeight)).toBeGreaterThanOrEqual(44);
      expect(Number.parseFloat(style.minWidth)).toBeGreaterThanOrEqual(44);
    }
    view.unmount();
  });

  it("starts a review only after the person activates the start control", () => {
    const view = mount();
    expect(view.root.textContent).toContain(view.copy.empty);
    button(view.root, view.copy.capture).click();
    expect(view.root.querySelector('[role="status"]')?.textContent).toBe(view.copy.started);
    expect(view.root.textContent).toContain(view.copy.total);
    expect(view.root.textContent).toContain("15");
    expect(view.root.textContent).toContain(view.copy.itemAccountSignout);
    expect(button(view.root, view.copy.exportJson).disabled).toBe(false);
    view.unmount();
  });

  it("updates one prompt when its state selector changes", () => {
    const view = mount();
    button(view.root, view.copy.capture).click();
    const select = view.root.querySelector('select[aria-label^="Status — Review any account sign-in"]') as HTMLSelectElement;
    expect(select).toBeTruthy();
    select.value = "done";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.root.querySelector('[role="status"]')?.textContent).toBe(view.copy.started);
    expect(view.root.textContent).toContain(view.copy.done);
    expect(view.root.textContent).toContain(view.copy.remaining);
    view.unmount();
  });

  it("keeps UNKNOWN uppercase when selected", () => {
    const view = mount("fr");
    button(view.root, view.copy.capture).click();
    const select = view.root.querySelector("select[aria-label]") as HTMLSelectElement;
    select.value = "UNKNOWN";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.root.textContent).toContain("UNKNOWN");
    expect(view.root.textContent).not.toContain("Inconnu");
    view.unmount();
  });

  it("can mark an item not applicable without treating it as complete", () => {
    const view = mount();
    button(view.root, view.copy.capture).click();
    const select = view.root.querySelector("select[aria-label]") as HTMLSelectElement;
    select.value = "not-applicable";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.root.textContent).toContain(view.copy.notApplicable);
    view.unmount();
  });

  it("filters the checklist by category", () => {
    const view = mount();
    button(view.root, view.copy.capture).click();
    const category = byLabel(view.root, view.copy.category).querySelector("select")!;
    category.value = "paper";
    category.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.root.textContent).toContain(view.copy.itemPrintedPages);
    expect(view.root.textContent).not.toContain(view.copy.itemAccountSignout);
    view.unmount();
  });

  it("filters the checklist by status", () => {
    const view = mount();
    button(view.root, view.copy.capture).click();
    const first = view.root.querySelector("select[aria-label^='Status']") as HTMLSelectElement;
    first.value = "done";
    first.dispatchEvent(new Event("change", { bubbles: true }));
    const filter = byLabel(view.root, view.copy.filter).querySelector("select")!;
    filter.value = "done";
    filter.dispatchEvent(new Event("change", { bubbles: true }));
    expect(view.root.querySelectorAll("ol > li")).toHaveLength(1);
    view.unmount();
  });

  it("searches the fixed checklist prompt IDs", () => {
    const view = mount();
    button(view.root, view.copy.capture).click();
    const search = byLabel(view.root, view.copy.search).querySelector("input")!;
    search.value = "download";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(view.root.textContent).toContain(view.copy.itemDownloadFolder);
    expect(view.root.textContent).not.toContain(view.copy.itemPrintedPages);
    view.unmount();
  });

  it("resets the checklist without affecting anything outside the page", () => {
    const view = mount();
    button(view.root, view.copy.capture).click();
    const select = view.root.querySelector("select[aria-label^='Status']") as HTMLSelectElement;
    select.value = "done";
    select.dispatchEvent(new Event("change", { bubbles: true }));
    button(view.root, view.copy.reset).click();
    expect(view.root.querySelector('[role="status"]')?.textContent).toBe(view.copy.resetDone);
    expect(view.root.textContent).toContain(view.copy.pending);
    expect(view.root.textContent).toContain(view.copy.resetDoesNotDelete);
    view.unmount();
  });

  it("imports a valid pasted review only after an explicit click", () => {
    const source = mount();
    button(source.root, source.copy.capture).click();
    const text = source.root.querySelector("textarea")!;
    text.value = JSON.stringify({
      schema: "shared-device-handback-v1",
      reviewId: "handback-import-1",
      regionId: "north",
      createdAt: "2026-11-21T10:00:00.000Z",
      updatedAt: "2026-11-21T10:00:00.000Z",
      entries: Array.from({ length: 15 }, (_, index) => ({
        itemId: [
          "account-signout", "account-profile", "account-sync", "browser-session", "browser-history",
          "browser-permissions", "download-folder", "temporary-files", "offline-pack-choice",
          "offline-page-state", "printed-pages", "written-notes", "external-storage",
          "display-preferences", "assistive-settings",
        ][index],
        state: "pending",
        updatedAt: null,
      })),
    });
    text.dispatchEvent(new Event("input", { bubbles: true }));
    button(source.root, source.copy.importJson).click();
    expect(source.root.querySelector('[role="status"]')?.textContent).toBe(source.copy.imported);
    source.unmount();
  });

  it("rejects an imported review for another region", () => {
    const view = mount();
    const text = view.root.querySelector("textarea")!;
    text.value = JSON.stringify(createSharedDeviceHandback(
      "handback-import-2",
      "south",
      "2026-11-21T10:00:00.000Z",
    ));
    text.dispatchEvent(new Event("input", { bubbles: true }));
    button(view.root, view.copy.importJson).click();
    expect(view.root.querySelector('[role="status"]')?.textContent).toBe(view.copy.regionMismatch);
    view.unmount();
  });

  it("keeps import disabled while the paste area is blank", () => {
    const view = mount();
    expect(button(view.root, view.copy.importJson).disabled).toBe(true);
    view.unmount();
  });

  it("does not start a review or perform actions on mount", () => {
    const view = mount();
    expect(view.root.querySelector('[role="status"]')?.textContent).toBe("");
    expect(view.root.querySelector("ol > li")?.textContent).toBe(view.copy.empty);
    expect(view.root.textContent).toContain(view.copy.boundary);
    view.unmount();
  });

  it("does not schedule timers or polling", () => {
    vi.useFakeTimers();
    try {
      const view = mount();
      expect(vi.getTimerCount()).toBe(0);
      button(view.root, view.copy.capture).click();
      expect(vi.getTimerCount()).toBe(0);
      view.unmount();
      expect(vi.getTimerCount()).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it("removes the panel on unmount", () => {
    const view = mount();
    expect(view.root.querySelector("section")).toBeTruthy();
    view.unmount();
    expect(view.root.querySelector("section")).toBeNull();
  });
});
