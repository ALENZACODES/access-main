import { describe, expect, it } from "vitest";
import { createPrivacyController } from "./controller";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { LIVE_PURPOSES } from "./live";
import type { RefusedWrite } from "./consentGate";
import { createMemoryStorage } from "./storage";

const NOW = new Date(2026, 10, 19, 9, 0, 0);
const R: RefusedWrite = { key: "access.routeReports.v1", purposeId: "route-reports", reason: "no-choice" };

describe("controller refused section", () => {
  it("is hidden when no source is given or the list is empty", () => {
    const base = { storage: createMemoryStorage(), prefix: PREFIX, inventory: FIXTURE, purposes: LIVE_PURPOSES, now: () => NOW };
    expect(createPrivacyController(base).html()).not.toContain("data-privacy-refused");
    expect(createPrivacyController({ ...base, refused: () => [] }).html()).not.toContain("data-privacy-refused");
  });
  it("reads the list each time the panel is drawn", () => {
    const list: RefusedWrite[] = [];
    const c = createPrivacyController({ storage: createMemoryStorage(), prefix: PREFIX, inventory: FIXTURE, purposes: LIVE_PURPOSES, now: () => NOW, refused: () => list });
    expect(c.html()).not.toContain("data-privacy-refused");
    list.push(R);
    const html = c.html();
    expect(html).toContain("data-privacy-refused");
    expect(html).toContain("Keep my route reports");
    expect(html).not.toContain("access.routeReports");
  });
  it("is written in French when the page language is French", () => {
    const c = createPrivacyController({ storage: createMemoryStorage(), prefix: PREFIX, inventory: FIXTURE, purposes: LIVE_PURPOSES, now: () => NOW, refused: () => [R], languages: ["fr"] });
    c.dispatch({ type: "set-locale", locale: "fr" });
    expect(c.html()).toContain("Non enregistré");
  });
});
