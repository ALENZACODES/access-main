// Robustness audit for the workflow readers and rules. Whatever text a file holds, reading it must not throw; a block
// written out and read back gives the same text; a step added gives exactly the finding for it; the rules give the same
// findings for the same file however it is written (comments, blank lines, quotes); and the register comparison is
// clean for a row built from the file it describes.

import { describe, expect, it } from "vitest";
import { compareAccepted, compareShapes } from "./wfCompare";
import { parseWorkflow } from "./wfModel";
import { permString, type WfAcceptRow, type WfRow } from "./wfRegister";
import { auditWorkflow, type WfCode } from "./wfRules";
import { get, items, keys, parseYaml, stripComment, text, texts } from "./wfYaml";
import { genJson, genString, mutateText, writeJson } from "./fuzz/gen";
import { assertProperty, shrinkString } from "./fuzz/property";
import type { Rng } from "./fuzz/rng";

const WORD = ["alpha", "beta-1", "gamma_2", "delta.x", "eps", "node-version", "runs-on"];
const word = (rng: Rng): string => rng.pick(WORD);

/** A step line pair that always has the same finding. */
const BAD_STEPS: Array<[WfCode, string]> = [
  ["swallowed-failure", "      - run: npm test || true\n"],
  ["pipe-to-shell", "      - run: curl https://github.com/x | sh\n"],
  ["unpinned-ref", "      - uses: actions/checkout@main\n"],
  ["owner-not-allowed", "      - uses: other/x@0123456789abcdef0123456789abcdef01234567\n"],
  ["continue-on-error", "      - run: a\n        continue-on-error: true\n"],
  ["secret-reference", "      - run: echo ${{ secrets.K }}\n"],
  ["injection", "      - run: echo ${{ github.head_ref }}\n"],
];

const HEAD = "on: pull_request\npermissions:\n  contents: read\njobs:\n  j:\n    runs-on: ubuntu-latest\n    timeout-minutes: 10\n    steps:\n";

describe("reading any text", () => {
  it("never throws for the reader, the model or the rules", () => {
    assertProperty({
      name: "workflow readers on any text",
      runs: 400,
      gen: (rng) => (rng.bool(0.5) ? genString(rng, 300) : mutateText(rng, HEAD + BAD_STEPS.map((b) => b[1]).join(""))),
      shrink: shrinkString,
      prop: (t) => {
        parseYaml(t);
        auditWorkflow(parseWorkflow("w.yml", t));
        stripComment(t);
      },
    });
  });

  it("never throws for JSON written as YAML, which is nearly a subset of it", () => {
    assertProperty({ name: "JSON as YAML", gen: (rng) => writeJson(rng, genJson(rng)), prop: (t) => void parseWorkflow("w.yml", t) });
  });

  it("gives lines inside the file for every problem and every finding", () => {
    assertProperty({
      name: "lines fit",
      gen: (rng) => mutateText(rng, HEAD + BAD_STEPS.map((b) => b[1]).join("")),
      shrink: shrinkString,
      prop: (t) => {
        const n = t.split("\n").length;
        const w = parseWorkflow("w.yml", t);
        for (const p of w.problems) expect(p.line).toBeGreaterThanOrEqual(0);
        for (const f of auditWorkflow(w)) {
          expect(f.line).toBeGreaterThanOrEqual(0);
          expect(f.line).toBeLessThanOrEqual(n + 1);
        }
      },
    });
  });
});

