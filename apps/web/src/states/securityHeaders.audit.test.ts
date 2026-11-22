import { describe, expect, it } from "vitest";
import { CSP, auditHeaders, securityHeaders, type ResponseKind } from "./securityHeaders";
import { buildManifest } from "./manifest";
import { STATE_PALETTE } from "./contrast";
import { hrefFor, resolveRoute } from "./router";

const KINDS: ResponseKind[] = ["html", "text", "csv", "script", "manifest", "redirect"];
const codes = (h: Record<string, string>): string[] => auditHeaders(h).map((v) => v.code);
const good = (): Record<string, string> => ({ ...securityHeaders("html") });

describe("securityHeaders", () => {
  for (const kind of KINDS) {
    it(`gives the ${kind} response a set that passes the audit`, () => expect(auditHeaders(securityHeaders(kind))).toEqual([]));
    it(`gives the ${kind} response lowercase names only`, () => {
      for (const k of Object.keys(securityHeaders(kind))) expect(k).toBe(k.toLowerCase());
    });
    it(`never lets the ${kind} response be cached without revalidation`, () => expect(securityHeaders(kind)["cache-control"]).toMatch(/no-cache/));
  }
  it("sets the content type for each kind, and none for a redirect", () => {
    expect(securityHeaders("html")["content-type"]).toBe("text/html; charset=utf-8");
    expect(securityHeaders("text")["content-type"]).toBe("text/plain; charset=utf-8");
    expect(securityHeaders("csv")["content-type"]).toBe("text/csv; charset=utf-8");
    expect(securityHeaders("script")["content-type"]).toBe("application/javascript; charset=utf-8");
    expect(securityHeaders("manifest")["content-type"]).toBe("application/manifest+json; charset=utf-8");
    expect(securityHeaders("redirect")["content-type"]).toBeUndefined();
  });
  it("varies a redirect by language, because the target depends on Accept-Language", () => {
    expect(securityHeaders("redirect").vary).toBe("Accept-Language");
    for (const k of KINDS.filter((x) => x !== "redirect")) expect(securityHeaders(k).vary, k).toBeUndefined();
  });
  it("lets only the script response widen the service worker scope", () => {
    expect(securityHeaders("script")["service-worker-allowed"]).toBe("/");
    for (const k of KINDS.filter((x) => x !== "script")) expect(securityHeaders(k)["service-worker-allowed"], k).toBeUndefined();
  });
  it("gives a new object each call", () => expect(securityHeaders("html")).not.toBe(securityHeaders("html")));
  it("switches off location, camera, microphone and payment", () => {
    for (const f of ["geolocation", "camera", "microphone", "payment"]) expect(securityHeaders("html")["permissions-policy"]).toContain(`${f}=()`);
  });
});

describe("the content security policy", () => {
  const directives = new Map(CSP.split("; ").map((d) => { const [n, ...v] = d.split(" "); return [n!, v] as const; }));
  it("denies everything by default", () => expect(directives.get("default-src")).toEqual(["'none'"]));
  it("allows scripts from this origin only, with no inline script and no eval", () => expect(directives.get("script-src")).toEqual(["'self'"]));
  it("allows no other origin in any directive", () => {
    for (const [n, v] of directives) for (const x of v) expect(["'none'", "'self'", "'unsafe-inline'", "data:"], `${n} ${x}`).toContain(x);
  });
  it("allows inline style only in style-src", () => {
    for (const [n, v] of directives) if (n !== "style-src") expect(v, n).not.toContain("'unsafe-inline'");
  });
  it("allows data: only for images", () => {
    for (const [n, v] of directives) if (n !== "img-src") expect(v, n).not.toContain("data:");
  });
  it("forbids framing, base tags and cross-origin forms", () => {
    expect(directives.get("frame-ancestors")).toEqual(["'none'"]);
    expect(directives.get("base-uri")).toEqual(["'none'"]);
    expect(directives.get("form-action")).toEqual(["'self'"]);
  });
  it("has no directive twice", () => expect(directives.size).toBe(CSP.split("; ").length));
  it("has no trailing separator", () => expect(CSP).not.toMatch(/;\s*$/));
});

