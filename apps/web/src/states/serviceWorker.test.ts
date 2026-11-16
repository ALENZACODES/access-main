import { describe, expect, it } from "vitest";
import { DEFAULT_SW_CONFIG, REGISTER_SCRIPT, buildServiceWorker, validateSwConfig, type SwConfig } from "./index";

/** Minimal fakes for the service worker globals. */
class FakeHeaders {
  constructor(private readonly h: Record<string, string> = {}) {}
  get(name: string): string | null { return this.h[name.toLowerCase()] ?? null; }
}
class FakeResponse {
  readonly headers: FakeHeaders;
  readonly ok: boolean;
  constructor(readonly body: string, readonly init: { status?: number; headers?: Record<string, string> } = {}) {
    this.headers = new FakeHeaders(init.headers);
    this.ok = (init.status ?? 200) < 400;
  }
  get status(): number { return this.init.status ?? 200; }
  clone(): FakeResponse { return new FakeResponse(this.body, this.init); }
}
interface FakeRequest { url: string; method: string; mode: string }
const req = (path: string, over: Partial<FakeRequest> = {}): FakeRequest => ({ url: `https://app.test${path}`, method: "GET", mode: "navigate", ...over });

function boot(config: SwConfig = DEFAULT_SW_CONFIG, network: (r: FakeRequest) => Promise<FakeResponse> = async () => new FakeResponse("net")) {
  const listeners: Record<string, ((e: any) => void)[]> = {};
  const stores = new Map<string, Map<string, FakeResponse>>();
  const key = (r: FakeRequest | string): string => (typeof r === "string" ? `https://app.test${r}` : r.url);
  const cacheApi = {
    async open(name: string) {
      if (!stores.has(name)) stores.set(name, new Map());
      const m = stores.get(name)!;
      return {
        addAll: async (paths: string[]) => { for (const p of paths) m.set(key(p), new FakeResponse(`cached:${p}`)); },
        put: async (r: FakeRequest, res: FakeResponse) => void m.set(key(r), res),
        match: async (r: FakeRequest | string) => m.get(key(r)),
      };
    },
    keys: async () => [...stores.keys()],
    delete: async (n: string) => stores.delete(n),
  };
  const timers: { fn: () => void; ms: number; cleared: boolean }[] = [];
  const events: string[] = [];
  const self = {
    location: { origin: "https://app.test" },
    addEventListener: (t: string, fn: (e: any) => void) => void (listeners[t] ??= []).push(fn),
    skipWaiting: async () => void events.push("skipWaiting"),
    clients: { claim: async () => void events.push("claim") },
  };
  const fetched: FakeRequest[] = [];
  const fakeFetch = (r: FakeRequest) => { fetched.push(r); return network(r); };
  const setT = (fn: () => void, ms: number) => { const t = { fn, ms, cleared: false }; timers.push(t); return t; };
  const clearT = (t: { cleared: boolean }) => { t.cleared = true; };
  new Function("self", "caches", "fetch", "Response", "URL", "setTimeout", "clearTimeout", buildServiceWorker(config))(
    self, cacheApi, fakeFetch, FakeResponse, URL, setT, clearT,
  );
  const dispatch = async (type: string, event: Record<string, unknown> = {}) => {
    const waits: Promise<unknown>[] = [];
    let responded: Promise<unknown> | undefined;
    const e = { ...event, waitUntil: (p: Promise<unknown>) => void waits.push(p), respondWith: (p: Promise<unknown>) => void (responded = p) };
    for (const l of listeners[type] ?? []) l(e);
    await Promise.all(waits);
    return { intercepted: responded !== undefined, response: (await responded) as FakeResponse | undefined };
  };
  return { stores, events, fetched, timers, dispatch };
}

