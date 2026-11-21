// Robustness audit for the on-its-own scanner and the offline-worker reader. Whatever text a source file holds,
// scanning it must not throw and must give kinds from the closed list at lines inside the file; a start written in a
// known way must be found, once, in the right kind; a comparison of a scan with a register built from it is clean; and
// the worker reader must never throw, whatever the browser's answers are.

import { describe, expect, it } from "vitest";
import { AUTO_KINDS, type AutoKind, type AutoRow } from "../panel/autoRegister";
import { checkWorkers, readWorkers, scopePath, workerFindingText, type WorkerHost, type WorkerRegistration } from "../panel/autoLive";
import { compareAuto, isCleanAuto, scanAuto, type FoundAuto } from "./autoScan";
import { genString, mutateText } from "./fuzz/gen";
import { assertProperty, assertPropertyAsync, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const SAMPLES = [
  "setTimeout(() => done(), 4000);",
  "window.addEventListener(\"online\", on);",
  "const observer = new MutationObserver(update);\nobserver.observe(root, { childList: true });",
  "requestAnimationFrame(() => ref.current?.focus());",
  "if (!(\"serviceWorker\" in navigator)) return;\nnavigator.serviceWorker.register(url);",
  "self.addEventListener(\"fetch\", function (event) {});",
  "new BroadcastChannel(\"x\");",
];

const WRITTEN: ReadonlyArray<[string, AutoKind]> = [
  ["setTimeout(a, 1);", "timer"],
  ["window.setInterval(a, 1);", "timer"],
  ["requestAnimationFrame(a);", "frame"],
  ["new ResizeObserver(a);", "observer"],
  ['window.addEventListener("offline", a);', "network"],
  ["x.addEventListener('storage', a);", "storage-event"],
  ['document.addEventListener("visibilitychange", a);', "page-event"],
  ['new BroadcastChannel("c");', "channel"],
  ['new Worker("w.js");', "worker"],
  ["nav.serviceWorker.ready;", "service-worker"],
];

/** Text that cannot make a start by itself: no brackets, quotes, braces or the words the scan looks for. */
function noise(rng: Rng): string {
  return genString(rng, 40)
    .replace(/[<>`"'{}()]/g, " ")
    .replace(/setTimeout|setInterval|Observer|Worker|Channel|serviceWorker|addEventListener|requestAnimationFrame|requestIdleCallback/g, " ");
}

describe("scanning any text", () => {
  it("never throws, and gives kinds from the list at lines inside the file, in order within a kind", () => {
    assertProperty({
      name: "scanAuto on mutated source",
      runs: 400,
      gen: (rng) => (rng.bool(0.3) ? genString(rng, 200) : mutateText(rng, mutateText(rng, rng.pick(SAMPLES)))),
      shrink: shrinkString,
      prop: (text) => {
        const found = scanAuto([{ path: "apps/web/src/map/x.tsx", text }]);
        const lines = text.split("\n").length;
        for (const f of found) {
          expect(AUTO_KINDS).toContain(f.kind);
          expect(f.lines.length).toBeGreaterThan(0);
          for (const line of f.lines) {
            expect(line).toBeGreaterThanOrEqual(1);
            expect(line).toBeLessThanOrEqual(lines);
          }
          expect(f.lines).toEqual([...f.lines].sort((a, b) => a - b));
        }
      },
    });
  });

  it("gives each kind at most once per file", () => {
    assertProperty({
      name: "one entry per kind",
      runs: 200,
      gen: (rng) => Array.from({ length: rng.int(0, 10) }, () => rng.pick(WRITTEN)[0]).join("\n"),
      show: (t) => t,
      prop: (text) => {
        const kinds = scanAuto([{ path: "apps/web/src/map/x.tsx", text }]).map((f) => f.kind);
        expect(new Set(kinds).size).toBe(kinds.length);
      },
    });
  });
});

describe("starts written in a known way", () => {
  it("are all found, once each, in the right kind, among noise", () => {
    assertProperty({
      name: "embedded starts",
      runs: 300,
      gen: (rng) => {
        const wanted = new Map<AutoKind, number>();
        let text = noise(rng);
        for (let i = 0, n = rng.int(0, 10); i < n; i += 1) {
          const [code, kind] = rng.pick(WRITTEN);
          text += `\n${code}\n${noise(rng)}`;
          wanted.set(kind, (wanted.get(kind) ?? 0) + 1);
        }
        return { text, wanted: [...wanted.entries()] };
      },
      show: (x) => JSON.stringify(x),
      prop: ({ text, wanted }) => {
        const got = scanAuto([{ path: "apps/web/src/input/x.tsx", text }]).map((f) => [f.kind, f.lines.length] as const);
        expect([...got].sort()).toEqual([...wanted].sort());
      },
    });
  });

  it("are not found when the line is a comment", () => {
    assertProperty({
      name: "comment lines",
      runs: 100,
      gen: (rng) => `${rng.pick(["// ", "  * ", "/* "])}${rng.pick(WRITTEN)[0]}`,
      prop: (text) => expect(scanAuto([{ path: "apps/web/src/input/x.tsx", text }])).toEqual([]),
    });
  });

  it("are not found in tests, type files, the audit folder or narrow/", () => {
    assertProperty({
      name: "skipped files",
      runs: 60,
      gen: (rng) => rng.pick(["apps/web/src/input/a.test.tsx", "apps/web/src/input/a.test.ts", "apps/web/src/privacy/audit/a.ts", "apps/web/src/input/a.d.ts", "apps/web/src/narrow/a.ts"]),
      prop: (path) => expect(scanAuto([{ path, text: "setTimeout(a, 1);" }])).toEqual([]),
    });
  });
});

describe("comparing a scan with a register built from it", () => {
  it("is always clean, and a change of one count or one row is never clean", () => {
    assertProperty({
      name: "round trip",
      runs: 200,
      gen: (rng) =>
        Array.from({ length: rng.int(1, 5) }, (_, i) => ({
          path: `apps/web/src/${rng.pick(["map", "input", "offline", "privacy"])}/f${i}.tsx`,
          text: Array.from({ length: rng.int(0, 6) }, () => rng.pick(WRITTEN)[0]).join("\n"),
        })),
      show: (files) => JSON.stringify(files),
      prop: (files) => {
        const found = scanAuto(files);
        const rows: AutoRow[] = found.map((f: FoundAuto) => ({ kind: f.kind, path: f.path, uses: f.lines.length, effect: "runs", when: { en: "a", fr: "a" }, does: { en: "a", fr: "a" }, source: "s", recordedOn: "2026-11-21" }));
        expect(isCleanAuto(compareAuto(found, rows))).toBe(true);
        if (rows.length > 0) {
          expect(isCleanAuto(compareAuto(found, rows.map((r, i) => (i === 0 ? { ...r, uses: r.uses + 1 } : r))))).toBe(false);
          expect(isCleanAuto(compareAuto(found, rows.slice(1)))).toBe(false);
          expect(isCleanAuto(compareAuto(found.slice(1), rows))).toBe(false);
        }
      },
    });
  });
});

describe("reading a browser's answers", () => {
  const ANSWERS: readonly unknown[] = [undefined, null, true, false, 0, "x", [], {}, [{ scope: "/a/", state: "active" }], [{ nonsense: 1 }]];

  it("never throws, whatever a host answers, throws or rejects", async () => {
    await assertPropertyAsync({
      name: "readWorkers",
      runs: 300,
      gen: (rng) => ({ s: rng.int(0, 2), c: rng.int(0, 2), r: rng.int(0, 3), v: rng.int(0, 9) }),
      show: (x) => JSON.stringify(x),
      prop: async ({ s, c, r, v }) => {
        const answer = ANSWERS[v % ANSWERS.length];
        const host: WorkerHost = {
          supported: () => {
            if (s === 0) throw new Error("x");
            return s === 1;
          },
          controlled: () => {
            if (c === 0) throw new Error("x");
            return c === 1 ? (answer as boolean | null) : null;
          },
          registrations: async () => {
            if (r === 0) throw new Error("x");
            if (r === 1) return Promise.reject(new Error("y"));
            return r === 2 ? ([] as WorkerRegistration[]) : (Array.isArray(answer) ? (answer as WorkerRegistration[]) : []);
          },
        };
        const reading = await readWorkers(host);
        expect(typeof reading.supported).toBe("boolean");
        for (const f of checkWorkers(reading, [])) expect(workerFindingText("en", f).length).toBeGreaterThan(5);
      },
    });
  });

  it("never gives a path with a query, a fragment or a login for any address", () => {
    assertProperty({
      name: "scopePath",
      runs: 300,
      gen: (rng) => `https://${rng.pick(["", "u:p@"])}example.org${rng.pick(["", ":8080"])}/${genString(rng, 10).replace(/[?#]/g, "")}${rng.pick(["", "?q=1", "#h"])}`,
      shrink: shrinkString,
      prop: (address) => {
        const p = scopePath(address);
        if (p !== null) {
          expect(p.startsWith("/")).toBe(true);
          expect(p).not.toMatch(/[?#@]/);
        }
      },
    });
  });
});