describe("auditHeaders", () => {
  it("accepts a good set", () => expect(auditHeaders(good())).toEqual([]));
  it("reads header names in any case", () => {
    const upper = Object.fromEntries(Object.entries(good()).map(([k, v]) => [k.toUpperCase(), v]));
    expect(auditHeaders(upper)).toEqual([]);
  });
  it("finds a missing policy", () => {
    const h = good();
    delete h["content-security-policy"];
    expect(codes(h)).toEqual(["csp-missing"]);
  });
  it("finds a policy with no default-src", () => {
    expect(codes({ ...good(), "content-security-policy": "script-src 'self'; frame-ancestors 'none'" })).toEqual(["csp-default-src"]);
  });
  it("finds a wildcard", () => expect(codes({ ...good(), "content-security-policy": `${CSP}; img-src *` })).toContain("csp-wildcard"));
  it("finds an insecure scheme", () => {
    for (const v of ["http" + "://a.example", "ws://a.example", "HTTP:"]) expect(codes({ ...good(), "content-security-policy": `${CSP}; connect-src ${v}` }), v).toContain("csp-insecure-scheme");
  });
  it("finds a third party, by host or by scheme", () => {
    for (const v of ["https://cdn.example", "https:"]) expect(codes({ ...good(), "content-security-policy": `${CSP}; font-src ${v}` }), v).toContain("csp-third-party");
  });
  it("finds unsafe script, from script-src or the default", () => {
    expect(codes({ ...good(), "content-security-policy": CSP.replace("script-src 'self'", "script-src 'self' 'unsafe-inline'") })).toContain("csp-unsafe-script");
    expect(codes({ ...good(), "content-security-policy": CSP.replace("script-src 'self'", "script-src 'unsafe-eval'") })).toContain("csp-unsafe-script");
    expect(codes({ ...good(), "content-security-policy": "default-src 'unsafe-inline'; frame-ancestors 'none'" })).toContain("csp-unsafe-script");
  });
  it("does not call unsafe-inline in style-src a script problem", () => expect(codes(good())).not.toContain("csp-unsafe-script"));
  it("finds a policy that allows framing", () => {
    for (const p of [CSP.replace("frame-ancestors 'none'", "frame-ancestors *"), CSP.replace("; frame-ancestors 'none'", ""), CSP.replace("frame-ancestors 'none'", "frame-ancestors 'self' https://a.example")]) {
      expect(codes({ ...good(), "content-security-policy": p })).toContain("csp-framing");
    }
    expect(codes({ ...good(), "content-security-policy": CSP.replace("'none'; script", "'none'; script").replace("frame-ancestors 'none'", "frame-ancestors 'self'") })).toEqual([]);
  });
  it("finds a missing or wrong nosniff", () => {
    const h = good();
    delete h["x-content-type-options"];
    expect(codes(h)).toEqual(["nosniff"]);
    expect(codes({ ...good(), "x-content-type-options": "sniff" })).toEqual(["nosniff"]);
    expect(codes({ ...good(), "x-content-type-options": "NoSniff" })).toEqual([]);
  });
  it("accepts the three safe referrer policies and finds the rest", () => {
    for (const v of ["no-referrer", "same-origin", "strict-origin", "Same-Origin"]) expect(codes({ ...good(), "referrer-policy": v }), v).toEqual([]);
    for (const v of ["unsafe-url", "origin", ""]) expect(codes({ ...good(), "referrer-policy": v }), v).toEqual(["referrer-policy"]);
    const h = good();
    delete h["referrer-policy"];
    expect(auditHeaders(h)).toEqual([{ code: "referrer-policy", detail: "undefined" }]);
  });
  it("finds a permissions policy that leaves location on", () => {
    expect(codes({ ...good(), "permissions-policy": "camera=()" })).toEqual(["permissions-policy"]);
    expect(codes({ ...good(), "permissions-policy": "geolocation=(self)" })).toEqual(["permissions-policy"]);
    const h = good();
    delete h["permissions-policy"];
    expect(codes(h)).toEqual(["permissions-policy"]);
  });
  it("finds a text type with no utf-8, and leaves other types alone", () => {
    for (const ct of ["text/html", "text/plain; charset=iso-8859-1", "application/javascript", "application/manifest+json"]) expect(codes({ ...good(), "content-type": ct }), ct).toEqual(["content-type-charset"]);
    for (const ct of ["image/png", "application/octet-stream", "TEXT/HTML; CHARSET=UTF-8"]) expect(codes({ ...good(), "content-type": ct }), ct).toEqual([]);
  });
  it("reports every problem, in a stable order", () => {
    expect(codes({})).toEqual(["csp-missing", "nosniff", "referrer-policy", "permissions-policy"]);
    expect(codes({})).toEqual(codes({}));
  });
  it("gives a detail naming the directive for a directive problem", () => {
    const v = auditHeaders({ ...good(), "content-security-policy": `${CSP}; font-src https://cdn.example` });
    expect(v).toContainEqual({ code: "csp-third-party", detail: "font-src https://cdn.example" });
  });
  it("does not change what it was given", () => {
    const h = Object.freeze(good());
    expect(() => auditHeaders(h)).not.toThrow();
  });
});

describe("buildManifest", () => {
  for (const locale of ["en", "fr"] as const) {
    const m = buildManifest(locale);
    it(`has the language and a start page that resolves, in ${locale}`, () => {
      expect(m.lang).toBe(locale);
      expect(m.start_url).toBe(hrefFor(locale, "search"));
      expect(resolveRoute(m.start_url).kind).not.toBe("not-found");
    });
    it(`keeps the start page inside the scope, in ${locale}`, () => expect(m.start_url.startsWith(m.scope)).toBe(true));
    it(`has a name that is short enough to sit under an icon, in ${locale}`, () => {
      expect(m.name.length).toBeGreaterThan(0);
      expect(m.short_name.length).toBeLessThanOrEqual(30);
      expect(m.short_name).toBe(m.name);
    });
  }
  it("uses the palette's own page colour for both colours", () => {
    const bg = STATE_PALETTE.light.roles.body.bg;
    for (const l of ["en", "fr"] as const) {
      expect(buildManifest(l).background_color).toBe(bg);
      expect(buildManifest(l).theme_color).toBe(bg);
    }
    expect(bg).toMatch(/^#[0-9a-fA-F]{6}$/);
  });
  it("declares no icons and no remote address", () => {
    const m = buildManifest("en");
    expect("icons" in m).toBe(false);
    expect(JSON.stringify(m)).not.toMatch(/https?:/);
  });
  it("is one installable app at the root, shown as an app", () => {
    const m = buildManifest("fr");
    expect(m.id).toBe("/");
    expect(m.scope).toBe("/");
    expect(m.display).toBe("standalone");
    expect(m.dir).toBe("ltr");
  });
  it("survives a round trip through JSON", () => expect(JSON.parse(JSON.stringify(buildManifest("en")))).toEqual(buildManifest("en")));
});
