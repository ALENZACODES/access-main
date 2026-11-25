import { describe, expect, it } from "vitest";
import { lintCopy, type Locale } from "./copyLint";
import { AUTO_REGISTER, type AutoRow } from "./autoRegister";
import {
  browserWorkerHost,
  checkWorkers,
  differenceCount,
  readWorkers,
  scopePath,
  workerCheck,
  workerFindingText,
  workerSummary,
  type WorkerCode,
  type WorkerHost,
  type WorkerReading,
  type WorkerRegistration,
} from "./autoLive";

const LOCALES: readonly Locale[] = ["en", "fr"];
const reg = (state: WorkerRegistration["state"] = "active", scope = "/"): WorkerRegistration => ({ scope, state });
const reading = (over: Partial<WorkerReading> = {}): WorkerReading => ({ supported: true, controlled: false, registrations: [], ...over });
const NO_RUNS: AutoRow[] = AUTO_REGISTER.filter((r) => !(r.kind === "service-worker" && r.effect === "runs"));
const codes = (r: WorkerReading, rows: readonly AutoRow[] = AUTO_REGISTER): WorkerCode[] => checkWorkers(r, rows).map((f) => f.code);

describe("scopePath", () => {
  it("keeps only the path", () => {
    expect(scopePath("https://example.org/app/")).toBe("/app/");
    expect(scopePath("https://example.org")).toBe("/");
    expect(scopePath("https://user:pw@example.org:8080/a/b?x=1#h")).toBe("/a/b");
  });
  it("is null for text that is not an address", () => {
    expect(scopePath("")).toBeNull();
    expect(scopePath("not a url")).toBeNull();
    expect(scopePath("/relative/only")).toBeNull();
  });
});

describe("browserWorkerHost", () => {
  it("says the browser has no offline workers when it has no container", () => {
    const host = browserWorkerHost(undefined);
    expect(host.supported()).toBe(false);
    expect(host.registrations).toBeUndefined();
  });
  it("says the same for a navigator with no worker container", () => {
    expect(browserWorkerHost({}).supported()).toBe(false);
  });
  it("says whether a worker controls the page, and null when the browser does not say", () => {
    expect(browserWorkerHost({ serviceWorker: { controller: {} } }).controlled?.()).toBe(true);
    expect(browserWorkerHost({ serviceWorker: { controller: null } }).controlled?.()).toBe(false);
    expect(browserWorkerHost({ serviceWorker: {} }).controlled?.()).toBeNull();
  });
  it("lists registrations with their path and state, and never a script address", async () => {
    const host = browserWorkerHost({
      serviceWorker: {
        getRegistrations: async () => [
          { scope: "https://example.org/", active: { scriptURL: "https://example.org/sw.js" } },
          { scope: "https://example.org/a/", active: {}, waiting: {} },
          { scope: "https://example.org/b/", installing: {} },
          { scope: "https://example.org/c/" },
        ],
      },
    });
    const list = await host.registrations?.();
    expect(list).toEqual([{ scope: "/", state: "active" }, { scope: "/a/", state: "waiting" }, { scope: "/b/", state: "installing" }, { scope: "/c/", state: "none" }]);
    expect(JSON.stringify(list)).not.toContain("sw.js");
  });
  it("leaves out a registration whose scope cannot be read", async () => {
    const host = browserWorkerHost({ serviceWorker: { getRegistrations: async () => [{ scope: "nonsense" }, { scope: "https://example.org/", active: {} }] } });
    expect(await host.registrations?.()).toEqual([{ scope: "/", state: "active" }]);
  });
  it("has no registrations question when the browser has none", () => {
    expect(browserWorkerHost({ serviceWorker: {} }).registrations).toBeUndefined();
  });
  it("calls the browser's own method on the browser's own object", async () => {
    const sw = {
      tag: "mine",
      getRegistrations(this: { tag: string }) {
        return Promise.resolve(this.tag === "mine" ? [{ scope: "https://example.org/", active: {} }] : []);
      },
    };
    expect(await browserWorkerHost({ serviceWorker: sw }).registrations?.()).toHaveLength(1);
  });
});

describe("readWorkers", () => {
  it("reads everything a host gives", async () => {
    const host: WorkerHost = { supported: () => true, controlled: () => true, registrations: async () => [reg()] };
    expect(await readWorkers(host)).toEqual({ supported: true, controlled: true, registrations: [reg()] });
  });
  it("says none for a browser with no offline workers, and asks nothing else", async () => {
    let asked = false;
    const host: WorkerHost = { supported: () => false, controlled: () => { asked = true; return true; }, registrations: async () => { asked = true; return [reg()]; } };
    expect(await readWorkers(host)).toEqual({ supported: false, controlled: null, registrations: [] });
    expect(asked).toBe(false);
  });
  it("says unknown, not none, when the registrations question fails or is missing", async () => {
    expect((await readWorkers({ supported: () => true, registrations: () => Promise.reject(new Error("no")) })).registrations).toBeNull();
    expect((await readWorkers({ supported: () => true })).registrations).toBeNull();
    expect((await readWorkers({ supported: () => true, registrations: () => { throw new Error("sync"); } })).registrations).toBeNull();
  });
  it("says unknown when the control question throws", async () => {
    expect((await readWorkers({ supported: () => true, controlled: () => { throw new Error("x"); }, registrations: async () => [] })).controlled).toBeNull();
  });
  it("treats a host whose first question throws as not supported and unknown", async () => {
    expect(await readWorkers({ supported: () => { throw new Error("x"); } })).toEqual({ supported: false, controlled: null, registrations: null });
  });
});

