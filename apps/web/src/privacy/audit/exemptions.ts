// Files that must contain a forbidden word on purpose, because they are the
// rule itself or tests that prove the rule fires. Each needs a reason and date.

import type { Exemption } from "./repoAudit";

const WHY_NS = "A Dublin Core namespace identifier. It names a vocabulary term and is never fetched";
const WHY_RULE = "The file is the copy lint itself: its list of banned terms has to name them";
const WHY_HTTP = "Test input that proves a plain http address is rejected, so it has to contain one";
const WHY_OTHER_LANE = "Existing wording in another lane's file, left as it is on main. That lane owns the change; this lane does not edit it";
const WHY_TEST = "Test fixture that proves the rule fires, so it has to contain the banned terms";

export const EXEMPTIONS: readonly Exemption[] = [
  { path: "apps/web/src/hub/i18n.ts", rule: "claim-wording", reason: WHY_OTHER_LANE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/states/stateCopy.test.ts", rule: "forbidden-name", reason: WHY_TEST, recordedOn: "2026-11-15" },
  { path: "apps/web/src/states/copyLint.ts", rule: "forbidden-name", reason: WHY_RULE, recordedOn: "2026-11-16" },
  { path: "apps/web/src/states/copyLint.test.ts", rule: "forbidden-name", reason: WHY_TEST, recordedOn: "2026-11-16" },
  { path: "apps/web/src/states/provenance.test.ts", rule: "insecure-url", reason: WHY_HTTP, recordedOn: "2026-11-16" },
  { path: "apps/web/src/data-status/http.test.ts", rule: "insecure-url", reason: WHY_HTTP, recordedOn: "2026-11-16" },
  { path: "apps/web/src/data-status/offline.test.ts", rule: "insecure-url", reason: WHY_HTTP, recordedOn: "2026-11-16" },
  { path: "apps/web/src/data-status/catalogue.ts", rule: "insecure-url", reason: WHY_NS, recordedOn: "2026-11-16" },
];