describe("generated service worker", () => {
  it("precaches the offline pages at install and takes control", async () => {
    const sw = boot();
    await sw.dispatch("install");
    const cache = sw.stores.get("app-shell-1")!;
    expect([...cache.keys()]).toEqual(["https://app.test/en/offline", "https://app.test/fr/hors-ligne", "https://app.test/manifest.webmanifest"]);
    expect(sw.events).toContain("skipWaiting");
  });
  it("deletes only older caches with its own prefix on activate", async () => {
    const sw = boot();
    sw.stores.set("app-shell-0", new Map());
    sw.stores.set("other-app-1", new Map());
    await sw.dispatch("install");
    await sw.dispatch("activate");
    expect([...sw.stores.keys()].sort()).toEqual(["app-shell-1", "other-app-1"]);
    expect(sw.events).toContain("claim");
  });
  it("serves navigations from the network and keeps a copy", async () => {
    const sw = boot();
    const r = await sw.dispatch("fetch", { request: req("/en/search") });
    expect(r.response?.body).toBe("net");
    await new Promise((x) => setTimeout(x, 0));
    expect(sw.stores.get("app-shell-1")!.has("https://app.test/en/search")).toBe(true);
  });
  it("falls back to the last copy of the page when the network fails", async () => {
    let up = true;
    const sw = boot(DEFAULT_SW_CONFIG, async () => { if (!up) throw new Error("offline"); return new FakeResponse("page v1"); });
    await sw.dispatch("fetch", { request: req("/en/place/hall-1") });
    await new Promise((x) => setTimeout(x, 0));
    up = false;
    const r = await sw.dispatch("fetch", { request: req("/en/place/hall-1") });
    expect(r.response?.body).toBe("page v1");
  });
  it("falls back to the offline page in the right language for pages never visited", async () => {
    const sw = boot(DEFAULT_SW_CONFIG, async () => { throw new Error("offline"); });
    await sw.dispatch("install");
    expect((await sw.dispatch("fetch", { request: req("/en/map") })).response?.body).toBe("cached:/en/offline");
    expect((await sw.dispatch("fetch", { request: req("/fr/carte") })).response?.body).toBe("cached:/fr/hors-ligne");
  });
  it("answers 503 with plain text if even the offline page is missing", async () => {
    const sw = boot(DEFAULT_SW_CONFIG, async () => { throw new Error("offline"); });
    const r = await sw.dispatch("fetch", { request: req("/en/map") });
    expect(r.response?.status).toBe(503);
  });
  it("gives up on a slow network after the configured timeout", async () => {
    const sw = boot(DEFAULT_SW_CONFIG, () => new Promise<FakeResponse>(() => undefined));
    await sw.dispatch("install");
    const pending = sw.dispatch("fetch", { request: req("/en/map") });
    await new Promise((x) => setTimeout(x, 0));
    const t = sw.timers.find((x) => x.ms === DEFAULT_SW_CONFIG.navigationTimeoutMs)!;
    expect(t).toBeDefined();
    t.fn();
    expect((await pending).response?.body).toBe("cached:/en/offline");
  });
  it("never intercepts POST requests or cross-origin requests", async () => {
    const sw = boot();
    expect((await sw.dispatch("fetch", { request: req("/en/report/hall-1", { method: "POST" }) })).intercepted).toBe(false);
    expect((await sw.dispatch("fetch", { request: { url: "https://tiles.example/a.png", method: "GET", mode: "no-cors" } })).intercepted).toBe(false);
    expect((await sw.dispatch("fetch", { request: { url: "not a url", method: "GET", mode: "no-cors" } })).intercepted).toBe(false);
    expect(sw.fetched).toEqual([]);
  });
  it("does not cache errors, redirects or no-store responses", async () => {
    const responses = [new FakeResponse("x", { status: 500 }), new FakeResponse("x", { status: 302 }), new FakeResponse("x", { headers: { "cache-control": "private, No-Store" } })];
    let i = 0;
    const sw = boot(DEFAULT_SW_CONFIG, async () => responses[i++]!);
    for (const p of ["/a", "/b", "/c"]) await sw.dispatch("fetch", { request: req(p) });
    await new Promise((x) => setTimeout(x, 0));
    expect([...(sw.stores.get("app-shell-1") ?? new Map()).keys()]).toEqual([]);
  });
  it("serves other same-origin GET requests cache-first", async () => {
    const sw = boot();
    await sw.dispatch("fetch", { request: req("/asset.js", { mode: "no-cors" }) });
    await sw.dispatch("fetch", { request: req("/asset.js", { mode: "no-cors" }) });
    expect(sw.fetched).toHaveLength(1);
  });
});

describe("service worker config", () => {
  const ok = DEFAULT_SW_CONFIG;
  it("accepts the default", () => expect(() => validateSwConfig(ok)).not.toThrow());
  it.each([
    [{ ...ok, version: "bad version!" }, /version/],
    [{ ...ok, version: "" }, /version/],
    [{ ...ok, cachePrefix: "X" }, /prefix/],
    [{ ...ok, navigationTimeoutMs: 10 }, /navigationTimeoutMs/],
    [{ ...ok, navigationTimeoutMs: 1.5 }, /navigationTimeoutMs/],
    [{ ...ok, precache: [...ok.precache, "https://evil.example/x"] }, /same-origin/],
    [{ ...ok, precache: [...ok.precache, "//evil.example/x"] }, /same-origin/],
    [{ ...ok, precache: [...ok.precache, "/a\"; alert(1); \""] }, /same-origin/],
    [{ ...ok, precache: ["/en/offline"] }, /fr offline page/],
  ] as [SwConfig, RegExp][])("rejects %#", (cfg, re) => expect(() => buildServiceWorker(cfg)).toThrow(re));
  it("embeds values as JSON so nothing can break out of the script", () => {
    const src = buildServiceWorker({ ...ok, version: "2.0-a" });
    expect(src).toContain('var CACHE = PREFIX + "-" + "2.0-a"');
    expect(src).not.toContain("</script");
  });
  it("registers from an external script with no inline code", () => {
    expect(REGISTER_SCRIPT).toContain('register("/sw.js"');
    expect(REGISTER_SCRIPT).toContain('scope: "/"');
  });
});
