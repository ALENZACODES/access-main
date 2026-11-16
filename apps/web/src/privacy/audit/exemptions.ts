// Files that must contain a forbidden word on purpose, because they are the
// rule itself or tests that prove the rule fires. Each needs a reason and date.

import type { Exemption } from "./repoAudit";

const WHY_HTTP = "Test input that proves a plain http address is rejected, so it has to contain one";
const WHY_NS = "A Dublin Core namespace identifier. It names a vocabulary term and is never fetched";

const WHY_OTHER_FIXTURE = "Test input or sample in another lane's checks that proves a banned host or a plain http address is rejected, so it has to contain one";

export const EXEMPTIONS: readonly Exemption[] = [
  { path: "apps/web/src/narrow/cli-panel.test.ts", rule: "insecure-url", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/cli-panel.test.ts", rule: "third-party-tiles", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/e2e-site.test.ts", rule: "third-party-tiles", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/hostlint.test.ts", rule: "insecure-url", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/hostlint.test.ts", rule: "third-party-tiles", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/hostlint.test.ts", rule: "tracker-host", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/i18n-offline.test.ts", rule: "insecure-url", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/provenance.test.ts", rule: "insecure-url", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/report-run.test.ts", rule: "insecure-url", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/report-run.test.ts", rule: "third-party-tiles", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/samples.ts", rule: "insecure-url", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/samples.ts", rule: "third-party-tiles", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/samples.ts", rule: "tracker-host", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/narrow/structure.test.ts", rule: "insecure-url", reason: WHY_OTHER_FIXTURE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/data-status/fuzzKit.ts", rule: "insecure-url", reason: WHY_HTTP, recordedOn: "2026-11-16" },
  { path: "apps/web/src/states/dataAudit.test.ts", rule: "insecure-url", reason: WHY_HTTP, recordedOn: "2026-11-16" },
  { path: "apps/web/src/states/provenance.test.ts", rule: "insecure-url", reason: WHY_HTTP, recordedOn: "2026-11-16" },
  { path: "apps/web/src/data-status/http.test.ts", rule: "insecure-url", reason: WHY_HTTP, recordedOn: "2026-11-16" },
  { path: "apps/web/src/data-status/offline.test.ts", rule: "insecure-url", reason: WHY_HTTP, recordedOn: "2026-11-16" },
  { path: "apps/web/src/data-status/catalogue.ts", rule: "insecure-url", reason: WHY_NS, recordedOn: "2026-11-16" },
];
