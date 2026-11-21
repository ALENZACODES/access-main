import { describe, expect, it } from "vitest";
import { loadActivity } from "./activityLog";
import { createPrivacyController, type ControllerDeps } from "./controller";
import { activityText } from "./copyExtra";
import { FEATURE_REGISTER } from "./featureRegister";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { liveControllerDeps } from "./liveController";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent } from "./mount";
import type { FeatureHost } from "./permissions";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date("2026-11-19T14:00:00.000Z");
const answers = (map: Record<string, string>): FeatureHost => ({ permissions: { query: ({ name }) => (name in map ? Promise.resolve({ state: map[name]! }) : Promise.reject(new TypeError("no"))) } });

function make(host: FeatureHost, patch: Partial<ControllerDeps> = {}) {
  return createPrivacyController({ storage: createMemoryStorage(), prefix: PREFIX, inventory: FIXTURE, now: () => NOW, features: { register: FEATURE_REGISTER, host }, ...patch });
}

describe("browser features in the controller", () => {
  it("hides the section unless the controller is given the register and a host", () => {
    expect(createPrivacyController({ storage: createMemoryStorage(), prefix: PREFIX, inventory: FIXTURE, now: () => NOW }).html()).not.toContain("data-privacy-features");
    expect(make({}).html()).toContain("data-privacy-features");
  });
  it("shows nothing about the browser's answers before the check", () => {
    const html = make(answers({ geolocation: "denied" })).html();
    expect(html).toContain("Not checked");
    expect(html).not.toContain("Blocked");
  });
  it("asks the browser only when the person presses the check button", async () => {
    let asked = 0;
    const c = make({ permissions: { query: () => ((asked += 1), Promise.resolve({ state: "prompt" })) } });
    c.html();
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(asked).toBe(0);
    await c.dispatchAsync({ type: "check-features" });
    expect(asked).toBeGreaterThan(0);
  });
  it("shows the browser's answers and says so politely after the check", async () => {
    const c = make(answers({ geolocation: "denied", notifications: "granted" }));
    const s = await c.dispatchAsync({ type: "check-features" });
    expect(s.status).toEqual({ kind: "features-checked" });
    expect(s.featureStates?.at).toBe("2026-11-19T14:00:00.000Z");
    const html = c.html();
    expect(html).toContain("Blocked");
    expect(html).toContain("Allowed");
    expect(html).toContain("Checked on 2026-11-19.");
    expect(html).toContain("Browser answers checked.");
  });
  it("shows unknown, not an error, when the browser cannot answer", async () => {
    const c = make({});
    await c.dispatchAsync({ type: "check-features" });
    expect(c.getState().status).toEqual({ kind: "features-checked" });
    const html = c.html();
    expect(html).not.toContain("Allowed");
    expect(html).not.toContain("Blocked");
    expect(html).not.toContain("Will ask you");
    expect(html).toContain("Unknown");
  });
  it("does nothing when asked without a register", async () => {
    const c = createPrivacyController({ storage: createMemoryStorage(), prefix: PREFIX, inventory: FIXTURE, now: () => NOW });
    const before = c.getState();
    expect(await c.dispatchAsync({ type: "check-features" })).toBe(before);
  });
  it("follows the language, with French status wording", async () => {
    const c = make(answers({ geolocation: "denied" }));
    c.dispatch({ type: "set-locale", locale: "fr" });
    await c.dispatchAsync({ type: "check-features" });
    expect(c.html()).toContain("Bloqué");
    expect(c.html()).toContain("Réponses du navigateur contrôlées.");
  });
  it("keeps the answers when the language changes, and clears the download of an earlier file", async () => {
    const c = make(answers({ geolocation: "denied" }), { kept: { register: [], unscanned: [] } });
    c.dispatch({ type: "export-kept-csv" });
    await c.dispatchAsync({ type: "check-features" });
    expect(c.getState().lastExport).toBeNull();
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Bloqué");
  });
  it("closes an open erase confirmation, like the other checks", async () => {
    const c = make({});
    c.dispatch({ type: "erase-ask" });
    expect((await c.dispatchAsync({ type: "check-features" })).confirmingErase).toBe(false);
  });
  it("does not store anything on the device", async () => {
    const storage = createMemoryStorage();
    const c = createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, features: { register: FEATURE_REGISTER, host: answers({ geolocation: "denied" }) } });
    const keys = JSON.stringify(Object.keys((storage as unknown as { dump?: () => object }).dump?.() ?? {}));
    await c.dispatchAsync({ type: "check-features" });
    expect(JSON.stringify(Object.keys((storage as unknown as { dump?: () => object }).dump?.() ?? {}))).toBe(keys);
    expect(storage.getItem(`${PREFIX}features`)).toBeNull();
  });
  it("is part of the live controller's settings, with the App's own register", () => {
    expect(liveControllerDeps().features?.register).toBe(FEATURE_REGISTER);
  });
  it("has status wording in both languages", () => {
    expect(PANEL_STRINGS.en.status({ kind: "features-checked" })).toBe("Browser answers checked.");
    expect(PANEL_STRINGS.fr.status({ kind: "features-checked" })).toBe("Réponses du navigateur contrôlées.");
  });
});

