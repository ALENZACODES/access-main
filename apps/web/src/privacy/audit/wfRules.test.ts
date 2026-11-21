import { describe, expect, it } from "vitest";
import { parseWorkflow } from "./wfModel";
import { WF_CODES, WF_POLICY, auditWorkflow, formatWfFinding, type WfCode, type WfFinding, type WfPolicy } from "./wfRules";

const PERMS = "permissions:\n  contents: read\n";

/** A job with a timeout, in a workflow with read-only permissions, around the given step lines. */
function wf(steps: string, head = `on: pull_request\n${PERMS}`, jobExtra = "    timeout-minutes: 10\n"): string {
  return `${head}jobs:\n  j:\n    runs-on: ubuntu-latest\n${jobExtra}    steps:\n${steps}`;
}

const audit = (src: string, policy?: WfPolicy): WfFinding[] => auditWorkflow(parseWorkflow("w.yml", src), policy);
const codes = (src: string, policy?: WfPolicy): WfCode[] => audit(src, policy).map((f) => f.code);

describe("a clean workflow", () => {
  it("has no finding", () => {
    expect(audit(wf("      - uses: actions/checkout@v4\n      - run: npm ci\n"))).toEqual([]);
  });
});

describe("yaml-problem", () => {
  it("is reported for every problem the reader found, with its line", () => {
    const f = audit(wf("      - run: a\n") + "x: &anchor 1\n");
    expect(f.filter((x) => x.code === "yaml-problem").map((x) => x.detail)).toEqual(["an anchor is not read"]);
  });
});

describe("triggers", () => {
  it("finds a schedule, as a map key and in the list form", () => {
    expect(codes(wf("      - run: a\n", `on:\n  schedule:\n    - cron: '0 0 * * *'\n${PERMS}`))).toEqual(["schedule-trigger"]);
    expect(codes(wf("      - run: a\n", `on: [push, schedule]\n${PERMS}`))).toEqual(["schedule-trigger"]);
  });

  it("gives the line of the schedule key", () => {
    const f = audit(wf("      - run: a\n", `on:\n  push:\n  schedule:\n    - cron: x\n${PERMS}`));
    expect(f[0]).toMatchObject({ code: "schedule-trigger", line: 3 });
  });

  it("finds a trigger that runs with more rights than the change", () => {
    for (const t of ["pull_request_target", "workflow_run", "issue_comment"]) expect(codes(wf("      - run: a\n", `on:\n  ${t}:\n${PERMS}`)), t).toEqual(["risky-trigger"]);
  });

  it("does not mind an ordinary trigger", () => {
    for (const t of ["push", "pull_request", "workflow_dispatch", "release"]) expect(codes(wf("      - run: a\n", `on: ${t}\n${PERMS}`)), t).toEqual([]);
  });

  it("uses the policy's list of risky triggers", () => {
    const p: WfPolicy = { ...WF_POLICY, riskyTriggers: ["push"] };
    expect(codes(wf("      - run: a\n", `on: push\n${PERMS}`), p)).toEqual(["risky-trigger"]);
  });
});

describe("permissions", () => {
  it("finds a job when neither the workflow nor the job sets permissions", () => {
    const f = audit(wf("      - run: a\n", "on: push\n"));
    expect(f.map((x) => x.code)).toEqual(["no-permissions"]);
    expect(f[0]).toMatchObject({ job: "j", line: 3 });
  });

  it("is satisfied by workflow permissions or by the job's own", () => {
    expect(codes(wf("      - run: a\n", "on: push\n", "    timeout-minutes: 5\n    permissions:\n      contents: read\n"))).toEqual([]);
    expect(codes(wf("      - run: a\n", `on: push\n${PERMS}`))).toEqual([]);
  });

  it("counts an empty permissions block as set", () => {
    expect(codes(wf("      - run: a\n", "on: push\npermissions: {}\n"))).toEqual([]);
  });

  it("finds each write scope, at the workflow or at a job", () => {
    const f = audit(wf("      - run: a\n", "on: push\npermissions:\n  contents: read\n  pages: write\n  id-token: write\n"));
    expect(f.map((x) => x.detail).sort()).toEqual(["workflow: id-token: write", "workflow: pages: write"]);
    expect(f.filter((x) => x.code === "write-permission")).toHaveLength(2);
    const j = audit(wf("      - run: a\n", `on: push\n${PERMS}`, "    timeout-minutes: 5\n    permissions:\n      packages: write\n"));
    expect(j.map((x) => `${x.code} ${x.detail}`)).toEqual(["write-permission job j: packages: write"]);
  });

  it("does not mind read and none levels", () => {
    expect(codes(wf("      - run: a\n", "on: push\npermissions:\n  contents: read\n  issues: none\n"))).toEqual([]);
  });

  it("finds read-all and write-all", () => {
    expect(audit(wf("      - run: a\n", "on: push\npermissions: write-all\n")).map((x) => x.detail)).toEqual(["workflow: write-all"]);
    expect(codes(wf("      - run: a\n", "on: push\npermissions: read-all\n"))).toEqual(["broad-permissions"]);
  });

  it("finds permissions that are not a word or a list of scopes", () => {
    expect(codes(wf("      - run: a\n", "on: push\npermissions: everything\n"))).toEqual(["broad-permissions"]);
  });
});

