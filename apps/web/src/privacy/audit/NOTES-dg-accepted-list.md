# Diagnostics accepted list: what changed for #327

`dg.repo.audit.test.ts` failed on the head of #327 (85d7e96) because the scan reads `apps/web/src/privacy/audit/jsonc.ts`, which that PR adds, and finds two things in line 56 (`e instanceof Error ? e.message : String(e)`): one `dg-error-text` and one `dg-error-string`. Neither was on the accepted list, so the exact-match test, the "no differences" report and the row-count test (67 found, 65 listed) all failed together.

Fix: two rows in `dgRegister.ts` for `jsonc.ts`, one per code, with a reason that says what was read. The audit, its rules and the other rows are unchanged. The list now adds up to 67, the same as the scan.

What the reason does not claim: that every caller of `parseJsonc` passes a repository file. Only `tsModel.ts` was found importing it, and the reason says the other callers were not checked.

Anything added later under `apps/web/src` that reads an error's message, or turns one into text, needs its own row or the audit fails.
