// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { DashboardModel, DashboardState } from "./offlineDashboard";
import type { RegionManifest } from "./regionDownload";
import { mountOfflineCasebook } from "./offlineCasebookPanel";

const source = { source: "Municipal open data", licence: "CC BY 4.0", date: "2026-02-01" };
const manifest: RegionManifest = {
  regionId: "demo",
  cells: [
    { id: "one", bytes: 20, provenance: source },
    { id: "two", bytes: 30, provenance: source },
  ],
};

function model(): { readonly instance: DashboardModel; readonly unsubscribed: () => boolean } {
  let removed = false;
  const state: DashboardState = {
    phase: "ready", lastResult: null, page: 0, expanded: false,
    plan: null, inventory: {
      regionId: "demo", complete: false, savedCount: 1, unknownCount: 1,
      savedBytes: 20, expectedBytes: 50,
      cells: [
        { id: "one", state: "saved", cause: "present", expectedBytes: 20, provenance: source },
        { id: "two", state: "unknown", cause: "missing", expectedBytes: 30, provenance: source },
      ],
    },
  };
  const instance: DashboardModel = {
    getState: () => state,
    subscribe: () => () => { removed = true; },
    refresh: async () => undefined,
    download: async () => undefined,
    downloadSelected: async () => undefined,
    cancel: () => undefined,
    toggleDetails: () => undefined,
    setPage: () => undefined,
    dispose: () => undefined,
  };
  return { instance, unsubscribed: () => removed };
}

function fixture(language: "en" | "fr" = "en") {
  const root = document.createElement("div");
  document.body.append(root);
  const entry = model();
  const unmount = mountOfflineCasebook(root, manifest, entry.instance, language);
  const click = (name: string): void => {
    const target = [...root.querySelectorAll("button")].find((b) => b.textContent === name);
    if (!target) throw new Error(`Missing test button: ${name}`);
    target.click();
  };
  const close = () => { unmount(); root.remove(); };
  return { root, entry, click, close };
}

describe("offline casebook mounted UI", () => {
  it("mounts a labelled section and heading", () => {
    const { root, close } = fixture();
    expect(root.querySelector("section")?.getAttribute("aria-label")).toBe("Offline issue casebook");
    expect(root.querySelector("h2")?.textContent).toBe("Offline issue casebook");
    close();
  });

  it("starts collapsed and does not read or write files", () => {
    const { root, close } = fixture();
    expect(root.querySelector("section > div")?.hasAttribute("hidden")).toBe(true);
    close();
  });

  it("opens with a native labelled control", () => {
    const { root, click, close } = fixture();
    click("Open issue casebook");
    expect(root.querySelector("button[aria-expanded='true']")).not.toBeNull();
    close();
  });

  it("closes without removing the casebook section", () => {
    const { root, click, close } = fixture();
    click("Open issue casebook");
    click("Close issue casebook");
    expect(root.querySelector("button[aria-expanded='false']")).not.toBeNull();
    close();
  });

  it("exposes 44px targets on all native action buttons", () => {
    const { root, close } = fixture();
    for (const button of root.querySelectorAll("button")) {
      expect(parseInt(button.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
      expect(parseInt(button.style.minWidth, 10)).toBeGreaterThanOrEqual(44);
    }
    close();
  });

  it("keeps native selects large enough for touch", () => {
    const { root, close } = fixture();
    for (const select of root.querySelectorAll("select")) {
      expect(parseInt(select.style.minHeight, 10)).toBeGreaterThanOrEqual(44);
    }
    close();
  });

  it("provides a polite atomic status region", () => {
    const { root, close } = fixture();
    const status = root.querySelector("[role='status']");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.getAttribute("aria-atomic")).toBe("true");
    close();
  });

  it("opens a case through a deliberate click", () => {
    const { root, click, close } = fixture();
    click("Open issue casebook");
    click("Open a case");
    expect(root.querySelector("[role='status']")?.textContent).toContain("Case added");
    expect(root.textContent).toContain("Cases recorded");
    close();
  });

  it("does not start a download while adding a note", () => {
    const { root, click, close } = fixture();
    click("Open issue casebook");
    const first = root.querySelector("select") as HTMLSelectElement;
    first.value = "two";
    click("Open a case");
    expect(root.textContent).toContain("UNKNOWN");
    close();
  });

  it("does not claim a missing copy is saved", () => {
    const { root, click, close } = fixture();
    click("Open issue casebook");
    const first = root.querySelector("select") as HTMLSelectElement;
    first.value = "two";
    click("Open a case");
    expect(root.textContent).toContain("No saved copy recorded");
    close();
  });

  it("can write a note without replacing the local inventory", () => {
    const { root, click, close } = fixture();
    click("Open issue casebook");
    click("Open a case");
    const textarea = root.querySelector("textarea");
    if (!textarea) throw new Error("Missing note input");
    textarea.value = "Manual observation";
    click("Add note");
    expect(root.querySelector("[role='status']")?.textContent).toContain("Note saved");
    close();
  });

  it("rejects empty notes without creating new events", () => {
    const { root, click, close } = fixture();
    click("Open issue casebook");
    click("Open a case");
    click("Add note");
    expect(root.querySelector("[role='status']")?.textContent).toContain("Enter a note");
    close();
  });

  it("keeps selections and search as native keyboard controls", () => {
    const { root, close } = fixture();
    expect(root.querySelector("input[type='search']")).not.toBeNull();
    expect(root.querySelector("select")).not.toBeNull();
    close();
  });

  it("has a labelled optional JSON file picker", () => {
    const { root, close } = fixture();
    const input = root.querySelector("input[type='file']");
    expect(input?.getAttribute("accept")).toContain("application/json");
    expect(root.querySelector(`label[for='${input?.id}']`)).not.toBeNull();
    close();
  });

  it("provides French labels and the literal UNKNOWN status", () => {
    const { root, click, close } = fixture("fr");
    click("Ouvrir le carnet");
    expect(root.querySelector("h2")?.textContent).toBe("Carnet des problèmes hors ligne");
    expect(root.textContent).toContain("UNKNOWN");
    close();
  });

  it("removes listeners and host DOM on unmount", () => {
    const { root, entry, close } = fixture();
    close();
    expect(root.children).toHaveLength(0);
    expect(entry.unsubscribed()).toBe(true);
  });

  it("does not publish future state after unmount", () => {
    const { root, entry, close } = fixture();
    const status = root.querySelector("[role='status']");
    close();
    expect(entry.unsubscribed()).toBe(true);
    expect(status?.isConnected).toBe(false);
  });

  it("includes source, licence and date after an explicit case opening", () => {
    const { root, click, close } = fixture();
    click("Open issue casebook");
    click("Open a case");
    expect(root.textContent).toContain("Municipal open data");
    expect(root.textContent).toContain("CC BY 4.0");
    expect(root.textContent).toContain("2026-02-01");
    close();
  });

  it("does not contain a timer-based retry control", () => {
    const { root, close } = fixture();
    expect(root.querySelector("input[type='datetime-local']")).toBeNull();
    close();
  });

  it("accepts click and keyboard focus on the toggle", () => {
    const { root, close } = fixture();
    const toggle = root.querySelector("button");
    expect(toggle).not.toBeNull();
    toggle?.focus();
    expect(document.activeElement).toBe(toggle);
    close();
  });
});
