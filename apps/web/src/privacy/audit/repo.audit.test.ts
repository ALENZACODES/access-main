// CI audit: the repository rules, run over the real source tree. It fails on any
// finding that is not covered by a dated, reasoned entry in exemptions.ts.

import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { EXEMPTIONS } from "./exemptions";
import { auditFiles, formatFindings } from "./repoAudit";
import { loadFiles } from "./repoFiles";

// apps/web/src/privacy/audit -> repository root
const ROOT = fileURLToPath(new URL("../../../../../", import.meta.url));

describe("repository rules", () => {
  const files = loadFiles(ROOT, ["apps/web/src", ".github/workflows"]);

  it("finds the source tree, so the audit cannot pass by scanning nothing", () => {
    const paths = files.map((f) => f.path);
    expect(paths).toContain("apps/web/src/privacy/audit/repoAudit.ts");
    expect(paths).toContain("apps/web/src/privacy/panel/strings.ts");
  });

  it("has no findings outside the listed exemptions", () => {
    const findings = auditFiles(files, EXEMPTIONS);
    expect(findings, `\n${formatFindings(findings)}\n`).toEqual([]);
  });

  it("every exemption is still needed", () => {
    const stale = auditFiles(files, EXEMPTIONS).filter((f) => f.rule === "stale-exemption" || f.rule === "bad-exemption");
    expect(stale).toEqual([]);
  });
});
