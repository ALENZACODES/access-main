# P20L — current-main E2E evidence audit

Source baseline: ALENZACODES/access-main main `4bf626258eacb03f9bc89ac8d8ab73ed9594cba8`.

The superseded `chatgpt/p20-r10` branch was updated with a two-parent merge commit
`f4e2dd0ae320d80d603e5ba2852ea108974328fe`, using the current-main
file tree to drop the broken first-paint gate. The update was a normal
fast-forward ref update, with no force operation. At the moment of that merge, the branch had no file changes relative to main.
A separate subsequent commit (`9fe9477ea02b4a19724d02a371b7a26b93daa65e`)
added P20K files to that branch. This archive does not include or rely on them.

This archive is a separate, independent P20L test chunk for a clean checkout
of the stated main commit. It updates the already existing axe sweep to check
route uniqueness and required paths instead of a literal count. New Playwright
specifications are discovered automatically from `apps/web/e2e/`.

The Day 17 helper file is included unchanged because P20L imports it. Import
packages installed by the repository are not vendored into this archive.

Local checks completed: ZIP integrity; TypeScript transpilation for seven files;
strict standalone typecheck of the evidence contracts; four contract smoke
assertions. Full repository lint, typecheck and browser E2E were NOT run because
this environment has no local repository checkout or installed dependencies.
Do not treat these local checks as a green CI run.