describe("actions", () => {
  const uses = (u: string, extra = ""): WfCode[] => codes(wf(`      - uses: ${u}\n${extra}`));

  it("lets a first-party action be pinned by a version tag", () => {
    expect(uses("actions/checkout@v4")).toEqual([]);
    expect(uses("actions/cache/restore@v4.1.0")).toEqual([]);
  });

  it("lets an action in the repository's own folder through", () => {
    expect(uses("./.github/actions/local")).toEqual([]);
  });

  it("finds an action with no ref, or with a ref that moves", () => {
    expect(uses("actions/checkout")).toEqual(["unpinned-ref"]);
    for (const ref of ["main", "master", "latest", "dev", "Main", "HEAD", "next"]) expect(uses(`actions/checkout@${ref}`), ref).toEqual(["unpinned-ref"]);
  });

  it("finds an action from an owner that is not allowed, and asks that it be pinned to a hash", () => {
    expect(uses("someone/tool@v1")).toEqual(["mutable-ref", "owner-not-allowed"]);
    expect(uses("someone/tool@0123456789abcdef0123456789abcdef01234567")).toEqual(["owner-not-allowed"]);
  });

  it("lets an allowed owner that is not first-party through when pinned to a hash, and not when pinned to a tag", () => {
    expect(uses("ALENZACODES/tool@0123456789abcdef0123456789abcdef01234567")).toEqual([]);
    expect(uses("ALENZACODES/tool@v1")).toEqual(["mutable-ref"]);
  });

  it("finds a docker action and an action reference that cannot be read", () => {
    expect(uses("docker://alpine:3")).toEqual(["docker-action"]);
    expect(uses("not-an-action")).toEqual(["invalid-uses"]);
  });

  it("finds a retry action by its name", () => {
    const f = audit(wf("      - uses: nick-fields/retry@v3\n"));
    expect(f.map((x) => x.code)).toEqual(["mutable-ref", "owner-not-allowed", "retry"]);
  });

  it("reads a job that calls another workflow, and applies the same rules to it", () => {
    const src = "on: push\npermissions:\n  contents: read\njobs:\n  call:\n    uses: someone/flows/.github/workflows/x.yml@main\n";
    expect(codes(src)).toEqual(["owner-not-allowed", "unpinned-ref"]);
  });

  it("does not ask a job that calls a workflow for a timeout", () => {
    const src = "on: push\npermissions:\n  contents: read\njobs:\n  call:\n    uses: ./.github/workflows/x.yml\n";
    expect(codes(src)).toEqual([]);
  });

  it("uses the policy's lists", () => {
    const p: WfPolicy = { ...WF_POLICY, allowedOwners: ["someone"], firstPartyOwners: ["someone"] };
    expect(codes(wf("      - uses: someone/tool@v1\n"), p)).toEqual([]);
    expect(codes(wf("      - uses: actions/checkout@v4\n"), p)).toEqual(["mutable-ref", "owner-not-allowed"]);
  });

  it("gives the line of the step that uses the action", () => {
    const f = audit(wf("      - run: a\n      - uses: actions/checkout@main\n"));
    expect(f[0]).toMatchObject({ code: "unpinned-ref", line: 10, job: "j" });
  });
});

