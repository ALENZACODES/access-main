# Subcommands, the runs-over-time page and the index page

## Subcommands

| Command | What it does | Starts a browser | Writes files |
| --- | --- | --- | --- |
| `narrow-audit ...` | Runs the audit. | Only with `--route` | With `--out` and the state files |
| `narrow-audit plan` | Chooses which routes to audit on a large site. | No | With `--out` |
| `narrow-audit triage REPORT.json` | Where to start, policy limits, ticket drafts. | No | With `--tickets` and `--out` |
| `narrow-audit check` | Says whether the files a run reads can be used. | No | No |
| `narrow-audit init DIR` | Writes starter files for a new audit folder. | No | Yes, into DIR |

### `check`

```
npx tsx apps/web/src/narrow/bin.mjs check --config audit/narrow-audit.json --policy audit/policy.json
```

Reads each file once and prints one line per file: CAN BE USED, CANNOT BE USED
with the reason, NOT FOUND, or NOT THERE YET for the history and the ledger,
which the first run creates. A config file also brings in the files it names
(`baseline`, `waivers`, `budget`, `history`, `ledger`, `owners`, `review`,
`manualLog`, `compare`, `merge`). Exit code 0 when every file can be used, 1
when one cannot or is not found, 2 on a usage error.

A file that can be used parses and has the expected shape. That does not say
its content is right: an owners file that names the wrong team still can be
used. The command does not read `--html` files, routes files or the policy a
config does not name; give the policy with `--policy`.

### `init`

```
npx tsx apps/web/src/narrow/bin.mjs init audit --lang fr
```

Writes `narrow-audit.json`, `policy.json`, `owners.txt`, `review.json`,
`manual-log.json` and a `README.md` into the folder. A file that is already
there is kept unless `--force` is given, and the command says which files it
wrote and which it kept. The review file and the by-hand log start empty: a
note nobody wrote is not put in a log. The owners file starts as comments
only, so no finding gets an owner nobody chose.

## `--format trend`

Writes `narrow-audit.trend.<lang>.html` from the history: a line chart of the
findings to fix and the UNKNOWN findings over the newest 30 runs, and a table
of every run. It needs `--history`.

- The two lines differ by their dash pattern and their point shape, not only
  by colour, and the caption says which is which.
- Every point of the chart is a row of the table. The chart has a title and a
  description in words.
- The table marks the runs where the number of routes changed, because counts
  are only comparable between runs that audited the same routes.
- The page says that a count that goes down is not a statement of
  conformance.
- A second table lists the checks of the newest run that found something,
  with the change since the run before, the largest change first.

## `--format index`

Writes `index.<lang>.html` into `--out`: a list of every file the run wrote
into that folder, in the order a person would open them, each with a line on
what it is for. It lists what was really written, whichever option wrote it,
and links by file name, so it works from the folder itself.

## What was looked at

- `pages.test.ts` runs this module's own markup, static and copy checks on
  both pages in both languages and expects no finding.
- `e2e-detail.test.ts` (with `NARROW_E2E=1` and a Chromium) serves both pages
  and runs the browser checks. The first run found a real problem: the table
  of runs made the page scroll sideways at 320 pixels. The table now has
  three narrow number columns and fits. No measured failure remains.
- Not looked at: how a screen reader reads the chart and the table, and how
  the pages print.
