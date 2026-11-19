import { describe, expect, it } from "vitest";
import { createPrivacyController } from "./controller";
import { FIXTURE } from "./fixtures.test-util";
import { LIVE_PURPOSES, LIVE_RULES, PRIVACY_STORAGE_PREFIX, ROUTE_REPORTS_STORAGE_KEY, liveStorage, saveGated } from "./live";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 19, 9, 0, 0);

function setup(withRules: boolean) {
  const storage = createMemoryStorage();
  const c = createPrivacyController({
    storage, prefix: PRIVACY_STORAGE_PREFIX, inventory: FIXTURE, purposes: LIVE_PURPOSES, now: () => NOW,
    ...(withRules ? { withdrawRules: LIVE_RULES } : {}),
  });
  return { storage, c };
}

describe("withdrawing a choice", () => {
  it("removes what the feature saved and says how many items went", () => {
    const { storage, c } = setup(true);
    c.dispatch({ type: "consent", purposeId: "route-reports", value: "granted" });
    expect(saveGated(liveStorage(storage), ROUTE_REPORTS_STORAGE_KEY, "[1]")).toBe("saved");
    storage.setItem("access.language", "fr");
    const st = c.dispatch({ type: "consent", purposeId: "route-reports", value: "declined" });
    expect(st.status).toEqual({ kind: "consent-withdrawn", label: "Keep my route reports", removed: 1 });
    expect(storage.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBeNull();
    expect(storage.getItem("access.language")).toBe("fr");
    expect(c.html()).toContain("Removed from this device: 1 item.");
  });
  it("keeps the data when no rules are given, and says only that the choice was saved", () => {
    const { storage, c } = setup(false);
    c.dispatch({ type: "consent", purposeId: "route-reports", value: "granted" });
    saveGated(liveStorage(storage), ROUTE_REPORTS_STORAGE_KEY, "[1]");
    const st = c.dispatch({ type: "consent", purposeId: "route-reports", value: "declined" });
    expect(st.status?.kind).toBe("consent-saved");
    expect(storage.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBe("[1]");
  });
  it("uses the plain message when there was nothing to remove, and never removes on a yes", () => {
    const { storage, c } = setup(true);
    expect(c.dispatch({ type: "consent", purposeId: "route-reports", value: "declined" }).status?.kind).toBe("consent-saved");
    storage.setItem(ROUTE_REPORTS_STORAGE_KEY, "[2]");
    expect(c.dispatch({ type: "consent", purposeId: "route-reports", value: "granted" }).status?.kind).toBe("consent-saved");
    expect(storage.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBe("[2]");
  });
  it("is worded in French with the French typography", () => {
    const text = PANEL_STRINGS.fr.status({ kind: "consent-withdrawn", label: "Lieux", removed: 2 });
    expect(text).toContain("Retiré de cet appareil : 2 éléments.");
    expect(text).toContain("« Lieux »");
    expect(PANEL_STRINGS.fr.status({ kind: "consent-withdrawn", label: "L", removed: 1 })).toContain("1 élément.");
  });
});