type Handler = (e: PanelEvent) => void;
class FakeRoot {
  innerHTML = "";
  hidden = false;
  focused: string[] = [];
  private handlers = new Map<string, Handler[]>();
  addEventListener(type: "click" | "change", h: Handler): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), h]);
  }
  querySelector(selector: string) {
    return { focus: () => this.focused.push(selector) };
  }
  click(action: string): void {
    const target: ActionTarget = { getAttribute: (n) => (n === "data-action" ? action : null) };
    for (const h of this.handlers.get("click") ?? []) h({ target: { closest: () => target } });
  }
}

describe("the mounted panel", () => {
  it("checks the browser when the person presses the button, then shows the answers and moves focus to the status", async () => {
    const c = make(answers({ geolocation: "denied" }));
    const root = new FakeRoot();
    mountPrivacyPanel(root, c);
    expect(root.innerHTML).toContain("Not checked");
    root.click("check-features");
    await new Promise((r) => setTimeout(r, 0));
    expect(root.innerHTML).toContain("Blocked");
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
  });
});

describe("the download of the features list", () => {
  it("shows its two buttons with the section", () => {
    const html = make({}).html();
    expect(html).toContain('data-action="export-features-csv"');
    expect(html).toContain("Download this list (text)");
  });
  it("does nothing without a register", () => {
    const c = createPrivacyController({ storage: createMemoryStorage(), prefix: PREFIX, inventory: FIXTURE, now: () => NOW });
    expect(c.dispatch({ type: "export-features-csv" }).lastExport).toBeNull();
  });
  it("writes not checked before the check and the browser's answers after it", async () => {
    const c = make(answers({ geolocation: "denied" }));
    const before = c.dispatch({ type: "export-features-csv" });
    expect(before.status).toEqual({ kind: "features-exported", format: "csv" });
    expect(before.lastExport?.text).toContain("Not checked");
    expect(before.lastExport?.count).toBe(FEATURE_REGISTER.length);
    await c.dispatchAsync({ type: "check-features" });
    const after = c.dispatch({ type: "export-features-text" });
    expect(after.lastExport?.text).toContain("Your browser’s answer: Blocked");
    expect(after.lastExport?.filename).toBe("the-app-browser-features-2026-11-19.txt");
    expect(c.html()).toContain("List of what the App asks of your browser prepared as text.");
  });
  it("uses a semicolon in French CSV and French status wording", () => {
    const c = make({});
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.dispatch({ type: "export-features-csv" }).lastExport?.text.split("\r\n")[0]).toContain(";");
    expect(c.html()).toContain("Liste de ce que l’App demande à votre navigateur préparée au format CSV.");
  });
  it("is recorded in the activity list in both languages", () => {
    const storage = createMemoryStorage();
    const c = createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, logActivity: true, features: { register: FEATURE_REGISTER, host: {} } });
    c.dispatch({ type: "export-features-csv" });
    const [entry] = loadActivity(storage, PREFIX, NOW);
    expect(entry).toMatchObject({ kind: "features-export", format: "csv" });
    expect(activityText("en", entry!, () => undefined)).toBe("Downloaded the list of browser features (CSV)");
    expect(activityText("fr", { ...entry!, format: "text" }, () => undefined)).toBe("Liste des fonctions du navigateur téléchargée (texte)");
  });
  it("hands the file to the page from the mounted panel", () => {
    const c = make({});
    const root = new FakeRoot();
    const files: string[] = [];
    mountPrivacyPanel(root, c, { onExport: (f) => files.push(f.mime) });
    root.click("export-features-csv");
    root.click("export-features-text");
    expect(files).toEqual(["text/csv", "text/plain"]);
  });
  it("has status wording in both languages", () => {
    expect(PANEL_STRINGS.en.status({ kind: "features-exported", format: "text" })).toBe("List of what the App asks of your browser prepared as text.");
    expect(PANEL_STRINGS.fr.status({ kind: "features-exported", format: "text" })).toBe("Liste de ce que l’App demande à votre navigateur préparée en texte.");
  });
});
