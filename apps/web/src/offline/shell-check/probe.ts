import type { ShellFile, ShellInventory, ShellKind } from "./assets";

export type ShellState = "present" | "missing" | "unknown";
export type WorkerState = "controlled" | "uncontrolled" | "unavailable" | "different-scope";

export interface ShellReport {
  worker: WorkerState;
  files: { kind: ShellKind; path: string; state: ShellState }[];
  limited: boolean;
}

type Worker = Pick<ServiceWorker, "state" | "scriptURL">;

interface Registration {
  readonly scope: string;
  readonly active: Worker | null;
  readonly waiting: Worker | null;
  readonly installing: Worker | null;
}

interface Workers {
  readonly controller: Worker | null;
  getRegistration(scope: string): Promise<Registration | undefined>;
}

type CachedResponse = Pick<Response, "status" | "type" | "url" | "redirected" | "headers">;

interface Precache {
  has(name: string): Promise<boolean>;
  match(url: string, options: MultiCacheQueryOptions): Promise<CachedResponse | undefined>;
}

export interface ShellEnvironment {
  workers(): Workers | undefined;
  storage(): Precache | undefined;
}

/** Access each capability on demand. On restricted origins even the getter can throw. */
export function browserShellEnvironment(): ShellEnvironment {
  return {
    workers: () => globalThis.navigator?.serviceWorker,
    storage: () => globalThis.caches,
  };
}

interface WorkerSample {
  state: WorkerState;
  identity?: Worker;
  updating?: boolean;
}

function cancelled(): DOMException {
  return new DOMException("The shell check was cancelled.", "AbortError");
}

function checkCancellation(signal: AbortSignal): void {
  if (signal.aborted) throw cancelled();
}

async function sampleWorker(workers: Workers | undefined, scope: string, signal: AbortSignal): Promise<WorkerSample> {
  if (!workers) return { state: "unavailable" };
  const controller = workers.controller;
  if (!controller) return { state: "uncontrolled" };

  const registration = await workers.getRegistration(scope);
  checkCancellation(signal);
  if (!registration || controller !== workers.controller) return { state: "unavailable" };
  if (registration.scope !== scope || controller.scriptURL !== new URL("sw.js", scope).href) {
    return { state: "different-scope" };
  }
  if (registration.active !== controller || controller.state !== "activated") {
    return { state: "unavailable" };
  }
  return {
    state: "controlled",
    identity: controller,
    updating: Boolean(registration.installing || registration.waiting),
  };
}

function fileReport(inventory: ShellInventory, worker: WorkerState, states: ShellState[] = []): ShellReport {
  return {
    worker,
    files: inventory.files.map(({ kind, path }, index) => ({ kind, path, state: states[index] ?? "unknown" })),
    limited: inventory.limited,
  };
}

function expectedMime(kind: ShellKind, header: string | null): boolean {
  const mime = header?.split(";", 1)[0]?.trim().toLowerCase();
  if (kind === "document") return mime === "text/html";
  if (kind === "style") return mime === "text/css";
  return mime === "text/javascript" || mime === "application/javascript" || mime === "application/ecmascript" || mime === "text/ecmascript";
}

function matchesResource(file: ShellFile, response: CachedResponse): boolean {
  if (response.status !== 200 || response.redirected || response.type !== "basic") return false;
  const served = new URL(response.url);
  // A response's URL is normally the original resource, even when the request
  // was indexed under a revision. A sole Workbox revision is also admissible.
  if (file.kind === "document" && served.searchParams.size === 1 && served.searchParams.get("__WB_REVISION__")) {
    served.search = "";
  }
  return served.href === file.url && expectedMime(file.kind, response.headers.get("Content-Type"));
}

async function readFile(file: ShellFile, cache: Precache, cacheName: string): Promise<ShellState> {
  try {
    // Vite content-addresses assets/. Only the HTML navigation fallback has a
    // revisioned key. Preserve Cache.match's normal Vary and method matching.
    const response = await cache.match(file.url, { cacheName, ignoreSearch: file.kind === "document" });
    if (!response) return "missing";
    return matchesResource(file, response) ? "present" : "unknown";
  } catch {
    // A cache error or an uninspectable response is not proof of absence.
    return "unknown";
  }
}

async function sampleInventory(inventory: ShellInventory, env: ShellEnvironment, signal: AbortSignal): Promise<ShellReport> {
  const scope = inventory.scope;
  if (!scope) return fileReport(inventory, "unavailable");
  let worker: WorkerState = "unavailable";
  try {
    const workers = env.workers();
    const before = await sampleWorker(workers, scope, signal);
    checkCancellation(signal);
    worker = before.state;
    if (worker !== "controlled") return fileReport(inventory, worker);

    const cache = env.storage();
    if (!cache) return fileReport(inventory, worker);
    // Workbox uses its registration scope as the cache suffix. A runtime cache
    // or another app's precache on the same origin must never supply a result.
    const cacheName = `workbox-precache-v2-${scope}`;
    const initiallyExists = await cache.has(cacheName);
    const states: ShellState[] = [];
    for (const file of inventory.files) {
      checkCancellation(signal);
      if (!initiallyExists) states.push("missing");
      else if (file.kind === "document" && before.updating) states.push("unknown");
      else states.push(await readFile(file, cache, cacheName));
    }

    // A read may have spanned a purge, a first install, or a controller change.
    // Re-read the registration, as the old worker object can still be reachable.
    checkCancellation(signal);
    const finallyExists = await cache.has(cacheName);
    checkCancellation(signal);
    worker = "unavailable";
    const after = await sampleWorker(workers, scope, signal);
    if (after.state !== "controlled") return fileReport(inventory, after.state);
    if (before.identity !== after.identity) return fileReport(inventory, "unavailable");
    if (initiallyExists !== finallyExists) return fileReport(inventory, "controlled");
    // A waiting worker can place a different revision of index.html in the same
    // cache. The filenames of the compiled assets are independently versioned.
    if (after.updating) {
      inventory.files.forEach((file, index) => {
        if (file.kind === "document") states[index] = "unknown";
      });
    }
    return fileReport(inventory, "controlled", states);
  } catch {
    checkCancellation(signal);
    return fileReport(inventory, worker);
  }
}

/** Read only cache metadata. Stop waiting immediately if a browser operation stalls on unmount. */
export function inspectShell(inventory: ShellInventory, env: ShellEnvironment, signal: AbortSignal): Promise<ShellReport> {
  if (signal.aborted) return Promise.reject(cancelled());
  return new Promise((resolve, reject) => {
    const onAbort = () => reject(cancelled());
    signal.addEventListener("abort", onAbort, { once: true });
    void sampleInventory(inventory, env, signal).then(resolve, reject).finally(() => {
      signal.removeEventListener("abort", onAbort);
    });
  });
}