describe("what is written is what is read", () => {
  it("reads back a map of plain words, in order", () => {
    assertProperty({
      name: "map round trip",
      gen: (rng) => Array.from({ length: rng.int(1, 6) }, (_, i) => [`${word(rng)}${i}`, word(rng)] as const),
      prop: (pairs) => {
        const t = pairs.map(([k, v]) => `${k}: ${v}`).join("\n");
        const r = parseYaml(t);
        expect(r.problems).toEqual([]);
        expect(keys(r.root)).toEqual(pairs.map(([k]) => k));
        pairs.forEach(([k, v]) => expect(text(get(r.root, k))).toBe(v));
      },
    });
  });

  it("reads back a list of words, with any amount of indentation", () => {
    assertProperty({
      name: "list round trip",
      gen: (rng) => ({ list: Array.from({ length: rng.int(0, 6) }, () => word(rng)), indent: rng.int(0, 6) }),
      prop: ({ list, indent }) => {
        const pad = " ".repeat(indent);
        const t = `a:\n${list.map((x) => `${pad}- ${x}`).join("\n")}\n`;
        expect(texts(get(parseYaml(t).root, "a"))).toEqual(list);
      },
    });
  });

  it("reads back a block of text line for line, with a trailing break", () => {
    assertProperty({
      name: "block text round trip",
      gen: (rng) => Array.from({ length: rng.int(1, 6) }, (_, i) => `${" ".repeat(i === 0 ? 0 : rng.int(0, 4))}${genString(rng, 20).replace(/[\r\n\u2028\u2029\u0085]/g, " ").trim() || "x"}`),
      prop: (lines) => {
        const t = `run: |\n${lines.map((l) => `  ${l}`).join("\n")}\nnext: 1\n`;
        const r = parseYaml(t).root;
        expect(text(get(r, "run"))).toBe(`${lines.join("\n")}\n`);
        expect(text(get(r, "next"))).toBe("1");
      },
    });
  });

  it("reads back a quoted text, whatever it holds, when written as a JSON string", () => {
    assertProperty({
      name: "quoted text round trip",
      gen: (rng) => genString(rng, 30).replace(/[\u2028\u2029\u0085]/g, ""),
      shrink: shrinkString,
      prop: (s) => {
        const r = parseYaml(`a: ${JSON.stringify(s)}\n`);
        expect(r.problems).toEqual([]);
        expect(text(get(r.root, "a"))).toBe(s);
      },
    });
  });

  it("ignores a comment added to the end of any plain line", () => {
    assertProperty({
      name: "trailing comments",
      gen: (rng) => ({ k: word(rng), v: word(rng), c: genString(rng, 20).replace(/[\r\n\u2028\u2029\u0085]/g, " ") }),
      prop: ({ k, v, c }) => {
        const r = parseYaml(`${k}: ${v} # ${c}\n`).root;
        expect(text(get(r, k))).toBe(v);
      },
    });
  });

  it("keeps the number of items however the items of a list of maps are written", () => {
    assertProperty({
      name: "list of maps",
      gen: (rng) => rng.int(0, 8),
      prop: (n) => {
        const t = `steps:\n${Array.from({ length: n }, (_, i) => `  - name: s${i}\n    run: echo ${i}\n`).join("")}`;
        expect(items(get(parseYaml(t).root, "steps"))).toHaveLength(n);
      },
    });
  });
});

describe("the rules", () => {
  it("find exactly the one finding that a step of a known kind makes", () => {
    assertProperty({
      name: "one bad step, one finding",
      gen: (rng) => ({ bad: rng.int(0, BAD_STEPS.length - 1), before: rng.int(0, 3), after: rng.int(0, 3) }),
      prop: ({ bad, before, after }) => {
        const [code, step] = BAD_STEPS[bad] as [WfCode, string];
        const good = "      - run: npm ci\n";
        const t = HEAD + good.repeat(before) + step + good.repeat(after);
        const found = auditWorkflow(parseWorkflow("w.yml", t)).map((f) => f.code);
        expect(found).toEqual([code]);
      },
    });
  });

  it("find nothing in a file that has only good steps, however many", () => {
    assertProperty({
      name: "good steps",
      gen: (rng) => rng.int(0, 12),
      prop: (n) => expect(auditWorkflow(parseWorkflow("w.yml", HEAD + "      - uses: actions/checkout@v4\n      - run: npm ci\n".repeat(n)))).toEqual([]),
    });
  });

  it("find the same things when comments, blank lines and trailing blanks are added", () => {
    assertProperty({
      name: "noise does not change findings",
      gen: (rng) => ({ bad: rng.int(0, BAD_STEPS.length - 1), noise: rng.pick(["", "# a comment\n", "\n", "   # indented\n", "\n\n# x\n\n"]) }),
      prop: ({ bad, noise }) => {
        const body = HEAD + (BAD_STEPS[bad] as [WfCode, string])[1];
        const plain = auditWorkflow(parseWorkflow("w.yml", body)).map((f) => f.code);
        const noisy = auditWorkflow(parseWorkflow("w.yml", `${noise}${body.replace("steps:\n", `steps:\n${noise}`)}`)).map((f) => f.code);
        expect(noisy).toEqual(plain);
      },
    });
  });

  it("find a schedule wherever it is written among the triggers", () => {
    assertProperty({
      name: "schedule is found",
      gen: (rng) => ({ others: rng.int(0, 3), pos: rng.int(0, 3) }),
      prop: ({ others, pos }) => {
        const names = ["push", "pull_request", "workflow_dispatch"].slice(0, others);
        names.splice(Math.min(pos, names.length), 0, "schedule");
        const t = `on:\n${names.map((n) => (n === "schedule" ? "  schedule:\n    - cron: '0 0 * * *'\n" : `  ${n}:\n`)).join("")}${HEAD.slice(HEAD.indexOf("permissions"))}`;
        expect(auditWorkflow(parseWorkflow("w.yml", t)).map((f) => f.code)).toContain("schedule-trigger");
      },
    });
  });

  it("report findings in the order of their lines, and the same twice", () => {
    assertProperty({
      name: "order is stable",
      gen: (rng) => HEAD + Array.from({ length: rng.int(0, 6) }, () => (BAD_STEPS[rng.int(0, BAD_STEPS.length - 1)] as [WfCode, string])[1]).join(""),
      prop: (t) => {
        const w = parseWorkflow("w.yml", t);
        const f = auditWorkflow(w);
        expect(auditWorkflow(w)).toEqual(f);
        const lines = f.map((x) => x.line);
        expect(lines).toEqual([...lines].sort((a, b) => a - b));
      },
    });
  });
});

