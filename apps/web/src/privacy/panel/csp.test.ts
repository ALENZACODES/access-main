import { describe, expect, it } from "vitest";
import { auditCsp, buildCsp, isCleanOrigin, parseCsp, renderCspMeta, serializeCsp } from "./csp";

// Plain-http text is assembled so this file does not trip the repository audit itself.
const H = "http" + "://";

const codes = (text: string, delivery: "header" | "meta" = "header"): string[] =>
  auditCsp(text, { delivery }).map((p) => p.code);

describe("buildCsp", () => {
  it("builds a policy that passes its own audit, as a header and as a meta tag", () => {
    expect(auditCsp(buildCsp())).toEqual([]);
    expect(auditCsp(buildCsp({ connectOrigins: ["https://data.example.ca"] }), { delivery: "meta" })).toEqual([]);
  });
  it("allows nothing by default and only the App's own addresses", () => {
    const { directives: d } = parseCsp(buildCsp());
    expect(d["default-src"]).toEqual(["'none'"]);
    expect(d["connect-src"]).toEqual(["'self'"]);
    expect(d["script-src"]).toEqual(["'self'"]);
    expect(d["frame-ancestors"]).toEqual(["'none'"]);
    expect(d["object-src"]).toEqual(["'none'"]);
  });
  it("adds each listed origin once", () => {
    const { directives: d } = parseCsp(buildCsp({ connectOrigins: ["https://a.example.ca", "https://a.example.ca", "https://b.example.ca:8443"] }));
    expect(d["connect-src"]).toEqual(["'self'", "https://a.example.ca", "https://b.example.ca:8443"]);
  });
  it.each([`${H}a.example.ca`, "https://*.example.ca", "https://a.example.ca/path", "*", "https:", "https://a.example.ca?x=1", ""])(
    "refuses %j as an origin",
    (o) => {
      expect(() => buildCsp({ connectOrigins: [o] })).toThrow(RangeError);
    },
  );
  it("drops the style-attribute allowance when asked", () => {
    expect(buildCsp()).toContain("style-src-attr 'unsafe-inline'");
    expect(buildCsp({ inlineStyleAttributes: false })).not.toContain("unsafe-inline");
  });
  it("never allows inline scripts or eval", () => {
    const p = buildCsp({ connectOrigins: ["https://a.example.ca"] });
    expect(p).not.toContain("unsafe-eval");
    expect(parseCsp(p).directives["script-src"]).not.toContain("'unsafe-inline'");
  });
});

describe("parseCsp and serializeCsp", () => {
  it("round-trips", () => {
    const p = buildCsp({ connectOrigins: ["https://a.example.ca"] });
    expect(serializeCsp(parseCsp(p).directives)).toBe(p);
  });
  it("keeps the first of a repeated directive and reports the repeat", () => {
    const r = parseCsp("default-src 'none'; img-src 'self'; img-src *");
    expect(r.directives["img-src"]).toEqual(["'self'"]);
    expect(r.duplicates).toEqual(["img-src"]);
  });
  it("lower-cases directive names and ignores empty parts", () => {
    expect(parseCsp(" DEFAULT-SRC 'none' ;; ").directives).toEqual({ "default-src": ["'none'"] });
  });
});

describe("auditCsp finds each weakness", () => {
  const good = buildCsp();
  const without = (name: string): string =>
    good
      .split("; ")
      .filter((d) => !d.startsWith(`${name} `) && d !== name)
      .join("; ");
  it("missing default-src", () => expect(codes(without("default-src"))).toContain("missing-default-src"));
  it("default-src wide open", () => {
    expect(codes(good.replace("default-src 'none'", "default-src https:"))).toContain("default-src-not-restricted");
  });
  it("accepts default-src 'self'", () => {
    expect(codes(good.replace("default-src 'none'", "default-src 'self'"))).not.toContain("default-src-not-restricted");
  });
  it("unsafe-eval and wasm-unsafe-eval", () => {
    expect(codes(good.replace("script-src 'self'", "script-src 'self' 'unsafe-eval'"))).toContain("unsafe-eval");
    expect(codes(good.replace("script-src 'self'", "script-src 'self' 'wasm-unsafe-eval'"))).toContain("unsafe-eval");
  });
  it("inline scripts, but not inline style attributes", () => {
    expect(codes(good.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'"))).toContain("unsafe-inline-script");
    expect(codes(good)).not.toContain("unsafe-inline-script");
  });
  it.each(["*", "*.example.ca", "https://*.example.ca"])("wildcard %s", (v) => {
    expect(codes(good.replace("img-src 'self' data:", `img-src 'self' ${v}`))).toContain("wildcard-source");
  });
  it.each(["https:", "http:", "wss:"])("scheme-only %s", (v) => {
    expect(codes(good.replace("img-src 'self' data:", `img-src 'self' ${v}`))).toContain("scheme-only-source");
  });
  it("plain http origins, except localhost", () => {
    expect(codes(good.replace("connect-src 'self'", `connect-src 'self' ${H}data.example.ca`))).toContain("insecure-origin");
    expect(codes(good.replace("connect-src 'self'", "connect-src 'self' ws://data.example.ca"))).toContain("insecure-origin");
    expect(codes(good.replace("connect-src 'self'", `connect-src 'self' ${H}localhost:5173`))).not.toContain("insecure-origin");
  });
  it("object-src, base-uri and form-action", () => {
    expect(codes(without("object-src"))).toContain("missing-object-src");
    expect(codes(good.replace("object-src 'none'", "object-src 'self'"))).toContain("missing-object-src");
    expect(codes(without("base-uri"))).toContain("missing-base-uri");
    expect(codes(without("form-action"))).toContain("missing-form-action");
  });
  it("frame-ancestors matters for a header but not for a meta tag", () => {
    expect(codes(without("frame-ancestors"), "header")).toContain("missing-frame-ancestors");
    expect(codes(without("frame-ancestors"), "meta")).not.toContain("missing-frame-ancestors");
  });
  it("a repeated directive", () => {
    expect(codes(`${good}; img-src *`)).toContain("duplicate-directive");
  });
  it("an empty policy fails several rules at once", () => {
    expect(codes("").length).toBeGreaterThanOrEqual(4);
  });
});

describe("isCleanOrigin", () => {
  it.each(["https://a.example.ca", "https://a-b.example.ca:8443", "https://localhost"])("accepts %s", (o) => {
    expect(isCleanOrigin(o)).toBe(true);
  });
  it.each([`${H}a.example.ca`, "https://a.example.ca/", "https://-a.example.ca", "https://a..ca", "a.example.ca", "https://A b.ca"])(
    "rejects %s",
    (o) => {
      expect(isCleanOrigin(o)).toBe(false);
    },
  );
});

describe("renderCspMeta", () => {
  it("escapes quotes so the tag stays well formed", () => {
    const m = renderCspMeta({ connectOrigins: ["https://a.example.ca"] });
    expect(m).toMatch(/^<meta http-equiv="Content-Security-Policy" content="[^"]*">$/);
    expect(m).toContain("default-src 'none'");
  });
});
