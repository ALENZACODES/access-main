// @vitest-environment jsdom
import axe from "axe-core";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ConsentPanel } from "./ConsentPanel.tsx";
import { createConsentEngine } from "./engine.ts";
import { PURPOSES } from "./purposes.ts";
import { createMemoryStore } from "./store.ts";
import type { Locale } from "./types.ts";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function mount(locale: Locale = "en") {
  const engine = createConsentEngine({ purposes: PURPOSES, store: createMemoryStore() });
  act(() => root.render(<ConsentPanel engine={engine} initialLocale={locale} />));
  return engine;
}

function button(name: RegExp): HTMLButtonElement {
  const found = [...container.querySelectorAll("button")].find((b) => name.test(b.textContent ?? ""));
  if (!found) throw new Error(`no button ${String(name)}`);
  return found;
}

function click(el: HTMLElement) {
  act(() => el.click());
}

describe("ConsentPanel", () => {
  it("shows every purpose with its full text and a default of not granted, before any grant", () => {
    mount();
    expect(container.querySelectorAll("section.consent__purpose")).toHaveLength(PURPOSES.length);
    for (const purpose of PURPOSES) {
      expect(container.textContent).toContain(purpose.title.en);
      expect(container.textContent).toContain(purpose.description.en);
    }
    expect(container.textContent).toContain("Not granted. No choice recorded yet.");
    expect(container.textContent).toContain("has not been decided yet");
    expect(container.querySelectorAll("button:not([aria-pressed])")).toHaveLength(PURPOSES.length * 2);
    expect(container.textContent).toContain("No choices recorded yet.");
  });

  it("grants, announces, moves focus, then revokes", () => {
    const engine = mount();
    click(button(/^Grant — Keep my preferences/));
    expect(engine.currentState("store-preferences-on-device").granted).toBe(true);
    expect(container.querySelector("[role=status]")?.textContent).toBe("Granted: Keep my preferences on this device.");
    expect(document.activeElement?.id).toBe("state-store-preferences-on-device");
    expect(container.textContent).toMatch(/Granted on/);
    click(button(/^Revoke — Keep my preferences/));
    expect(engine.currentState("store-preferences-on-device").status).toBe("revoked");
    expect(container.querySelectorAll("ol li")).toHaveLength(2);
  });

  it("records a refusal", () => {
    const engine = mount();
    click(button(/^Refuse — Keep map/));
    expect(engine.currentState("keep-places-offline").status).toBe("refused");
    expect(container.textContent).toMatch(/Refused on/);
  });

  it("switches to French and sets the page language", () => {
    mount();
    click(button(/Français/));
    expect(document.documentElement.lang).toBe("fr");
    expect(container.querySelector("h1")?.textContent).toBe("Vos choix en matière de vie privée");
    expect(container.textContent).toContain(PURPOSES[0]!.description.fr);
    expect(button(/^Accepter/)).toBeTruthy();
    expect(container.textContent).toContain("pas encore déterminé");
  });

  it("has no axe violations in EN or FR (colour contrast and size need a real browser; see e2e)", async () => {
    for (const locale of ["en", "fr"] as const) {
      mount(locale);
      click(button(/^(Grant|Accepter)/));
      const results = await axe.run(container, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
        rules: { "color-contrast": { enabled: false }, "target-size": { enabled: false } },
      });
      expect(results.violations.map((v) => v.id), locale).toEqual([]);
      act(() => root.unmount());
      root = createRoot(container);
    }
  });
});
