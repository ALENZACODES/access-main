import { describe, expect, it, vi } from "vitest";
import type { ShellFile, ShellInventory } from "./assets";
import { browserShellEnvironment, inspectShell, type ShellEnvironment } from "./probe";

const scope = "https://app.example.test/access/";
const cacheName = `workbox-precache-v2-${scope}`;
const workerURL = `${scope}sw.js`;
const privateDetail = "private-device-detail";

type Storage = NonNullable<ReturnType<ShellEnvironment["storage"]>>;
type Metadata = NonNullable<Awaited<ReturnType<Storage["match"]>>>;
type Workers = NonNullable<ReturnType<ShellEnvironment["workers"]>>;
type Worker = NonNullable<Workers["controller"]>;

function worker(scriptURL = workerURL, state: ServiceWorkerState = "activated"): Worker {
  return { scriptURL, state };
}

function inventory(): ShellInventory {
  const descriptors: [ShellFile["kind"], string][] = [
    ["document", "index.html"],
    ["script", "assets/index-a1b2c3.js"],
    ["style", "assets/index-2468.css"],
    ["preload", "assets/ui-abc123.mjs"],
  ];
  return {
    scope,
    files: descriptors.map(([kind, path]) => ({ kind, path, url: scope + path })),
    limited: false,
  };
}

function metadata(url: string, mime: string, changes: Partial<Metadata> = {}): Metadata {
  return {
    url,
    status: 200,
    type: "basic",
    redirected: false,
    headers: new Headers({ "Content-Type": mime }),
    ...changes,
  };
}

function fixture() {
  const input = inventory();
  const activeWorker = worker();
  const registration = {
    scope,
    active: activeWorker as Worker | null,
    installing: null as Worker | null,
    waiting: null as Worker | null,
  };
  const workers = {
    controller: activeWorker as Worker | null,
    getRegistration: vi.fn<Workers["getRegistration"]>(async () => registration),
  };
  const files = new Map<string, Metadata>();
  const caches = new Map([[cacheName, files]]);
  const cache = {
    has: vi.fn<Storage["has"]>(async (name) => caches.has(name)),
    match: vi.fn<Storage["match"]>(async (url, options) => {
      const selected = caches.get(options.cacheName ?? "");
      if (!selected) return undefined;
      if (options.ignoreSearch) {
        for (const [key, response] of selected.entries()) {
          if (key.split("?")[0] === url) return response;
        }
      }
      return selected.get(url);
    }),
  };
  const env: ShellEnvironment = {
    workers: () => workers,
    storage: () => cache,
  };
  const read = (signal = new AbortController().signal) => inspectShell(input, env, signal);
  return { input, workers, registration, caches, files, env, cache, read };
}

function pending<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

const htmlURL = scope + "index.html";
const scriptURL = scope + "assets/index-a1b2c3.js";
const styleURL = scope + "assets/index-2468.css";
const preloadURL = scope + "assets/ui-abc123.mjs";

