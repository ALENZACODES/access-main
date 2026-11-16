// Content Security Policy: build a strict one, read one, and judge one.
// The App talks to nothing but itself and the origins it lists, so the policy
// starts from "nothing allowed" and opens only what is named.

export type Directives = Record<string, string[]>;

export interface CspOptions {
  /** Extra https origins the App's code may contact (fetch, XHR, WebSocket). */
  connectOrigins?: readonly string[];
  /** Allow style="" attributes. The panel's 44 px targets use them. Default true. */
  inlineStyleAttributes?: boolean;
}

export type CspCode =
  | "missing-default-src"
  | "default-src-not-restricted"
  | "unsafe-eval"
  | "unsafe-inline-script"
  | "wildcard-source"
  | "scheme-only-source"
  | "insecure-origin"
  | "missing-object-src"
  | "missing-base-uri"
  | "missing-form-action"
  | "missing-frame-ancestors"
  | "bad-connect-origin"
  | "duplicate-directive";

export interface CspProblem {
  code: CspCode;
  directive: string;
  detail: string;
}

const ORIGIN_RE = /^https:\/\/[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)*(:\d{1,5})?$/;

/** A bare https origin, no path, no wildcard. */
export function isCleanOrigin(o: string): boolean {
  return ORIGIN_RE.test(o);
}

export function buildCsp(options: CspOptions = {}): string {
  const connect = ["'self'"];
  for (const o of options.connectOrigins ?? []) {
    if (!isCleanOrigin(o)) throw new RangeError(`not a clean https origin: ${o}`);
    if (!connect.includes(o)) connect.push(o);
  }
  const d: Directives = {
    "default-src": ["'none'"],
    "script-src": ["'self'"],
    "style-src": ["'self'"],
    "img-src": ["'self'", "data:"],
    "font-src": ["'self'"],
    "connect-src": connect,
    "manifest-src": ["'self'"],
    "worker-src": ["'self'"],
    "object-src": ["'none'"],
    "base-uri": ["'self'"],
    "form-action": ["'self'"],
    "frame-ancestors": ["'none'"],
  };
  if (options.inlineStyleAttributes !== false) d["style-src-attr"] = ["'unsafe-inline'"];
  d["upgrade-insecure-requests"] = [];
  return serializeCsp(d);
}

export function serializeCsp(d: Directives): string {
  return Object.entries(d)
    .map(([k, v]) => (v.length === 0 ? k : `${k} ${v.join(" ")}`))
    .join("; ");
}

/** Reads a policy. A directive named twice keeps its first value, as browsers do. */
export function parseCsp(text: string): { directives: Directives; duplicates: string[] } {
  const directives: Directives = {};
  const duplicates: string[] = [];
  for (const part of text.split(";")) {
    const tokens = part.trim().split(/\s+/).filter((t) => t !== "");
    const name = tokens.shift()?.toLowerCase();
    if (name === undefined) continue;
    if (name in directives) duplicates.push(name);
    else directives[name] = tokens;
  }
  return { directives, duplicates };
}

export interface AuditCspOptions {
  /** "header" also requires frame-ancestors, which a meta tag cannot carry. Default "header". */
  delivery?: "header" | "meta";
}

/** Judges a policy. An empty list means every rule below holds. */
export function auditCsp(text: string, options: AuditCspOptions = {}): CspProblem[] {
  const { directives: d, duplicates } = parseCsp(text);
  const out: CspProblem[] = [];
  const add = (code: CspCode, directive: string, detail: string): void => {
    out.push({ code, directive, detail });
  };
  for (const name of duplicates) add("duplicate-directive", name, "named more than once; only the first counts");

  const def = d["default-src"];
  if (def === undefined) add("missing-default-src", "default-src", "no default-src");
  else if (!def.includes("'none'") && !(def.length === 1 && def[0] === "'self'")) {
    add("default-src-not-restricted", "default-src", `default-src ${def.join(" ")}`);
  }

  for (const [name, values] of Object.entries(d)) {
    for (const v of values) {
      const lower = v.toLowerCase();
      if (lower === "'unsafe-eval'" || lower === "'wasm-unsafe-eval'") add("unsafe-eval", name, v);
      if (lower === "'unsafe-inline'" && (name === "script-src" || name === "script-src-elem" || name === "default-src")) {
        add("unsafe-inline-script", name, v);
      }
      if (lower === "*" || /^\*\./.test(lower) || /^https?:\/\/\*/.test(lower)) add("wildcard-source", name, v);
      if (lower === "https:" || lower === "http:" || lower === "ws:" || lower === "wss:") add("scheme-only-source", name, v);
      if (/^(http|ws):\/\//.test(lower) && !/^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(lower)) {
        add("insecure-origin", name, v);
      }
    }
  }
  if (d["object-src"] === undefined || !d["object-src"].includes("'none'")) add("missing-object-src", "object-src", "object-src must be 'none'");
  if (d["base-uri"] === undefined) add("missing-base-uri", "base-uri", "no base-uri");
  if (d["form-action"] === undefined) add("missing-form-action", "form-action", "no form-action");
  if ((options.delivery ?? "header") === "header" && d["frame-ancestors"] === undefined) {
    add("missing-frame-ancestors", "frame-ancestors", "no frame-ancestors");
  }
  for (const o of d["connect-src"] ?? []) {
    if (!o.startsWith("'") && !isCleanOrigin(o) && !/^(https:|http:|ws:|wss:|\*)/.test(o.toLowerCase())) {
      add("bad-connect-origin", "connect-src", o);
    }
  }
  return out;
}

export function renderCspMeta(options: CspOptions = {}): string {
  const content = buildCsp(options).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
  return `<meta http-equiv="Content-Security-Policy" content="${content}">`;
}
