import { describe, expect, it } from "vitest";
import { createPrivacyController } from "./controller";
import { FIXTURE } from "./fixtures.test-util";
import { LIVE_RULES, ROUTE_REPORTS_STORAGE_KEY, liveStorage, saveGated } from "./live";
import { checkLiveControllerDeps, liveControllerDeps } from "./liveController";
import { STORAGE_REGISTER } from "./storageRegister";
import { createMemoryStorage } from "./storage";

const NOW = new Date(2026, 10, 19, 9, 0, 0);

describe("liveControllerDeps", () => {
  it("bundles the prefix, purposes, rules, refused list and outside list", () => {
    const d = liveControllerDeps();
    expect(d.prefix).toBe("access.");
    expect(d.purposes?.map((p) => p.id)).toEqual(["route-reports"]);
    expect(d.withdrawRules).toEqual(LIVE_RULES);
    expect(typeof d.refused).toBe("function");
    expect((d.outside ?? []).length).toBeGreaterThan(0);
  });
  it("agrees with the register", () => {
    expect(checkLiveControllerDeps(liveControllerDeps())).toEqual([]);
  });
  it("names the problem when a rule has no purpose, no row, or no gated mark", () => {
    const d = liveControllerDeps();
    expect(checkLiveControllerDeps({ ...d, withdrawRules: [{ purposeId: "nope", key: "access.routeReports.v1" }] })).toContain("rule for access.routeReports.v1 names the unknown purpose nope");
    expect(checkLiveControllerDeps({ ...d, withdrawRules: [{ purposeId: "route-reports", key: "access.unlisted" }] })).toContain("rule for access.unlisted has no row in the register");
    const ungated = STORAGE_REGISTER.map((r) => (r.key === ROUTE_REPORTS_STORAGE_KEY ? { ...r, gated: false } : r));
    expect(checkLiveControllerDeps(d, ungated)).toContain("access.routeReports.v1 has a rule but its register row says it is not gated");
  });
  it("names a gated row that has no rule, and a rule outside the prefix", () => {
    const d = liveControllerDeps();
    expect(checkLiveControllerDeps({ ...d, withdrawRules: [] })).toContain("access.routeReports.v1 is marked gated but has no rule");
    const odd = STORAGE_REGISTER.map((r) => (r.key === "app.preferences.v1" ? { ...r, gated: true } : r));
    expect(checkLiveControllerDeps({ ...d, withdrawRules: [{ purposeId: "route-reports", key: "app.preferences.v1" }] }, odd)).toContain("rule for app.preferences.v1 is outside the prefix access., so the panel could not export it");
  });
});

describe("a controller built from the live settings", () => {
  function make() {
    const storage = createMemoryStorage();
    const c = createPrivacyController({ storage, inventory: FIXTURE, now: () => NOW, ...liveControllerDeps() });
    return { storage, c };
  }
  it("shows the consent choice and the list of what Erase does not reach", () => {
    const html = make().c.html();
    expect(html).toContain("Keep my route reports");
    expect(html).toContain("data-privacy-outside");
    expect(html).toContain("Your display preferences");
  });
  it("removes saved route reports when the person declines, and says how many", () => {
    const { storage, c } = make();
    c.dispatch({ type: "consent", purposeId: "route-reports", value: "granted" });
    expect(saveGated(liveStorage(storage), ROUTE_REPORTS_STORAGE_KEY, "[]")).toBe("saved");
    const st = c.dispatch({ type: "consent", purposeId: "route-reports", value: "declined" });
    expect(st.status).toEqual({ kind: "consent-withdrawn", label: "Keep my route reports", removed: 1 });
    expect(storage.getItem(ROUTE_REPORTS_STORAGE_KEY)).toBeNull();
  });
  it("lists a refused save without its value", () => {
    const { storage, c } = make();
    expect(saveGated(liveStorage(storage), ROUTE_REPORTS_STORAGE_KEY, "secret-looking-value")).toBe("needs-choice");
    const html = c.html();
    expect(html).toContain("data-privacy-refused");
    expect(html).not.toContain("secret-looking-value");
  });
});
