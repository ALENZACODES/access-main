import { describe, expect, it } from "vitest";
import { auditDocument, formatViolations } from "../audit/htmlAudit";
import { auditCsp } from "./csp";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { PRINTABLE_CSP, buildPrintable, renderPrintableDocument } from "./printable";
import { reconcile } from "./reconcile";
import { createMemoryStorage } from "./storage";

const NOW = new Date(2026, 10, 15);
const inv = FIXTURE.map((e) => (e.id === "saved-places" ? { ...e, storageKeys: ["places.v1"] } : e));
const stored = reconcile(createMemoryStorage({ "app.places.v1": "secret contents", "app.mystery": "x" }), PREFIX, inv);

describe("renderPrintableDocument", () => {
  it.each(["en", "fr"] as const)("passes the document audit in %s", (locale) => {
    const html = renderPrintableDocument({ locale, now: NOW, inventory: inv, stored, reviewedOn: "2026-11-15" });
    expect(auditDocument(html), formatViolations(auditDocument(html))).toEqual([]);
  });
  it("passes with an empty list and an empty device", () => {
    const html = renderPrintableDocument({ locale: "en", now: NOW, inventory: [], stored: reconcile(createMemoryStorage(), PREFIX, []) });
    expect(auditDocument(html)).toEqual([]);
  });
  it("sets the language, the title and a heading in the chosen language", () => {
    const fr = renderPrintableDocument({ locale: "fr", now: NOW, inventory: inv, stored });
    expect(fr).toContain('<html lang="fr">');
    expect(fr).toContain("<title>L’App\u00a0: vos données sur cet appareil</title>");
    expect(fr).toContain("<h1>Vos données sur cet appareil</h1>");
  });
  it("shows names and sizes of stored items but never their contents", () => {
    const html = renderPrintableDocument({ locale: "en", now: NOW, inventory: inv, stored });
    expect(html).toContain("places.v1");
    expect(html).not.toContain("secret contents");
  });
  it("escapes list text", () => {
    const html = renderPrintableDocument({ locale: "en", now: NOW, inventory: inv, stored });
    expect(html).toContain("Feedback &lt;note&gt;");
    expect(html).not.toContain("Feedback <note>");
  });
  it("has no script, outside link or outside resource, and carries a policy that allows only its own style", () => {
    const html = renderPrintableDocument({ locale: "en", now: NOW, inventory: inv, stored });
    expect(html).not.toMatch(/<script|<link|@import|url\(|https?:\/\//i);
    expect(auditCsp(PRINTABLE_CSP, { delivery: "meta" })).toEqual([]);
    expect(html).toContain('http-equiv="Content-Security-Policy"');
    expect(PRINTABLE_CSP).toContain("default-src 'none'");
  });
});

describe("buildPrintable", () => {
  it("makes an html file named for the day and language", () => {
    const f = buildPrintable({ locale: "en", now: NOW, inventory: inv, stored });
    expect(f.mime).toBe("text/html");
    expect(f.filename).toBe("the-app-page-2026-11-15.html");
    expect(buildPrintable({ locale: "fr", now: NOW, inventory: inv, stored }).filename).toBe("l-app-page-2026-11-15.html");
    expect(f.count).toBe(2);
  });
});