describe("the register comparison", () => {
  it("is clean for a row built from the file it describes, and for accepted rows built from its findings", () => {
    assertProperty({
      name: "row from file",
      gen: (rng) => ({ jobs: rng.int(1, 4), timeout: rng.bool(0.7), perms: rng.pick(["permissions:\n  contents: read\n", "permissions:\n  contents: read\n  pages: write\n", "permissions: {}\n", ""]), bad: rng.int(0, 3) }),
      prop: ({ jobs, timeout, perms, bad }) => {
        const body = Array.from({ length: jobs }, (_, i) => `  j${i}:\n    runs-on: x\n${timeout ? "    timeout-minutes: 5\n" : ""}    steps:\n      - run: a\n${bad > 0 && i === 0 ? "      - uses: actions/checkout@v4\n" : ""}`).join("");
        const w = parseWorkflow(".github/workflows/w.yml", `on: [push, pull_request]\n${perms}jobs:\n${body}`);
        const row: WfRow = { path: w.path, state: "active", triggers: [...w.triggers].reverse(), permissions: permString(w.permissions), jobs: [...w.jobs].reverse().map((j) => ({ id: j.id, timeout: j.timeoutMinutes })), note: "n." };
        const f = auditWorkflow(w);
        const counts = new Map<WfCode, number>();
        for (const x of f) counts.set(x.code, (counts.get(x.code) ?? 0) + 1);
        const accepted: WfAcceptRow[] = [...counts].map(([code, count]) => ({ path: w.path, code, count, reason: "r." }));
        expect(compareShapes([w], [row])).toEqual([]);
        expect(compareAccepted(f.filter((x) => accepted.some((a) => a.code === x.code)), accepted).filter((p) => p.code !== "unacceptable-finding")).toEqual([]);
      },
    });
  });

  it("finds a changed time limit, whichever job it is in", () => {
    assertProperty({
      name: "timeout change",
      gen: (rng) => ({ jobs: rng.int(1, 5), which: rng.int(0, 4) }),
      prop: ({ jobs, which }) => {
        const w = parseWorkflow(".github/workflows/w.yml", `on: push\njobs:\n${Array.from({ length: jobs }, (_, i) => `  j${i}:\n    timeout-minutes: ${i === which % jobs ? 99 : 5}\n    steps: []\n`).join("")}`);
        const row: WfRow = { path: w.path, state: "active", triggers: ["push"], permissions: "unset", jobs: w.jobs.map((j) => ({ id: j.id, timeout: 5 })), note: "n." };
        const p = compareShapes([w], [row]);
        expect(p).toHaveLength(1);
        expect(p[0]?.code).toBe("timeout-changed");
        expect(p[0]?.detail.startsWith(`j${which % jobs}:`)).toBe(true);
      },
    });
  });
});
