// CI audit: the register says what each kind of start does. Here the source is read again and each claim that can be
// checked is: a file marked as only asking the browser never registers or removes a worker; the files that register one
// do; the worker the App builds has the handlers its row names; every watcher and listener is stopped in the same file;
// no timer repeats; and a frame callback only puts focus back.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { DEFAULT_SW_CONFIG, REGISTER_SCRIPT, buildServiceWorker } from "../../states/serviceWorker";
import { AUTO_REGISTER, rowsFor } from "../panel/autoRegister";
import { scanAuto } from "./autoScan";
import { loadFiles } from "./repoFiles";
import { isScannedSource } from "./storageKeys";

const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));
const files = loadFiles(ROOT, ["apps/web/src"]);
const text = (path: string): string => {
  const f = files.find((x) => x.path === path);
  if (f === undefined) throw new Error(`no such file: ${path}`);
  return f.text.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
};

describe("the offline worker rows", () => {
  it("never register, remove or look up a worker in a file marked as only asking the browser", () => {
    const reads = AUTO_REGISTER.filter((r) => r.effect === "reads");
    expect(reads.length).toBeGreaterThan(0);
    for (const r of reads) expect(text(r.path), r.path).not.toMatch(/\.(?:register|unregister|getRegistrations?|update)\s*\(/);
  });

  it("register a worker in each file marked as setting work going", () => {
    const runs = AUTO_REGISTER.filter((r) => r.kind === "service-worker" && r.effect === "runs");
    expect(runs.map((r) => r.path)).toEqual(["apps/web/src/data-status/registerOffline.ts", "apps/web/src/states/serviceWorker.ts"]);
    expect(text("apps/web/src/data-status/registerOffline.ts")).toMatch(/\.register\(/);
    expect(REGISTER_SCRIPT).toMatch(/navigator\.serviceWorker\.register\(/);
  });

  it("register only when the page has finished loading, from the script the App serves", () => {
    expect(REGISTER_SCRIPT).toContain('window.addEventListener("load"');
    expect(REGISTER_SCRIPT).toContain('"serviceWorker" in navigator');
  });

  it("register only on a secure connection in the file that takes the choice", () => {
    expect(text("apps/web/src/data-status/registerOffline.ts")).toContain("isSecureContext");
  });

  it("build a worker with the install, activate and fetch handlers the row names", () => {
    const script = buildServiceWorker(DEFAULT_SW_CONFIG);
    for (const event of ["install", "activate", "fetch"]) expect(script, event).toContain(`self.addEventListener("${event}"`);
    expect(script).toContain("caches.delete");
    expect(script).toContain("setTimeout");
  });

  it("build a worker with no push, sync or message handler, which the rows do not name", () => {
    const script = buildServiceWorker(DEFAULT_SW_CONFIG);
    for (const event of ["push", "sync", "periodicsync", "message", "notificationclick"]) expect(script, event).not.toContain(`addEventListener("${event}"`);
  });
});

describe("watchers and listeners are stopped", () => {
  it("disconnects every page watcher in the file that makes it", () => {
    for (const r of rowsFor(AUTO_REGISTER, "observer")) expect(text(r.path), r.path).toContain(".disconnect()");
  });

  it("removes every online, offline and storage listener in the file that adds it", () => {
    for (const r of [...rowsFor(AUTO_REGISTER, "network"), ...rowsFor(AUTO_REGISTER, "storage-event")]) {
      const t = text(r.path);
      for (const name of ["online", "offline", "storage"]) {
        if (new RegExp(`addEventListener\\(\\s*["'\`]${name}["'\`]`).test(t)) expect(t, `${r.path} ${name}`).toMatch(new RegExp(`removeEventListener\\(\\s*["'\`]${name}["'\`]`));
      }
    }
  });

  it("has as many removals as additions for the network events", () => {
    for (const r of rowsFor(AUTO_REGISTER, "network")) {
      const t = text(r.path);
      expect((t.match(/addEventListener\(/g) ?? []).length, r.path).toBeLessThanOrEqual((t.match(/removeEventListener\(/g) ?? []).length);
    }
  });
});

describe("timers and frames", () => {
  it("has no repeating timer anywhere in the source", () => {
    for (const f of files) if (isScannedSource(f.path)) expect(text(f.path), f.path).not.toMatch(/(?<![\w$.])(?:(?:window|globalThis|self)\.)?setInterval\s*\(/);
  });

  it("clears the timer in the files that set one to end a wait, or makes it a promise that ends by itself", () => {
    expect(text("apps/web/src/states/resilience.ts")).toContain("clearTimeout");
    expect(text("apps/web/src/data-status/offline.ts")).toMatch(/setTimeout\(\(\) => r\('timeout'\)/);
    expect(buildServiceWorker(DEFAULT_SW_CONFIG)).toContain("clearTimeout(timer)");
  });

  it("only puts focus back in a frame callback", () => {
    for (const r of rowsFor(AUTO_REGISTER, "frame")) {
      const t = text(r.path);
      const calls = t.match(/requestAnimationFrame\([^;]*;/g) ?? [];
      expect(calls.length, r.path).toBe(r.uses);
      for (const call of calls) expect(call, r.path).toContain(".focus()");
    }
  });

  it("has the places the register lists for frames, and no others", () => {
    const frames = scanAuto(files).filter((f) => f.kind === "frame");
    expect(frames.map((f) => f.path)).toEqual(rowsFor(AUTO_REGISTER, "frame").map((r) => r.path));
  });
});

describe("what the page watchers do", () => {
  it("only mark language or move focus, and never read or send what they watch", () => {
    for (const r of rowsFor(AUTO_REGISTER, "observer")) {
      const t = text(r.path);
      expect(t, r.path).not.toMatch(/\b(?:fetch|sendBeacon|XMLHttpRequest|localStorage|sessionStorage)\b/);
    }
  });
});

describe("the checks above have teeth", () => {
  const registers = /\.(?:register|unregister|getRegistrations?|update)\s*\(/;
  it("catches a registration in a file that is meant to only ask", () => {
    for (const code of ["navigator.serviceWorker.register('/sw.js')", "reg.unregister()", "navigator.serviceWorker.getRegistrations()", "reg.update()"]) expect(code).toMatch(registers);
    expect("navigator.serviceWorker.controller ? 'active' : 'inactive'").not.toMatch(registers);
  });
  it("catches a repeating timer written in any of the usual ways", () => {
    const re = /(?<![\w$.])(?:(?:window|globalThis|self)\.)?setInterval\s*\(/;
    for (const code of ["setInterval(a, 1)", "window.setInterval(a, 1)", "self.setInterval (a, 1)"]) expect(code).toMatch(re);
    expect("clearInterval(a)").not.toMatch(re);
  });
  it("catches a worker with a handler the rows do not name", () => {
    const script = `${buildServiceWorker(DEFAULT_SW_CONFIG)}\nself.addEventListener("push", function () {});`;
    expect(script).toContain('addEventListener("push"');
  });
});
