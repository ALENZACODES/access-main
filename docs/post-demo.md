# Post-demo checks (master plan Days 25 and 28)

Two checks for demo day and the regression audit after it. They read the build and the test results. They do not create counts, journeys, or answers.

## Day 25: build unchanged during the session

Take a snapshot of the built files before the session and another after:

```bash
npm run build
npm run postdemo -- snapshot apps/web/dist --build <id> --out before.json
# ... session ...
npm run postdemo -- snapshot apps/web/dist --build <id> --out after.json
npm run postdemo -- compare before.json after.json
```

`compare` passes when nothing changed. When something changed, it passes only with a change record (`--record change.json`, holding `failure`, `action`, and `fallbackUsed: true`). Otherwise it exits with 1.

## Day 28: regression audit

`npm run test:e2e` writes `apps/web/test-results/regression-run.json` and `.md`. The table is check by check, and every row carries the build identifier. The format is `regression-run-1.0.0`, the same format as access-help `packages/followup` and access-tools.

Set `VITE_BUILD_ID` to the build under audit. With the default `e2e`, the table says it is not gate evidence:

```bash
VITE_BUILD_ID=<id> npm run test:e2e
```

Checks the shell cannot run are listed as not run, with the reason: the journey, outage, and map checks (the planner is not imported into the shell), the place pack (no place data is bundled), and the games and finders checks (access-tools runs those). A check whose test was filtered out of a run is also listed as not run.
