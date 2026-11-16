import { expect, test } from "@playwright/test";
import { auditRoutes } from "../src/narrow/page.ts";

test("audits shell routes at 320px for reflow and 44px targets", async ({ page, baseURL }) => {
  expect(baseURL).toBeTruthy();
  const reports = await auditRoutes(page, baseURL!, ["/", "/about", "/help", "/data-status"]);
  expect(reports.length).toBe(4);
  for (const report of reports) {
    expect(report.viewportWidth).toBe(320);
    expect(report.route.length).toBeGreaterThan(0);
  }
  // Findings are reported for review. This check confirms the audit ran; it
  // does not claim conformance.
  test.info().annotations.push({
    type: "narrow-audit",
    description: reports
      .map((report) => `${report.route}: ${report.findings.length} finding(s)`)
      .join("; "),
  });
});
