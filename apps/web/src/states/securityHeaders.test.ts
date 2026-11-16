import { describe, expect, it } from "vitest";
import { CSP, auditHeaders, securityHeaders, type HeaderIssue, type ResponseKind } from "./index";

const kinds: ResponseKind[] = ["html", "text", "csv", "script", "manifest", "redirect"];
const codes = (h: Record<string, string>): HeaderIssue[] => auditHeaders(h).map((v) => v.code);
const good = securityHeaders("html");

describe("securityHeaders", () => {
  for (const k of kinds) {
    it(`${k} passes its own audit`, () => expect(auditHeaders(securityHeaders(k))).toEqual([]));
  }
  it("sets a charset on every text type", () => {
    for (const k of ["html", "text", "csv", "script", "manifest"] as const) expect(securityHeaders(k)["content-type"]).toMatch(/charset=utf-8/);
    expect(securityHeaders("redirect")["content-type"]).toBeUndefined();
  });
  it("lets a redirect vary on language and the service worker control the whole scope", () => {
    expect(securityHeaders("redirect").vary).toBe("Accept-Language");
    expect(securityHeaders("script")["service-worker-allowed"]).toBe("/");
  });
  it("only allows same-origin resources, so no third-party tiles, fonts or scripts", () => {
    expect(CSP).not.toMatch(/https?:|\*/);
    expect(CSP).toContain("default-src 'none'");
    expect(CSP).toContain("frame-ancestors 'none'");
    expect(CSP).toContain("script-src 'self'");
  });
});

describe("auditHeaders fails on violations", () => {
  it("missing or weak CSP", () => {
    const none: Record<string, string> = { ...good };
    delete none["content-security-policy"];
    expect(codes(none)).toContain("csp-missing");
    expect(codes({ ...good, "content-security-policy": "script-src 'self'; frame-ancestors 'none'" })).toContain("csp-default-src");
    expect(codes({ ...good, "content-security-policy": "default-src *; frame-ancestors 'none'" })).toContain("csp-wildcard");
    expect(codes({ ...good, "content-security-policy": "default-src 'none'; img-src http://tiles.example; frame-ancestors 'none'" })).toContain("csp-insecure-scheme");
    expect(codes({ ...good, "content-security-policy": "default-src 'none'; img-src https://tiles.example; frame-ancestors 'none'" })).toContain("csp-third-party");
    expect(codes({ ...good, "content-security-policy": "default-src 'none'; img-src https:; frame-ancestors 'none'" })).toContain("csp-third-party");
  });
  it("unsafe script sources", () => {
    expect(codes({ ...good, "content-security-policy": "default-src 'none'; script-src 'self' 'unsafe-inline'; frame-ancestors 'none'" })).toContain("csp-unsafe-script");
    expect(codes({ ...good, "content-security-policy": "default-src 'self' 'unsafe-eval'; frame-ancestors 'none'" })).toContain("csp-unsafe-script");
  });
  it("allows unsafe-inline for styles only", () => {
    expect(codes(good)).not.toContain("csp-unsafe-script");
    expect(good["content-security-policy"]).toContain("style-src 'self' 'unsafe-inline'");
  });
  it("framing, sniffing, referrer, permissions and charset", () => {
    expect(codes({ ...good, "content-security-policy": "default-src 'none'" })).toContain("csp-framing");
    expect(codes({ ...good, "content-security-policy": "default-src 'none'; frame-ancestors https://x.example" })).toContain("csp-framing");
    expect(codes({ ...good, "x-content-type-options": "" })).toContain("nosniff");
    expect(codes({ ...good, "referrer-policy": "unsafe-url" })).toContain("referrer-policy");
    expect(codes({ ...good, "permissions-policy": "camera=()" })).toContain("permissions-policy");
    expect(codes({ ...good, "content-type": "text/html" })).toContain("content-type-charset");
  });
  it("is case-insensitive on header names", () => {
    const upper = Object.fromEntries(Object.entries(good).map(([k, v]) => [k.toUpperCase(), v]));
    expect(auditHeaders(upper)).toEqual([]);
  });
});