describe("failing steps", () => {
  const run = (cmd: string): WfCode[] => codes(wf(`      - run: ${cmd}\n`));

  it("finds continue-on-error at a step and at a job, unless it is false", () => {
    expect(codes(wf("      - run: a\n        continue-on-error: true\n"))).toEqual(["continue-on-error"]);
    expect(codes(wf("      - run: a\n        continue-on-error: ${{ matrix.x }}\n"))).toEqual(["continue-on-error"]);
    expect(codes(wf("      - run: a\n        continue-on-error: false\n"))).toEqual([]);
    expect(codes(wf("      - run: a\n", `on: push\n${PERMS}`, "    timeout-minutes: 5\n    continue-on-error: true\n"))).toEqual(["continue-on-error"]);
  });

  it("finds a command whose failure is swallowed", () => {
    expect(run("npm test || true")).toEqual(["swallowed-failure"]);
    expect(run("npm test || :")).toEqual(["swallowed-failure"]);
    expect(run("npm test || exit 0")).toEqual(["swallowed-failure"]);
    expect(run("set +e")).toEqual(["swallowed-failure"]);
    expect(run("npm test; true")).toEqual(["swallowed-failure"]);
  });

  it("does not take set -e, || exit 1, or a word that starts with true for a swallowed failure", () => {
    expect(run("set -e")).toEqual([]);
    expect(run("npm test || exit 1")).toEqual([]);
    expect(run("npm test || trueish")).toEqual([]);
  });

  it("finds a swallowed failure on the right line of a block", () => {
    const f = audit(wf("      - run: |\n          echo a\n          npm test || true\n"));
    expect(f[0]).toMatchObject({ code: "swallowed-failure", line: 11 });
  });
});

describe("timeouts", () => {
  it("finds a job with no timeout, and not one that has it", () => {
    expect(codes(wf("      - run: a\n", `on: push\n${PERMS}`, ""))).toEqual(["no-timeout"]);
    expect(codes(wf("      - run: a\n"))).toEqual([]);
  });

  it("finds a timeout that is not a number as none", () => {
    expect(codes(wf("      - run: a\n", `on: push\n${PERMS}`, "    timeout-minutes: ${{ vars.T }}\n"))).toEqual(["no-timeout"]);
  });
});

describe("run steps", () => {
  const run = (cmd: string): WfCode[] => codes(wf(`      - run: ${cmd}\n`));

  it("finds a download piped to a shell", () => {
    expect(run("curl -fsSL https://github.com/x/install.sh | sh")).toEqual(["pipe-to-shell"]);
    expect(run("wget -qO- https://github.com/x | sudo bash")).toEqual(["pipe-to-shell"]);
    expect(run("curl https://github.com/x | zsh")).toEqual(["pipe-to-shell"]);
  });

  it("does not take a download written to a file, or a pipe to grep, for a pipe to a shell", () => {
    expect(run("curl -o f https://github.com/x")).toEqual([]);
    expect(run("curl https://github.com/x | grep a")).toEqual([]);
    expect(run("curl https://github.com/x | shasum")).toEqual([]);
  });

  it("finds a global install with no version", () => {
    expect(run("npm install -g npm")).toEqual(["unpinned-global-install"]);
    expect(run("npm i --global typescript")).toEqual(["unpinned-global-install"]);
    expect(run("npm install typescript -g")).toEqual(["unpinned-global-install"]);
  });

  it("does not mind a pinned global install, a scoped one, or a local install", () => {
    expect(run("npm install -g npm@11.6.2")).toEqual([]);
    expect(run("npm install -g @scope/pkg@1.2.3")).toEqual([]);
    expect(run("npm install")).toEqual([]);
    expect(run("npm ci")).toEqual([]);
    expect(run("npm install left-pad")).toEqual([]);
  });

  it("names the unpinned package", () => {
    expect(audit(wf("      - run: npm i -g a@1 b\n")).map((f) => f.detail)).toEqual(["b"]);
  });

  it("finds an address on a host that is not allowed, and not the allowed ones or their sub-domains", () => {
    expect(audit(wf("      - run: curl https://example.com/x\n")).map((f) => `${f.code} ${f.detail}`)).toEqual(["host-not-allowed example.com"]);
    expect(run("curl https://github.com/x")).toEqual([]);
    expect(run("curl https://api.github.com/x")).toEqual([]);
    expect(run("curl https://registry.npmjs.org/x")).toEqual([]);
    expect(run("curl https://objects.github.com/x")).toEqual([]);
    expect(run("curl https://evilgithub.com/x")).toEqual(["host-not-allowed"]);
  });

  it("does not read a host that is made from an expression or a variable", () => {
    expect(run("curl https://$HOST/x")).toEqual([]);
    expect(run("curl https://${{ vars.H }}/x")).toEqual([]);
  });

  it("finds a plain http address too", () => {
    expect(audit(wf(`      - run: curl ${"http"}://example.com/x\n`)).map((f) => f.code)).toEqual(["host-not-allowed"]);
  });
});

