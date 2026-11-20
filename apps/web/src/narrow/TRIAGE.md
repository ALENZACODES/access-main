# Triage: what to do with a report

`narrow-audit triage` works on a report that was already written. It audits
nothing, opens no browser and sends nothing anywhere.

```
npx tsx apps/web/src/narrow/bin.mjs triage audit/narrow-audit.json \
  --ledger audit/ledger.json --owners audit/owners.txt \
  --policy audit/policy.json --tickets audit/tickets --out audit/order.md
```

| Option | What it does |
| --- | --- |
| `REPORT.json` | The report to read, as `--out` writes it. Required. |
| `--ledger FILE` | Adds how long each failure has been open. Needed by policy rules that use `olderThanDays`. |
| `--owners FILE` | Adds the owner of each finding. |
| `--policy FILE` | Compares the report with limits the team chose. Sets the exit code. |
| `--manual-log FILE` | Prints what people saw by hand. With `--tickets`, each problem in the log gets a draft too, before the others. |
| `--tickets DIR` | Writes one Markdown draft per distinct finding, and a `README.md` index. |
| `--tickets-for fail\|all` | Drafts failures only, or UNKNOWN findings too (default). |
| `--out FILE.md` | Writes the full order as a Markdown table, with the parts of each score. |
| `--max N` | Items printed and drafts written. Default 10 printed, 20 drafts. |
| `--lang en\|fr` | Language of the output. |

Exit code 0 when any policy given is kept, 1 when it is not, 2 on a usage or
read error. Without `--policy` the exit code says nothing about the findings.

## Where to start (`priority.ts`)

Each distinct finding gets a score from four things the report and the ledger
hold:

| Part | Points |
| --- | --- |
| Status | FAIL 120, UNKNOWN 20 |
| Level of the related criterion | A 30, AA 20, outside WCAG 10, AAA 5 |
| Spread | 5 per extra route, up to 30 |
| Age | 3 per full week open, up to 30 (failures, from the ledger) |

A failure always comes before an UNKNOWN finding. The weights are in
`WEIGHTS` and every item lists the parts of its score.

The order is a starting point. It does not know how many people a problem
stops or how hard it is to settle, and an UNKNOWN finding may turn out to
matter most once a person has looked. The weights are this tool's choice, not
a standard.

## Policy (`policy.ts`)

```json
{
  "version": 1,
  "rules": [
    { "id": "no-level-a-failures", "when": { "status": "fail", "level": ["A"] }, "max": 0 },
    { "id": "no-failure-older-than-30-days", "when": { "status": "fail", "olderThanDays": 30 }, "max": 0 },
    { "id": "unknown-backlog", "when": { "status": "unknown" }, "max": 40, "note": "Keep the pile small enough to look at." }
  ]
}
```

- `when` may hold `status` (`fail` or `unknown`), `level` (a list from `A`,
  `AA`, `AAA`, `none`), `rule` (a pattern on `check/rule`), `route` (a
  pattern) and `olderThanDays`. `{}` counts every finding.
- A rule is kept when the number of matching findings is at most `max`.
- A rule with `olderThanDays` and no ledger is **not evaluated**, and the
  policy is then not kept. A limit nobody could measure is never reported as
  kept.
- A key the tool does not know stops the run with code 2.

A policy that is kept means the counts are within the limits the team chose.
It says nothing about conformance.

## Ticket drafts (`tickets.ts`)

Each draft says what was found and where, the related criterion, who it
matters to, and how to look by hand. It ends with two boxes to tick before
closing: the audit no longer reports the finding, and a person has looked.
Both are needed.

- The drafts are files. Nothing is sent to a tracker.
- The key of a draft (`check/rule|element`) holds no route, so one finding on
  many routes is one item, and the key stays the same from run to run.
- An UNKNOWN draft says that there may be no problem at all.

## Where the command lives

`triage` is one of four subcommands of the main command, next to `plan`,
`check` and `init`. `narrow-audit --help` lists them, and each prints its own
help with `--help`.
