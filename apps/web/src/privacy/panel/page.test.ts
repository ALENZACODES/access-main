import { describe, expect, it } from "vitest";
import { createPrivacyController, type PrivacyController } from "./controller";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import type { ExportFile } from "./localData";
import type { PanelEvent } from "./mount";
import { installPrivacyRoute, type Focusable, type ShellContainer, type ShellHost } from "./page";
import { PAGE_TITLES } from "./route";
import { prefsKey } from "./preferences";
import { createMemoryStorage } from "./storage";

type Handler = (e: PanelEvent) => void;

class FakeContainer implements ShellContainer {
  innerHTML = "";
  hidden = true;
  focused: string[] = [];
  private handlers = new Map<string, Handler[]>();
  addEventListener(type: "click" | "change", h: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), h]);
  }
  querySelector(selector: string): Focusable | null {
    return { focus: () => this.focused.push(selector) };
  }
  fire(type: "click" | "change", attrs: Record<string, string>): void {
    const event: PanelEvent = {
      target: { closest: (sel) => (sel.slice(1, -1) in attrs ? { getAttribute: (n) => attrs[n] ?? null } : null) },
    };
    for (const h of this.handlers.get(type) ?? []) h(event);
  }
}

class FakeHost implements ShellHost {
  location = { hash: "" };
  focusedBefore: string[] = [];
  document = {
    title: "Home",
    documentElement: { lang: "en" },
    activeElement: { focus: () => this.focusedBefore.push("trigger") } as Focusable | null,
  };
  private listeners: Array<() => void> = [];
  addEventListener(_t: "hashchange", h: () => void): void {
    this.listeners.push(h);
  }
  removeEventListener(_t: "hashchange", h: () => void): void {
    this.listeners = this.listeners.filter((x) => x !== h);
  }
  navigate(hash: string): void {
    this.location.hash = hash;
    for (const l of [...this.listeners]) l();
  }
  get listenerCount(): number {
    return this.listeners.length;
  }
}

function setup(hash = "") {
  const host = new FakeHost();
  host.location.hash = hash;
  const container = new FakeContainer();
  const storage = createMemoryStorage();
  const controllers: PrivacyController[] = [];
  const exported: ExportFile[] = [];
  const route = installPrivacyRoute({
    host,
    container,
    onExport: (f) => exported.push(f),
    createController: () => {
      const c = createPrivacyController({
        storage,
        prefix: PREFIX,
        inventory: FIXTURE,
        now: () => new Date(2026, 10, 15, 9, 0, 0),
        languages: ["en"],
      });
      controllers.push(c);
      return c;
    },
  });
  return { host, container, storage, controllers, route, exported };
}

describe("when the address is not the privacy page", () => {
  it("shows nothing and changes nothing", () => {
    const { host, container, controllers } = setup("#/home");
    expect(container.hidden).toBe(true);
    expect(container.innerHTML).toBe("");
    expect(host.document.title).toBe("Home");
    expect(controllers).toHaveLength(0);
  });
});

describe("arriving", () => {
  it("shows the panel, sets title and language, and moves focus to the page heading", () => {
    const { host, container, controllers } = setup("#/privacy");
    expect(controllers).toHaveLength(1);
    expect(container.hidden).toBe(false);
    expect(container.innerHTML).toContain("data-privacy-panel");
    expect(host.document.title).toBe(PAGE_TITLES.en);
    expect(host.document.documentElement.lang).toBe("en");
    expect(container.focused.at(-1)).toBe("#privacy-panel-title");
  });
  it("opens in French on the French address, and remembers that choice", () => {
    const { host, container, storage } = setup("#/confidentialite");
    expect(container.innerHTML).toContain('lang="fr"');
    expect(host.document.title).toBe(PAGE_TITLES.fr);
    expect(host.document.documentElement.lang).toBe("fr");
    expect(storage.getItem(prefsKey(PREFIX))).toBe('{"locale":"fr"}');
  });
  it("starts when the person navigates to it", () => {
    const { host, container } = setup("#/home");
    host.navigate("#/privacy");
    expect(container.hidden).toBe(false);
    expect(host.document.title).toBe(PAGE_TITLES.en);
  });
});