describe("injection", () => {
  it("finds an event field or a branch name written into a command", () => {
    for (const e of ["github.event.pull_request.title", "github.event.issue.body", "github.head_ref", "github.ref_name", "inputs.name"]) {
      expect(codes(wf(`      - run: echo "\${{ ${e} }}"\n`)), e).toEqual(["injection"]);
    }
  });

  it("does not mind an expression that is not untrusted, or an event field passed through env", () => {
    expect(codes(wf('      - run: echo "${{ matrix.shard }}"\n'))).toEqual([]);
    expect(codes(wf('      - run: echo "${{ steps.maps.outputs.sha }}"\n'))).toEqual([]);
    expect(codes(wf('      - run: echo "$TITLE"\n        env:\n          TITLE: ${{ github.event.pull_request.title }}\n'))).toEqual([]);
  });

  it("does not mind an event field in a with: value", () => {
    expect(codes(wf("      - uses: actions/checkout@v4\n        with:\n          ref: ${{ github.head_ref }}\n"))).toEqual([]);
  });

  it("finds it in a block run, on the step's line", () => {
    const f = audit(wf('      - run: |\n          echo "${{ github.head_ref }}"\n'));
    expect(f).toEqual([{ code: "injection", path: "w.yml", line: 9, job: "j", detail: "github.head_ref" }]);
  });
});

describe("secrets", () => {
  it("finds a secret other than the token, in a run, a with: value, a step env and the workflow env", () => {
    expect(codes(wf('      - run: echo "${{ secrets.NPM_TOKEN }}"\n'))).toContain("secret-reference");
    expect(codes(wf("      - uses: actions/checkout@v4\n        with:\n          token: ${{ secrets.PAT }}\n"))).toEqual(["secret-reference"]);
    expect(codes(wf("      - run: a\n        env:\n          K: ${{ secrets.K }}\n"))).toEqual(["secret-reference"]);
    expect(codes(wf("      - run: a\n", `on: push\n${PERMS}env:\n  K: \${{ secrets.K }}\n`))).toEqual(["secret-reference"]);
  });

  it("names the secret", () => {
    expect(audit(wf("      - run: a\n        env:\n          K: ${{ secrets.MY_KEY }}\n")).map((f) => f.detail)).toEqual(["MY_KEY"]);
  });

  it("lets GITHUB_TOKEN through", () => {
    expect(codes(wf("      - run: a\n        env:\n          T: ${{ secrets.GITHUB_TOKEN }}\n"))).toEqual([]);
  });

  it("finds all secrets passed on", () => {
    expect(audit(wf("      - uses: actions/checkout@v4\n        with:\n          x: ${{ toJSON(secrets) }}\n")).map((f) => f.detail)).toEqual(["all secrets"]);
    expect(audit(wf("      - run: a\n        env:\n          x: ${{ secrets['NAME'] }}\n")).map((f) => f.detail)).toContain("all secrets");
  });

  it("uses the policy's list of secret names", () => {
    const p: WfPolicy = { ...WF_POLICY, allowedSecrets: ["K"] };
    expect(codes(wf("      - run: a\n        env:\n          K: ${{ secrets.K }}\n"), p)).toEqual([]);
  });
});

describe("order and format", () => {
  it("gives findings in the order of line, then code", () => {
    const f = audit(wf("      - run: curl https://example.com | sh\n      - uses: actions/checkout@main\n", "on:\n  schedule:\n    - cron: x\n"));
    const lines = f.map((x) => x.line);
    expect(lines).toEqual([...lines].sort((a, b) => a - b));
  });

  it("writes a finding on one line", () => {
    expect(formatWfFinding({ code: "no-timeout", path: "a.yml", line: 7, detail: "job j has no timeout-minutes" })).toBe("no-timeout a.yml:7 job j has no timeout-minutes");
  });

  it("lists every code once, and the real policy has no code of its own that the list lacks", () => {
    expect(new Set(WF_CODES).size).toBe(WF_CODES.length);
    for (const f of audit(wf("      - run: curl https://example.com | sh || true\n", "on: schedule\n"))) expect(WF_CODES).toContain(f.code);
  });

  it("gives nothing for a file with no jobs", () => {
    expect(audit("on: push\n")).toEqual([]);
    expect(audit("")).toEqual([]);
  });
});
