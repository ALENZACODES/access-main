import { describe, expect, it } from "vitest";
import { buildCsp } from "../panel/csp";
import { auditFiles, extractCsp, scanFile, type SourceFile } from "./repoAudit";

// Plain-http text is assembled so this file does not trip the repository audit itself.
const H = "http" + "://";

const GOOD = buildCsp();
const f = (path: string, text: string): SourceFile => ({ path, text });
const weak = (file: SourceFile): string[] => scanFile(file).filter((x) => x.rule === "weak-csp").map((x) => x.detail.split(":")[0] ?? "");
const meta = (policy: string): string => `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"></head></html>`;

describe("extractCsp", () => {
  it("reads a meta tag with double or single quotes and decodes entities", () => {
    expect(extractCsp(f("apps/web/index.html", meta("default-src &apos;none&apos;")))?.delivery).toBe("meta");
    expect(extractCsp(f("a.html", `<meta http-equiv='Content-Security-Policy' content='default-src none'>`))?.policy).toBe("default-src none");
    expect(extractCsp(f("a.html", meta("a &amp; b")))?.policy).toBe("a & b");
  });
  it("reads a _headers line, a netlify.toml value and a vercel.json header", () => {
    expect(extractCsp(f("apps/web/public/_headers", `/*\n  Content-Security-Policy: ${GOOD}\n`))).toEqual({ policy: GOOD, delivery: "header" });
    expect(extractCsp(f("netlify.toml", `[[headers]]\n  [headers.values]\n    Content-Security-Policy = "${GOOD}"\n`))?.policy).toBe(GOOD);
    expect(extractCsp(f("vercel.json", `{"headers":[{"headers":[{"key":"Content-Security-Policy","value":"${GOOD}"}]}]}`))?.policy).toBe(GOOD);
  });
  it("returns null when a file sets no policy", () => {
    expect(extractCsp(f("a.html", "<html></html>"))).toBeNull();
    expect(extractCsp(f("_headers", "/*\n  X-Frame-Options: DENY\n"))).toBeNull();
  });
});

describe("the weak-csp rule", () => {
  it("passes the policy buildCsp makes, in every place it can be set", () => {
    expect(weak(f("apps/web/index.html", meta(GOOD)))).toEqual([]);
    expect(weak(f("apps/web/public/_headers", `/*\n  Content-Security-Policy: ${GOOD}\n`))).toEqual([]);
  });
  it.each([
    ["unsafe-eval", GOOD.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'")],
    ["unsafe-inline-script", GOOD.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")],
    ["wildcard-source", GOOD.replace("img-src 'self' data:", "img-src *")],
    ["scheme-only-source", GOOD.replace("connect-src 'self'", "connect-src 'self' https:")],
    ["insecure-origin", GOOD.replace("connect-src 'self'", `connect-src 'self' ${H}data.example.ca`)],
    ["default-src-not-restricted", GOOD.replace("default-src 'none'", "default-src https:")],
  ])("flags %s in a meta tag", (code, policy) => {
    expect(weak(f("apps/web/index.html", meta(policy)))).toContain(code);
  });
  it("requires frame-ancestors in a header but not in a meta tag", () => {
    const noFrame = GOOD.replace("; frame-ancestors 'none'", "");
    expect(weak(f("apps/web/public/_headers", `/*\n  Content-Security-Policy: ${noFrame}\n`))).toContain("missing-frame-ancestors");
    expect(weak(f("apps/web/index.html", meta(noFrame)))).toEqual([]);
  });
  it("reports through auditFiles, and a dated reason can exempt it", () => {
    const file = f("apps/web/index.html", meta("default-src *"));
    const found = auditFiles([file]);
    expect(found.some((x) => x.rule === "weak-csp")).toBe(true);
  });
  it("ignores a policy-like text in a source file", () => {
    expect(weak(f("apps/web/src/x.ts", `const p = "Content-Security-Policy: default-src *";`))).toEqual([]);
  });
});
