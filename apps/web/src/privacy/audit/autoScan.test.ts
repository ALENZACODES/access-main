import { describe, expect, it } from "vitest";
import { AUTO_REGISTER, type AutoRow } from "../panel/autoRegister";
import { AUTO_CATALOGUE, compareAuto, formatAutoComparison, isCleanAuto, scanAuto, totalsByKind, type FoundAuto } from "./autoScan";

const PATH = "apps/web/src/map/Example.tsx";
const scan = (text: string, path = PATH): FoundAuto[] => scanAuto([{ path, text }]);
const kinds = (text: string): string[] => scan(text).map((f) => f.kind);
const row = (kind: AutoRow["kind"], uses: number, path = PATH): AutoRow => ({ kind, path, uses, effect: "runs", when: { en: "a", fr: "a" }, does: { en: "a", fr: "a" }, source: "s", recordedOn: "2026-11-21" });

describe("timers and frames", () => {
  it("finds setTimeout and setInterval, bare or through window, globalThis or self", () => {
    expect(scan("setTimeout(a, 1);\nwindow.setInterval(b, 2);\nglobalThis.setTimeout(c, 3);\nself.setInterval(d, 4);")).toEqual([{ kind: "timer", path: PATH, lines: [1, 2, 3, 4] }]);
  });
  it("does not find clearTimeout, a method with the same ending or a longer name", () => {
    expect(kinds("clearTimeout(t); timers.setTimeout(a); mySetTimeout(a); this.setTimeout(a); xsetTimeout(a);")).toEqual([]);
  });
  it("finds animation frames and idle callbacks", () => {
    expect(scan("requestAnimationFrame(f);\nwindow.requestIdleCallback(g);")).toEqual([{ kind: "frame", path: PATH, lines: [1, 2] }]);
  });
  it("does not find cancelAnimationFrame", () => {
    expect(kinds("cancelAnimationFrame(h);")).toEqual([]);
  });
  it("allows a space before the bracket", () => {
    expect(kinds("setTimeout (a, 1);")).toEqual(["timer"]);
  });
});

describe("observers", () => {
  it("finds the four page observers", () => {
    expect(scan("new MutationObserver(a);\nnew IntersectionObserver(b);\nnew ResizeObserver(c);\nnew PerformanceObserver(d);")[0]).toEqual({ kind: "observer", path: PATH, lines: [1, 2, 3, 4] });
  });
  it("does not find the name without new", () => {
    expect(kinds("type X = MutationObserver; const y: ResizeObserver | null = null;")).toEqual([]);
  });
});

describe("listeners", () => {
  it("finds online and offline in any quote", () => {
    expect(scan('window.addEventListener("online", a);\nwindow.addEventListener(\'offline\', b);\nt.addEventListener(`online`, c);')[0]).toEqual({ kind: "network", path: PATH, lines: [1, 2, 3] });
  });
  it("finds the storage event, and page events", () => {
    expect(kinds('window.addEventListener("storage", a); document.addEventListener("visibilitychange", b); window.addEventListener("pagehide", c);')).toEqual(["storage-event", "page-event"]);
  });
  it("does not find a listener for a click or a name that only starts the same", () => {
    expect(kinds('el.addEventListener("click", a); el.addEventListener("onlineish", b); el.addEventListener("storage2", c);')).toEqual([]);
  });
  it("does not find removeEventListener", () => {
    expect(kinds('window.removeEventListener("online", a);')).toEqual([]);
  });
  it("finds a listener written over two lines", () => {
    expect(scan('window.addEventListener(\n  "offline",\n  b,\n);')[0]?.lines).toEqual([1]);
  });
});

describe("channels and workers", () => {
  it("finds a broadcast channel, a message channel, a shared worker and a worker", () => {
    expect(kinds('new BroadcastChannel("a"); new MessageChannel(); new SharedWorker("w.js"); new Worker("w.js");')).toEqual(["channel", "worker"]);
    expect(scan('new BroadcastChannel("a"); new MessageChannel(); new SharedWorker("w");')[0]?.lines).toEqual([1, 1, 1]);
  });
  it("does not find a worker named in a type or a longer name", () => {
    expect(kinds("let w: Worker; new WorkerPool(); new Workers();")).toEqual([]);
  });
});

describe("the offline worker", () => {
  it("finds navigator.serviceWorker, and the same on a variable called nav", () => {
    expect(scan("navigator.serviceWorker.register(a);\nnav.serviceWorker.ready;")[0]).toEqual({ kind: "service-worker", path: PATH, lines: [1, 2] });
  });
  it("finds the capability check", () => {
    expect(kinds('if (!("serviceWorker" in navigator)) return;')).toEqual(["service-worker"]);
    expect(kinds("if (!('serviceWorker' in navigator)) return;")).toEqual(["service-worker"]);
  });
  it("finds the worker's own events", () => {
    expect(scan('self.addEventListener("install", a);\nself.addEventListener("activate", b);\nself.addEventListener("fetch", c);\nself.addEventListener("push", d);')[0]?.lines).toEqual([1, 2, 3, 4]);
  });
  it("does not find a setting that is only called serviceWorker", () => {
    expect(kinds("const x = { ...deps.serviceWorker }; readonly serviceWorker?: Partial<Config>;")).toEqual([]);
  });
});