describe("leaving", () => {
  it("hides and empties the panel, restores title, language and focus", () => {
    const { host, container } = setup("#/home");
    host.document.title = "Home";
    host.document.documentElement.lang = "en";
    host.navigate("#/confidentialite");
    host.navigate("#/home");
    expect(container.hidden).toBe(true);
    expect(container.innerHTML).toBe("");
    expect(host.document.title).toBe("Home");
    expect(host.document.documentElement.lang).toBe("en");
    expect(host.focusedBefore).toEqual(["trigger"]);
  });
  it("stops following the controller once left", () => {
    const { host, controllers } = setup("#/privacy");
    const c = controllers[0]!;
    host.navigate("#/home");
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(host.location.hash).toBe("#/home");
  });
  it("creates a fresh controller on the next visit", () => {
    const { host, controllers } = setup("#/privacy");
    host.navigate("#/home");
    host.navigate("#/privacy");
    expect(controllers).toHaveLength(2);
  });
});

describe("changing language", () => {
  it("following the other address keeps the panel and switches language, title and focus", () => {
    const { host, container, controllers } = setup("#/privacy");
    host.navigate("#/confidentialite");
    expect(controllers).toHaveLength(1);
    expect(controllers[0]?.getState().prefs.locale).toBe("fr");
    expect(container.innerHTML).toContain('lang="fr"');
    expect(host.document.title).toBe(PAGE_TITLES.fr);
    expect(host.document.documentElement.lang).toBe("fr");
    expect(container.focused.at(-1)).toBe("#privacy-panel-title");
  });
  it("choosing a language in the panel updates the address and title without stealing focus", () => {
    const { host, container } = setup("#/privacy");
    container.focused.length = 0;
    container.fire("change", { "data-locale-option": "", value: "fr" });
    expect(host.location.hash).toBe("#/confidentialite");
    expect(host.document.title).toBe(PAGE_TITLES.fr);
    expect(host.document.documentElement.lang).toBe("fr");
    expect(container.focused).toEqual(['[data-locale-option][value="fr"]']);
  });
  it("switching back works the same way", () => {
    const { host, container } = setup("#/confidentialite");
    container.fire("change", { "data-locale-option": "", value: "en" });
    expect(host.location.hash).toBe("#/privacy");
    expect(host.document.documentElement.lang).toBe("en");
  });
});

describe("working inside the page", () => {
  it("passes exports to the caller", () => {
    const { container, storage, exported } = setup("#/privacy");
    storage.setItem(`${PREFIX}a`, "1");
    container.fire("click", { "data-action": "export" });
    expect(exported).toHaveLength(1);
    expect(exported[0]?.count).toBe(1);
  });
  it("the list download works with nothing stored", () => {
    const { container, exported } = setup("#/privacy");
    container.fire("click", { "data-action": "export-list-csv" });
    expect(exported[0]?.filename).toBe("the-app-data-list-2026-11-15.csv");
  });
});

describe("dispose", () => {
  it("stops listening and leaves the page", () => {
    const { host, container, route } = setup("#/privacy");
    expect(host.listenerCount).toBe(1);
    route.dispose();
    expect(host.listenerCount).toBe(0);
    expect(container.hidden).toBe(true);
    expect(host.document.title).toBe("Home");
    host.navigate("#/privacy");
    expect(container.hidden).toBe(true);
  });
  it("is safe when the page was never shown", () => {
    const { route, host } = setup("#/home");
    expect(() => route.dispose()).not.toThrow();
    expect(host.listenerCount).toBe(0);
  });
  it("sync can be called by hand", () => {
    const { host, container, route } = setup("#/home");
    host.location.hash = "#/privacy";
    route.sync();
    expect(container.hidden).toBe(false);
  });
});
