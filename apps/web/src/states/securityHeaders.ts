/**
 * Response headers. The content security policy allows only same-origin resources, so
 * the App cannot load third-party scripts, tiles, fonts or trackers even by mistake.
 * `style-src 'unsafe-inline'` is needed because the renderers use inline style
 * attributes (they carry the palette-checked colours); scripts get no such allowance.
 */
export type ResponseKind = "html" | "text" | "csv" | "script" | "manifest" | "redirect";

export const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "connect-src 'self'",
  "manifest-src 'self'",
  "worker-src 'self'",
  "form-action 'self'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
].join("; ");

const CONTENT_TYPES: Record<ResponseKind, string | null> = {
  html: "text/html; charset=utf-8",
  text: "text/plain; charset=utf-8",
  csv: "text/csv; charset=utf-8",
  script: "application/javascript; charset=utf-8",
  manifest: "application/manifest+json; charset=utf-8",
  redirect: null,
};

export function securityHeaders(kind: ResponseKind): Record<string, string> {
  const h: Record<string, string> = {
    "content-security-policy": CSP,
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "permissions-policy": "geolocation=(), camera=(), microphone=(), payment=()",
    "cross-origin-opener-policy": "same-origin",
    "cache-control": kind === "html" || kind === "redirect" ? "no-cache" : "no-cache, must-revalidate",
  };
  const type = CONTENT_TYPES[kind];
  if (type) h["content-type"] = type;
  if (kind === "redirect") h.vary = "Accept-Language";
  if (kind === "script") h["service-worker-allowed"] = "/";
  return h;
}

export type HeaderIssue =
  | "csp-missing" | "csp-default-src" | "csp-wildcard" | "csp-insecure-scheme" | "csp-unsafe-script" | "csp-third-party"
  | "csp-framing" | "nosniff" | "referrer-policy" | "permissions-policy" | "content-type-charset";

export interface HeaderViolation {
  readonly code: HeaderIssue;
  readonly detail: string;
}

const lower = (h: Readonly<Record<string, string>>): Record<string, string> =>
  Object.fromEntries(Object.entries(h).map(([k, v]) => [k.toLowerCase(), v]));

/** Audit a header set. Case-insensitive on names. */
export function auditHeaders(headers: Readonly<Record<string, string>>): HeaderViolation[] {
  const h = lower(headers);
  const out: HeaderViolation[] = [];
  const add = (code: HeaderIssue, detail: string): void => void out.push({ code, detail });

  const csp = h["content-security-policy"];
  if (!csp) add("csp-missing", "content-security-policy");
  else {
    const directives = new Map(csp.split(";").map((d) => d.trim()).filter(Boolean).map((d) => {
      const [name = "", ...vals] = d.split(/\s+/);
      return [name.toLowerCase(), vals] as const;
    }));
    if (!directives.has("default-src")) add("csp-default-src", "default-src is required");
    for (const [name, vals] of directives) {
      for (const v of vals) {
        if (v === "*") add("csp-wildcard", `${name} *`);
        if (/^(http:|ws:)/i.test(v)) add("csp-insecure-scheme", `${name} ${v}`);
        if (/^https:\/\//i.test(v) || v === "https:") add("csp-third-party", `${name} ${v}`);
      }
    }
    const script = directives.get("script-src") ?? directives.get("default-src") ?? [];
    if (script.some((v) => v === "'unsafe-inline'" || v === "'unsafe-eval'")) add("csp-unsafe-script", `script-src ${script.join(" ")}`);
    const fa = directives.get("frame-ancestors");
    if (!fa || !fa.every((v) => v === "'none'" || v === "'self'")) add("csp-framing", "frame-ancestors must be 'none' or 'self'");
  }
  if (h["x-content-type-options"]?.toLowerCase() !== "nosniff") add("nosniff", "x-content-type-options: nosniff");
  if (!["no-referrer", "same-origin", "strict-origin"].includes(h["referrer-policy"]?.toLowerCase() ?? "")) add("referrer-policy", String(h["referrer-policy"]));
  if (!h["permissions-policy"] || !/geolocation=\(\)/.test(h["permissions-policy"])) add("permissions-policy", "geolocation must be disabled");
  const ct = h["content-type"];
  if (ct && /^(text\/|application\/(javascript|manifest\+json))/.test(ct) && !/charset=utf-8/i.test(ct)) add("content-type-charset", ct);
  return out;
}
