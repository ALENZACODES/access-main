# narrow: tools for a team working through findings

Small, pure functions on a report. None of them runs a browser or reads a
file, and none of them changes a count, a status or an exit code. They are
library code: the command line does not call them yet.

| File | What it does |
| --- | --- |
| `ledger.ts` | remembers when each finding was first seen, so a report can say how long a failure has been open |
| `owners.ts` | splits findings by team or person from a small owners file |
| `review.ts` | keeps the notes of people who looked at UNKNOWN findings by hand, and prints a worksheet of what is still waiting |
| `redact.ts` | makes a copy of a report with page text taken out, for sharing outside the team |

## Ledger

`updateLedger(ledger, report)` returns the ledger after a run. Keep it as a
JSON file between runs and read it with `parseLedger`. A finding leaves the
ledger only when its check ran on its route and did not report it. An age
counts from when the tool first saw the finding, which can be later than the
day the problem appeared. `describeAges` prints failures by age and the oldest
ones.

## Owners

```
# general rule first
*                 @web
route:/help*      @help-team
rule:contrast/*   @design
```

The last line that matches wins. A finding no line matches is listed under
"No owner", never dropped. `unusedOwnerLines` lists lines that matched nothing
in a report.

## Hand review

An UNKNOWN is a question the tool cannot answer. `worksheet` prints the
UNKNOWN findings nobody has a current note for, with a key for each. A person
looks at the page and adds a note to the review file:

```json
{ "version": 1, "notes": [
  { "key": "/|contrast|image|h1[0]", "decision": "problem", "by": "Sam", "on": "2026-11-18", "note": "Text sits on a photo." }
] }
```

Decisions are `problem`, `no-problem-found` and `not-sure`. There is no pass.
"No problem found" records one look on one date; the report and its counts
stay as the checks produced them. A note older than 180 days, or dated after
the run, is not counted and its finding goes back to the worksheet.

## Redaction

`redactReport` removes the text that messages quote from the page, the query
and fragment of routes, and the id values of element ids. Checks, rules,
statuses, lines and counts are kept. It reduces what is exposed and does not
promise that nothing personal is left: a route path can still name a person
or a place, so read the result before sharing it.

## From the command line

| Option | What it does |
| --- | --- |
| `--ledger FILE` | Reads the ledger if it exists, adds this run, writes it back and prints the age of open failures. |
| `--owners FILE` | Prints findings by owner, and the lines of the owners file that match nothing in this run. |
| `--review FILE` | Prints what people noted for the UNKNOWN findings. With `--out`, writes the worksheet as `narrow-audit.review.<lang>.txt`. |
| `--redact` | Redacts what is printed and what is written into `--out`. The ledger, history, baseline and budget files still get the full report, because their keys use element ids. |

A redacted `narrow-audit.json` has other element ids than the full one, so do
not use it later with `--compare`, `--merge` or as a baseline.
