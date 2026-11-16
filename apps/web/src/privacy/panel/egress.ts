// A guard for the App's own network calls. Requests made by the App's code
// (fetch, XMLHttpRequest, sendBeacon, WebSocket, EventSource) to an address that
// is not the App itself or on a short list are refused and reported. Only the
// scheme and host of a refused request are reported, never the path or query,
// which could carry personal data. Page resources such as images and scripts are
// limited by the Content-Security-Policy, not by this guard.

import { isCleanOrigin } from "./csp";

export interface EgressPolicy {
  /** The App's own origin, e.g. https://app.example.ca */
  readonly selfOrigin: string;
  /** Other https origins the App may contact. */
  readonly allowedOrigins: readonly string[];
}

export type BlockReason = "not-listed" | "invalid-url" | "blocked-scheme";
export type Via = "fetch" | "xhr" | "beacon" | "websocket" | "eventsource";

export type Decision =
  | { allowed: true; kind: "same-origin" | "listed-origin" | "local-scheme" }
  | { allowed: false; host: string; scheme: string; reason: BlockReason };

export interface BlockedRequest {
  /** ISO date and time */
  at: string;
  /** Host (with port if any), or the scheme when there is no host */
  host: string;
  scheme: string;
  via: Via;
  reason: BlockReason;
}

const LOCAL_SCHEMES = new Set(["data:", "blob:", "about:"]);
const WEB_SCHEMES: Readonly<Record<string, string>> = { "http:": "http:", "https:": "https:", "ws:": "http:", "wss:": "https:" };

/** Validates and freezes a policy. Throws if an origin is not a clean https origin. */
export function createEgressPolicy(p: { selfOrigin: string; allowedOrigins?: readonly string[] }): EgressPolicy {
  let self: string;
  try {
    self = new URL(p.selfOrigin).origin;
  } catch {
    throw new RangeError(`not an origin: ${p.selfOrigin}`);
  }
  if (self === "null") throw new RangeError(`not an origin: ${p.selfOrigin}`);
  const allowed: string[] = [];
  for (const o of p.allowedOrigins ?? []) {
    if (!isCleanOrigin(o)) throw new RangeError(`not a clean https origin: ${o}`);
    if (!allowed.includes(o)) allowed.push(o);
  }
  return Object.freeze({ selfOrigin: self, allowedOrigins: Object.freeze(allowed) });
}

export function decide(policy: EgressPolicy, input: string): Decision {
  let url: URL;
  try {
    url = new URL(input, `${policy.selfOrigin}/`);
  } catch {
    return { allowed: false, host: "", scheme: "", reason: "invalid-url" };
  }
  if (LOCAL_SCHEMES.has(url.protocol)) return { allowed: true, kind: "local-scheme" };
  const web = WEB_SCHEMES[url.protocol];
  if (web === undefined) return { allowed: false, host: url.protocol, scheme: url.protocol, reason: "blocked-scheme" };
  const origin = `${web}//${url.host}`;
  if (origin === policy.selfOrigin) return { allowed: true, kind: "same-origin" };
  if (policy.allowedOrigins.includes(origin)) return { allowed: true, kind: "listed-origin" };
  return { allowed: false, host: url.host, scheme: url.protocol, reason: "not-listed" };
}

export interface GuardHost {
  fetch?(input: unknown, init?: unknown): Promise<unknown>;
  XMLHttpRequest?: { prototype: { open(method: string, url: string | URL, ...rest: unknown[]): unknown } };
  navigator?: { sendBeacon?(url: string | URL, data?: unknown): boolean };
  WebSocket?: unknown;
  EventSource?: unknown;
}

function urlOf(input: unknown): string {
  if (typeof input === "string") return input;
  if (input !== null && typeof input === "object") {
    const o = input as { url?: unknown; href?: unknown };
    if (typeof o.url === "string") return o.url;
    if (typeof o.href === "string") return o.href;
  }
  return String(input);
}

export interface InstalledGuard {
  /** Puts back what was there before. Safe to call twice. */
  uninstall(): void;
}

export function installEgressGuard(
  host: GuardHost,
  policy: EgressPolicy,
  onBlocked: (b: BlockedRequest) => void,
  now: () => Date = () => new Date(),
): InstalledGuard {
  const undo: Array<() => void> = [];
  const check = (input: unknown, via: Via): boolean => {
    const d = decide(policy, urlOf(input));
    if (d.allowed) return true;
    try {
      onBlocked({ at: now().toISOString(), host: d.host, scheme: d.scheme, via, reason: d.reason });
    } catch {
      // a failing reporter must never let the request through or break the page
    }
    return false;
  };
  const refusal = (): TypeError => new TypeError("Blocked by the App's network policy");

  const origFetch = host.fetch;
  if (typeof origFetch === "function") {
    const wrapped = function (this: unknown, input: unknown, init?: unknown): Promise<unknown> {
      return check(input, "fetch") ? origFetch.call(host, input, init) : Promise.reject(refusal());
    };
    host.fetch = wrapped;
    undo.push(() => {
      if (host.fetch === wrapped) host.fetch = origFetch;
    });
  }

  const proto = host.XMLHttpRequest?.prototype;
  if (proto !== undefined && typeof proto.open === "function") {
    const origOpen = proto.open;
    const wrapped = function (this: unknown, method: string, url: string | URL, ...rest: unknown[]): unknown {
      if (!check(url, "xhr")) throw refusal();
      return origOpen.call(this, method, url, ...rest);
    };
    proto.open = wrapped as typeof proto.open;
    undo.push(() => {
      if (proto.open === (wrapped as typeof proto.open)) proto.open = origOpen;
    });
  }

  const nav = host.navigator;
  const origBeacon = nav?.sendBeacon;
  if (nav !== undefined && typeof origBeacon === "function") {
    const wrapped = function (url: string | URL, data?: unknown): boolean {
      return check(url, "beacon") ? origBeacon.call(nav, url, data) : false;
    };
    nav.sendBeacon = wrapped;
    undo.push(() => {
      if (nav.sendBeacon === wrapped) nav.sendBeacon = origBeacon;
    });
  }

  for (const [key, via] of [["WebSocket", "websocket"], ["EventSource", "eventsource"]] as const) {
    const orig = host[key];
    if (typeof orig !== "function") continue;
    const proxy = new Proxy(orig as new (...a: unknown[]) => object, {
      construct(target, args, newTarget) {
        if (!check(args[0], via)) throw refusal();
        return Reflect.construct(target, args, newTarget) as object;
      },
    });
    host[key] = proxy;
    undo.push(() => {
      if (host[key] === proxy) host[key] = orig;
    });
  }

  let done = false;
  return {
    uninstall: () => {
      if (done) return;
      done = true;
      for (const u of undo.reverse()) u();
    },
  };
}