describe("checkWorkers", () => {
  it("says an unsupported browser is that, and nothing else", () => {
    expect(codes(reading({ supported: false, controlled: null }))).toEqual(["unsupported"]);
  });
  it("says no worker is registered and none controls the page", () => {
    expect(codes(reading())).toEqual(["none-registered", "not-controlling"]);
  });
  it("says how many are registered and that one controls the page", () => {
    expect(checkWorkers(reading({ registrations: [reg(), reg("active", "/a/")], controlled: true }), AUTO_REGISTER)).toEqual([
      { code: "registered", detail: { count: 2 } },
      { code: "controls-page", detail: {} },
    ]);
  });
  it("says how many newer workers are waiting", () => {
    expect(checkWorkers(reading({ registrations: [reg(), reg("waiting")], controlled: null }), AUTO_REGISTER)).toEqual([
      { code: "registered", detail: { count: 2 } },
      { code: "waiting", detail: { count: 1 } },
    ]);
  });
  it("says unreadable, not none, when the browser would not say", () => {
    expect(codes(reading({ registrations: null, controlled: null }))).toEqual(["unreadable"]);
  });
  it("says a registered worker is not listed when no row says the App registers one", () => {
    expect(codes(reading({ registrations: [reg()], controlled: null }), NO_RUNS)).toEqual(["registered", "unlisted"]);
    expect(codes(reading({ registrations: [reg()], controlled: null }), AUTO_REGISTER)).toEqual(["registered"]);
  });
  it("does not call a missing worker a difference from the list", () => {
    expect(differenceCount(checkWorkers(reading(), NO_RUNS))).toBe(0);
  });
  it("does not count a row that only reads as one that registers", () => {
    const readsOnly = AUTO_REGISTER.filter((r) => r.kind === "service-worker" && r.effect === "reads");
    expect(codes(reading({ registrations: [reg()], controlled: null }), readsOnly)).toContain("unlisted");
  });
});

describe("differenceCount and workerCheck", () => {
  it("counts only unlisted and unreadable", () => {
    expect(differenceCount([{ code: "registered", detail: {} }, { code: "unlisted", detail: {} }, { code: "unreadable", detail: {} }, { code: "waiting", detail: {} }])).toBe(2);
    expect(differenceCount([])).toBe(0);
  });
  it("keeps the number registered, and null when the browser would not say", () => {
    expect(workerCheck(reading({ registrations: [reg()] }), AUTO_REGISTER).registered).toBe(1);
    expect(workerCheck(reading({ registrations: null }), AUTO_REGISTER).registered).toBeNull();
    expect(workerCheck(reading({ supported: false, registrations: [] }), AUTO_REGISTER).registered).toBe(0);
  });
});

describe("the words", () => {
  it("says each finding in plain words, with singular and plural, in both languages", () => {
    expect(workerFindingText("en", { code: "registered", detail: { count: 1 } })).toBe("1 offline worker is registered for this site.");
    expect(workerFindingText("en", { code: "registered", detail: { count: 3 } })).toBe("3 offline workers are registered for this site.");
    expect(workerFindingText("en", { code: "waiting", detail: { count: 1 } })).toBe("1 newer worker is waiting to take over.");
    expect(workerFindingText("en", { code: "none-registered", detail: {} })).toBe("No offline worker is registered for this site.");
    expect(workerFindingText("fr", { code: "registered", detail: { count: 1 } })).toBe("1 agent hors ligne est enregistré pour ce site.");
    expect(workerFindingText("fr", { code: "registered", detail: { count: 3 } })).toBe("3 agents hors ligne sont enregistrés pour ce site.");
    expect(workerFindingText("fr", { code: "waiting", detail: { count: 2 } })).toBe("2 agents plus récents attendent de prendre le relais.");
  });
  it("passes the copy rules for every finding and number, with no banned word and no interface name", () => {
    const all: WorkerCode[] = ["unsupported", "unreadable", "none-registered", "registered", "controls-page", "not-controlling", "waiting", "unlisted"];
    for (const locale of LOCALES) {
      for (const code of all) {
        for (const count of [0, 1, 2, 12]) {
          const text = workerFindingText(locale, { code, detail: { count } });
          expect(lintCopy(locale, text), text).toEqual([]);
          expect(text).not.toMatch(/verified|vérif|serviceWorker|service worker|navigator/i);
        }
      }
    }
  });
  it("says the summary, with a no-break space before the French colon", () => {
    expect(workerSummary("en", 1, 0)).toBe("1 offline worker registered. No differences found.");
    expect(workerSummary("en", 2, 1)).toBe("2 offline workers registered. 1 difference found.");
    expect(workerSummary("en", null, 2)).toBe("Offline workers: count unknown. 2 differences found.");
    expect(workerSummary("fr", 0, 0)).toBe("0 agent hors ligne enregistré. Aucune différence trouvée.");
    expect(workerSummary("fr", 3, 2)).toBe("3 agents hors ligne enregistrés. 2 différences trouvées.");
    expect(workerSummary("fr", null, 1)).toBe("Agents hors ligne\u00a0: nombre inconnu. 1 différence trouvée.");
  });
  it("passes the copy rules for every summary", () => {
    for (const locale of LOCALES) for (const n of [null, 0, 1, 5]) for (const d of [0, 1, 4]) expect(lintCopy(locale, workerSummary(locale, n, d))).toEqual([]);
  });
});
