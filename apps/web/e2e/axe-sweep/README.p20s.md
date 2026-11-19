# P20S: language metadata in the embedded auditors route

The embedded auditors tool renders two English-only paragraphs when the shell
is in French: an instruction about the coordinator role and a dated-observation
policy. These phrases are marked `lang="en"` without changing their text or
assigning any accessibility status. Other paragraphs stay untouched.

`AuditorsPage` mounts `AuditorsEnglishBoundary`, which adds annotations in a
layout effect (before paint) and after the embedded tool changes its displayed
paragraphs. It observes child/text mutations, not its own language attributes.

Playwright discovers `auditors-language-boundary.spec.ts` through the existing
E2E runner. The test checks both viewport sizes with a controlled DOM fixture
and the live French route. A separate unit test checks the exact templates,
including duration substitution and negative cases. No separate workflow or
route entry is needed.

Run `npm test` for the Vitest contracts, then `npm run test:e2e` for the live
browser checks. The full semantic-integrity sweep remains authoritative; this
change adds no allowlist or exemption to it.