describe("what is not found", () => {
  it("skips comment lines, in all three styles", () => {
    expect(kinds("// setTimeout(a, 1)\n * setInterval(a, 1)\n/* requestAnimationFrame(a) */\nsetTimeout(b, 2);")).toEqual(["timer"]);
  });
  it("skips tests, type files, the audit folder and narrow/", () => {
    for (const path of ["apps/web/src/a/a.test.ts", "apps/web/src/a/a.test.tsx", "apps/web/src/privacy/audit/a.ts", "apps/web/src/a/a.d.ts", "apps/web/src/narrow/a.ts"]) {
      expect(scan("setTimeout(a, 1);", path), path).toEqual([]);
    }
  });
  it("finds nothing in an empty file or no files", () => {
    expect(scanAuto([])).toEqual([]);
    expect(scan("")).toEqual([]);
  });
  it("counts one place once even when two patterns match it", () => {
    const twice = [{ kind: "timer" as const, patterns: [/setTimeout\(/g, /setTimeout/g] }];
    expect(scanAuto([{ path: PATH, text: "setTimeout(a, 1);" }], twice)[0]?.lines).toEqual([1]);
  });
  it("accepts a pattern with no global flag", () => {
    expect(scanAuto([{ path: PATH, text: "x setTimeout(a,1)\nsetTimeout(b,1)" }], [{ kind: "timer", patterns: [/setTimeout\(/] }])[0]?.lines).toEqual([1, 2]);
  });
});

describe("ordering", () => {
  it("orders files by path and kinds by the catalogue", () => {
    const found = scanAuto([
      { path: "apps/web/src/b/x.ts", text: "setTimeout(a,1)" },
      { path: "apps/web/src/a/x.ts", text: 'new MutationObserver(a); setTimeout(b,1);' },
    ]);
    expect(found.map((f) => `${f.path.slice(13, 14)} ${f.kind}`)).toEqual(["a timer", "a observer", "b timer"]);
  });
  it("lists lines in order within one kind", () => {
    expect(scan("a\nsetTimeout(x,1);\nb\nsetInterval(y,1);")[0]?.lines).toEqual([2, 4]);
  });
  it("has a pattern for every kind in the register's list", () => {
    expect(AUTO_CATALOGUE.map((c) => c.kind).sort()).toEqual(["channel", "frame", "network", "observer", "page-event", "service-worker", "storage-event", "timer", "worker"]);
  });
});

describe("compareAuto", () => {
  const found = (kind: FoundAuto["kind"], lines: number[], path = PATH): FoundAuto => ({ kind, path, lines });
  it("is clean when everything agrees", () => {
    const c = compareAuto([found("timer", [1, 2])], [row("timer", 2)]);
    expect(isCleanAuto(c)).toBe(true);
    expect(formatAutoComparison(c)).toBe("");
  });
  it("says what is found and not listed, with singular and plural", () => {
    expect(formatAutoComparison(compareAuto([found("frame", [4])], []))).toBe(`${PATH}:4: 1 frame place found and no row lists them`);
    expect(formatAutoComparison(compareAuto([found("frame", [4, 9])], []))).toBe(`${PATH}:4: 2 frame places found and no row lists them`);
  });
  it("says what is listed and not found", () => {
    const c = compareAuto([], [row("timer", 1)]);
    expect(c.gone).toEqual([{ kind: "timer", path: PATH }]);
    expect(formatAutoComparison(c)).toBe(`${PATH}: the timer row finds nothing in the file`);
  });
  it("says when the number differs", () => {
    const c = compareAuto([found("timer", [1, 2, 3])], [row("timer", 1)]);
    expect(c.wrongCount).toEqual([{ kind: "timer", path: PATH, listed: 1, found: 3 }]);
    expect(formatAutoComparison(c)).toBe(`${PATH}: the timer row says 1 place but 3 found`);
  });
  it("keeps a kind in a file apart from the same kind in another file", () => {
    const c = compareAuto([found("timer", [1]), found("timer", [1], "apps/web/src/other.ts")], [row("timer", 1)]);
    expect(c.unlisted.map((u) => u.path)).toEqual(["apps/web/src/other.ts"]);
  });
  it("is clean for nothing and nothing", () => {
    expect(isCleanAuto(compareAuto([], []))).toBe(true);
  });
});

describe("totalsByKind", () => {
  it("adds places and files by kind in the order of the kinds, leaving out kinds with none", () => {
    expect(totalsByKind([{ kind: "frame", path: "a", lines: [1, 2] }, { kind: "timer", path: "a", lines: [3] }, { kind: "timer", path: "b", lines: [1] }])).toEqual([
      { kind: "timer", places: 2, files: 2 },
      { kind: "frame", places: 2, files: 1 },
    ]);
    expect(totalsByKind([])).toEqual([]);
  });
});

describe("the real register", () => {
  it("names a file for every row that the scan accepts", () => {
    for (const r of AUTO_REGISTER) expect(scan("setTimeout(a,1)", r.path).length, r.path).toBe(1);
  });
});