describe("cache evidence for current entry files", () => {
  it("matches the revisioned fallback and exact built asset URLs in the scoped Workbox cache", async () => {
    const f = fixture();
    f.files.set(`${htmlURL}?__WB_REVISION__=8a134`, metadata(htmlURL, "text/html; charset=utf-8"));
    f.files.set(scriptURL, metadata(scriptURL, "text/javascript"));
    f.files.set(styleURL, metadata(styleURL, "text/css"));
    f.files.set(preloadURL, metadata(preloadURL, "application/javascript"));

    const report = await f.read();

    expect(report.worker).toBe("controlled");
    expect(report.files).toEqual(f.input.files.map(({ kind, path }) => ({ kind, path, state: "present" })));
    expect(f.workers.getRegistration.mock.calls).toEqual([[scope], [scope]]);
    expect(f.cache.has.mock.calls).toEqual([[cacheName], [cacheName]]);
    expect(f.cache.match.mock.calls).toEqual([
      [htmlURL, { cacheName, ignoreSearch: true }],
      [scriptURL, { cacheName, ignoreSearch: false }],
      [styleURL, { cacheName, ignoreSearch: false }],
      [preloadURL, { cacheName, ignoreSearch: false }],
    ]);
  });

  it("returns only the requested paths, even if other scopes and runtime pages have copies", async () => {
    const f = fixture();
    const elsewhere = new Map([[scriptURL, metadata(scriptURL, "text/javascript")]]);
    f.caches.set("shell-pages", elsewhere);
    f.caches.set(`workbox-precache-v2-${scope}other/`, elsewhere);
    f.caches.set(privateDetail, elsewhere);
    f.files.set(`${scope}data/${privateDetail}.json`, metadata(`${scope}data/${privateDetail}.json`, "application/json"));
    f.files.set(preloadURL, metadata(preloadURL, "text/javascript"));
    const report = await f.read();
    expect(report.files.map((file) => file.state)).toEqual(["missing", "missing", "missing", "present"]);
    const exported = JSON.stringify(report);
    expect(exported).not.toContain(privateDetail);
    expect(exported).not.toContain(scope);
    expect(exported).not.toContain("shell-pages");
  });

  it("distinguishes a confirmed absent cache from a denied cache listing", async () => {
    const f = fixture();
    f.caches.delete(cacheName);
    const absent = await f.read();
    expect(absent.worker).toBe("controlled");
    expect(absent.files.every((file) => file.state === "missing")).toBe(true);
    f.cache.has.mockRejectedValue(new Error(privateDetail));
    const denied = await f.read();
    expect(denied.worker).toBe("controlled");
    expect(denied.files.every((file) => file.state === "unknown")).toBe(true);
    expect(f.cache.match).not.toHaveBeenCalled();
    expect(JSON.stringify(denied)).not.toContain(privateDetail);
  });

  it("marks a rejected individual lookup UNKNOWN and continues in inventory order", async () => {
    const f = fixture();
    f.input.limited = true;
    f.files.set(scriptURL, metadata(scriptURL, "application/javascript"));
    f.cache.match.mockRejectedValueOnce(new Error(privateDetail));
    const report = await f.read();
    expect(report.limited).toBe(true);
    expect(report.files.map((file) => file.state)).toEqual(["unknown", "present", "missing", "missing"]);
    expect(report.files.map((file) => file.path)).toEqual(f.input.files.map((file) => file.path));
    expect(JSON.stringify(report)).not.toContain(privateDetail);
  });

  it("does not accept a query variant of a hashed script or stylesheet", async () => {
    const f = fixture();
    f.files.set(`${scriptURL}?preview=other`, metadata(scriptURL, "application/javascript"));
    f.files.set(`${styleURL}?theme=other`, metadata(styleURL, "text/css"));
    const result = await f.read();
    expect(result.files.map((file) => file.state)).toEqual(["missing", "missing", "missing", "missing"]);
  });

  it("does not touch response bodies, navigator connection state, network or cache mutations", async () => {
    const f = fixture();
    const methods: PropertyKey[] = [];
    f.env.storage = () => new Proxy(f.cache, {
      get(target, key) {
        methods.push(key);
        if (key !== "has" && key !== "match") throw new Error("Unexpected storage operation");
        return Reflect.get(target, key);
      },
    });
    f.files.set(htmlURL, new Proxy(metadata(htmlURL, "text/html"), {
      get(target, key) {
        // Promise resolution checks whether its value is a thenable.
        if (key === "then") return undefined;
        if (!["status", "type", "redirected", "url", "headers"].includes(String(key))) {
          throw new Error("Unexpected response access");
        }
        return Reflect.get(target, key);
      },
    }));
    const fetch = vi.fn(() => { throw new Error("Unexpected network access"); });
    vi.stubGlobal("fetch", fetch);
    try {
      const result = await f.read();
      expect(result.files[0]?.state).toBe("present");
      expect(new Set(methods)).toEqual(new Set(["has", "match"]));
      expect(fetch).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe("whether the returned response identifies a usable file", () => {
  it.each<[string, Partial<Metadata>]>([
    ["partial content", { status: 206 }],
    ["no body status", { status: 204 }],
    ["HTTP failure", { status: 404 }],
    ["opaque response", { type: "opaque" }],
    ["opaque redirect", { type: "opaqueredirect" }],
    ["redirect flag", { redirected: true }],
    ["error response", { type: "error" }],
    ["synthetic response", { type: "default" }],
    ["foreign origin", { url: "https://other.example.test/access/assets/index-a1b2c3.js" }],
    ["different path", { url: scope + "assets/old.js" }],
    ["mismatched search", { url: `${scriptURL}?context=${privateDetail}` }],
    ["fragment", { url: `${scriptURL}#${privateDetail}` }],
    ["unknown final URL", { url: "" }],
    ["invalid final URL", { url: "broken" }],
    ["missing content type", { headers: new Headers() }],
    ["HTML in a script response", { headers: new Headers({ "Content-Type": "text/html" }) }],
  ])("treats %s as inconclusive without exposing the response", async (_label, changes) => {
    const f = fixture();
    f.files.set(scriptURL, metadata(scriptURL, "text/javascript", changes));
    const result = await f.read();
    expect(result.files[1]).toEqual({ kind: "script", path: "assets/index-a1b2c3.js", state: "unknown" });
    expect(JSON.stringify(result)).not.toContain(privateDetail);
  });

  it.each([
    ["?__WB_REVISION__=09dc", "present"],
    ["?__WB_REVISION__=", "unknown"],
    ["?__WB_REVISION__=09dc&__WB_REVISION__=abc", "unknown"],
    ["?__WB_REVISION__=09dc&app=two", "unknown"],
    ["?lang=fr", "unknown"],
    ["?__WB_REVISION__=09dc#fragment", "unknown"],
  ])("handles the fallback response URL suffix %s", async (suffix, expected) => {
    const f = fixture();
    f.files.set(`${htmlURL}?__WB_REVISION__=09dc`, metadata(htmlURL + suffix, "text/html"));
    const result = await f.read();
    expect(result.files[0]?.state).toBe(expected);
    expect(JSON.stringify(result)).not.toContain("__WB_REVISION__");
  });

  it("checks all four response types independently, including modulepreloads", async () => {
    const f = fixture();
    f.files.set(htmlURL, metadata(htmlURL, "application/json"));
    f.files.set(scriptURL, metadata(scriptURL, "TEXT/JAVASCRIPT; charset=UTF-8"));
    f.files.set(styleURL, metadata(styleURL, "text/javascript"));
    f.files.set(preloadURL, metadata(preloadURL, "text/css"));
    const result = await f.read();
    expect(result.files.map((file) => file.state)).toEqual(["unknown", "present", "unknown", "unknown"]);
  });
});

describe("worker ownership and permissions", () => {
  it("does not inspect any origin when discovery could not resolve the app base", async () => {
    const f = fixture();
    f.input.scope = null;
    f.input.files = [];
    f.input.limited = true;
    f.env.workers = vi.fn(() => { throw new Error(privateDetail); });
    expect(await f.read()).toEqual({ worker: "unavailable", files: [], limited: true });
    expect(f.env.workers).not.toHaveBeenCalled();
    expect(f.cache.has).not.toHaveBeenCalled();
  });

  it("can run in an environment without service worker support", async () => {
    const f = fixture();
    vi.stubGlobal("navigator", undefined);
    try {
      const result = await inspectShell(f.input, browserShellEnvironment(), new AbortController().signal);
      expect(result.worker).toBe("unavailable");
      expect(result.files.every((file) => file.state === "unknown")).toBe(true);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("treats an exception accessing navigator.serviceWorker as unavailable", async () => {
    const f = fixture();
    vi.stubGlobal("navigator", { get serviceWorker() { throw new Error(privateDetail); } });
    try {
      const result = await inspectShell(f.input, browserShellEnvironment(), new AbortController().signal);
      expect(result.worker).toBe("unavailable");
      expect(JSON.stringify(result)).not.toContain(privateDetail);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("uses existing browser APIs without performing work while creating the adapter", async () => {
    const f = fixture();
    vi.stubGlobal("navigator", { serviceWorker: f.workers });
    vi.stubGlobal("caches", f.cache);
    try {
      const env = browserShellEnvironment();
      expect(f.cache.has).not.toHaveBeenCalled();
      const result = await inspectShell(f.input, env, new AbortController().signal);
      expect(result.worker).toBe("controlled");
      expect(f.cache.match).toHaveBeenCalledTimes(4);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it("distinguishes a first uncontrolled visit from denied storage", async () => {
    const f = fixture();
    f.workers.controller = null;
    const first = await f.read();
    expect(first.worker).toBe("uncontrolled");
    expect(f.workers.getRegistration).not.toHaveBeenCalled();
    f.workers.controller = f.registration.active;
    f.env.storage = () => { throw new Error(privateDetail); };
    const restricted = await f.read();
    expect(restricted.worker).toBe("controlled");
    expect(restricted.files.every((file) => file.state === "unknown")).toBe(true);
    expect(f.cache.has).not.toHaveBeenCalled();
  });

  it("requires a registration for the exact scope with the expected worker script", async () => {
    const f = fixture();
    f.registration.scope = "https://app.example.test/";
    const parent = await f.read();
    expect(parent.worker).toBe("different-scope");
    f.registration.scope = scope;
    f.registration.active = worker(`${scope}alternate-worker.js`);
    f.workers.controller = f.registration.active;
    const differentWorker = await f.read();
    expect(differentWorker.worker).toBe("different-scope");
    expect(differentWorker.files.every((file) => file.state === "unknown")).toBe(true);
    expect(f.cache.has).not.toHaveBeenCalled();
  });

  it("requires the same active worker object, even for identical script filenames", async () => {
    const f = fixture();
    f.registration.active = worker();
    expect(f.registration.active.scriptURL).toBe(f.workers.controller?.scriptURL);
    expect((await f.read()).worker).toBe("unavailable");
    f.registration.active = null;
    expect((await f.read()).worker).toBe("unavailable");
    f.registration.active = worker(workerURL, "activating");
    f.workers.controller = f.registration.active;
    expect((await f.read()).worker).toBe("unavailable");
    expect(f.cache.has).not.toHaveBeenCalled();
  });

  it("treats inaccessible and unregistered scopes as inconclusive", async () => {
    const f = fixture();
    f.workers.getRegistration.mockRejectedValueOnce(new Error(privateDetail));
    f.workers.getRegistration.mockResolvedValueOnce(undefined);
    for (let i = 0; i < 2; i += 1) {
      const result = await f.read();
      expect(result.worker).toBe("unavailable");
      expect(JSON.stringify(result)).not.toContain(privateDetail);
    }
    f.env.storage = () => undefined;
    const noCache = await f.read();
    expect(noCache.worker).toBe("controlled");
    expect(noCache.files.every((file) => file.state === "unknown")).toBe(true);
    expect(f.cache.match).not.toHaveBeenCalled();
  });
});

describe("changes while reading cache metadata", () => {
  it.each(["installing", "waiting"] as const)("withholds ambiguous HTML while a worker is %s", async (phase) => {
    const f = fixture();
    f.registration[phase] = worker(workerURL, phase === "waiting" ? "installed" : "installing");
    f.files.set(`${htmlURL}?__WB_REVISION__=older`, metadata(htmlURL, "text/html"));
    f.files.set(`${htmlURL}?__WB_REVISION__=newer`, metadata(htmlURL, "text/html"));
    f.files.set(styleURL, metadata(styleURL, "text/css"));
    const result = await f.read();
    expect(result.worker).toBe("controlled");
    expect(result.files.map((file) => file.state)).toEqual(["unknown", "missing", "present", "missing"]);
    expect(f.cache.match.mock.calls.map(([url]) => url)).not.toContain(htmlURL);
  });

  it("withdraws an HTML result when installation begins partway through the sample", async () => {
    const f = fixture();
    f.files.set(scriptURL, metadata(scriptURL, "text/javascript"));
    f.cache.match.mockImplementationOnce(async () => {
      f.registration.installing = worker(workerURL, "installing");
      return metadata(htmlURL, "text/html");
    });
    const result = await f.read();
    expect(result.files.map((file) => file.state)).toEqual(["unknown", "present", "missing", "missing"]);
  });

  it("invalidates the sample if a replacement takes control while checking files", async () => {
    const f = fixture();
    f.cache.match.mockImplementationOnce(async () => {
      f.registration.active = worker();
      f.workers.controller = f.registration.active;
      return metadata(htmlURL, "text/html");
    });
    const result = await f.read();
    expect(result.worker).toBe("unavailable");
    expect(result.files.every((file) => file.state === "unknown")).toBe(true);
  });

  it("reports a lost controller after reads without publishing earlier evidence", async () => {
    const f = fixture();
    f.cache.match.mockImplementationOnce(async () => {
      f.workers.controller = null;
      return metadata(htmlURL, "text/html");
    });
    const result = await f.read();
    expect(result.worker).toBe("uncontrolled");
    expect(result.files.every((file) => file.state === "unknown")).toBe(true);
  });

  it("requires a stable controller during registration lookup as well", async () => {
    const f = fixture();
    f.workers.getRegistration.mockImplementationOnce(async () => {
      f.workers.controller = worker();
      return f.registration;
    });
    const result = await f.read();
    expect(result.worker).toBe("unavailable");
    expect(f.cache.match).not.toHaveBeenCalled();
  });

  it("does not return a partial report if a purge removes the named cache", async () => {
    const f = fixture();
    f.cache.match.mockImplementationOnce(async () => {
      f.caches.clear();
      return metadata(htmlURL, "text/html");
    });
    const result = await f.read();
    expect(result.worker).toBe("controlled");
    expect(result.files.every((file) => file.state === "unknown")).toBe(true);
  });

  it("does not report missing when a first install created the cache between checks", async () => {
    const f = fixture();
    f.cache.has.mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const result = await f.read();
    expect(result.worker).toBe("controlled");
    expect(result.files.every((file) => file.state === "unknown")).toBe(true);
    expect(f.cache.match).not.toHaveBeenCalled();
  });

  it("discards partial observations when the final permission check fails", async () => {
    const f = fixture();
    f.files.set(htmlURL, metadata(htmlURL, "text/html"));
    f.cache.has.mockResolvedValueOnce(true).mockRejectedValueOnce(new Error(privateDetail));
    const result = await f.read();
    expect(result.files.every((file) => file.state === "unknown")).toBe(true);
    expect(result.worker).toBe("controlled");
    expect(JSON.stringify(result)).not.toContain(privateDetail);
  });
});

describe("cancelling a check", () => {
  it("rejects a pre-aborted signal before looking up any worker or cache", async () => {
    const f = fixture();
    const abort = new AbortController();
    abort.abort(privateDetail);
    await expect(f.read(abort.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(f.workers.getRegistration).not.toHaveBeenCalled();
    expect(f.cache.has).not.toHaveBeenCalled();
  });

  it("stops waiting on a stalled registration and does not start later reads", async () => {
    const f = fixture();
    const registration = pending<typeof f.registration>();
    f.workers.getRegistration.mockReturnValueOnce(registration.promise);
    const abort = new AbortController();
    const attempt = f.read(abort.signal);
    expect(f.workers.getRegistration).toHaveBeenCalledTimes(1);
    abort.abort(privateDetail);
    await expect(attempt).rejects.toMatchObject({ name: "AbortError", message: "The shell check was cancelled." });
    registration.resolve(f.registration);
    await new Promise<void>((done) => setTimeout(done, 0));
    expect(f.cache.has).not.toHaveBeenCalled();
  });

  it("abandons an in-flight match and never reads the rest of an obsolete page", async () => {
    const f = fixture();
    const start = pending<void>();
    const hit = pending<Metadata>();
    f.cache.match.mockImplementationOnce(() => {
      start.resolve();
      return hit.promise;
    });
    const abort = new AbortController();
    const attempt = f.read(abort.signal);
    await start.promise;
    abort.abort();
    await expect(attempt).rejects.toMatchObject({ name: "AbortError" });
    hit.resolve(metadata(htmlURL, "text/html"));
    await new Promise<void>((done) => setTimeout(done, 0));
    expect(f.cache.match).toHaveBeenCalledTimes(1);
    expect(f.cache.has).toHaveBeenCalledTimes(1);
  });

  it("settles an independent second check while a cancelled read is still blocked", async () => {
    const f = fixture();
    const start = pending<void>();
    const cacheExists = pending<boolean>();
    f.cache.has.mockImplementationOnce(() => {
      start.resolve();
      return cacheExists.promise;
    });
    const abort = new AbortController();
    const first = f.read(abort.signal);
    await start.promise;
    abort.abort();
    await expect(first).rejects.toMatchObject({ name: "AbortError" });
    f.files.set(scriptURL, metadata(scriptURL, "text/javascript"));
    const second = await f.read();
    expect(second.files[1]?.state).toBe("present");
    cacheExists.resolve(true);
    await new Promise<void>((done) => setTimeout(done, 0));
    expect(f.cache.match).toHaveBeenCalledTimes(4);
  });
});
