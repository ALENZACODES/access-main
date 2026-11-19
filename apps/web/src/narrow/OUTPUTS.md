# narrow: output formats

`--out DIR` always writes the JSON report and an HTML page in the chosen
language. `--format` adds more files to the same folder. Every format is made
from the same report, so the findings are the same in all of them.

| Format | File | For |
| --- | --- | --- |
| (always) | `narrow-audit.json` | the full report, for tools |
| (always) | `narrow-audit.<lang>.html` | reading in a browser |
| `sarif` | `narrow-audit.sarif` | code scanning views |
| `junit` | `narrow-audit.junit.xml` | test result views in CI |
| `markdown` | `narrow-audit.<lang>.md` | a pull request comment or a job summary |
| `csv` | `narrow-audit.csv` | a spreadsheet or a bug tracker import |
| `digest` | `narrow-audit.<lang>.txt` | the top of a job log or a chat message |

```
npx tsx apps/web/src/narrow/bin.mjs --html dist/index.html --out reports/narrow \
  --format markdown,csv,digest --lang fr
```

## Markdown

Totals, a table by check, a table by WCAG 2.2 criterion with its level, the
most frequent rules, then the findings of each route with failures first. A
route with more than 50 findings is cut there and says how many were left out;
the JSON report holds all of them. Text that comes from the audited page is
escaped, so a finding cannot add links, images or HTML to a comment.

## CSV

One row per finding, with both languages in every row. Columns: `route`,
`viewport`, `check`, `criterion`, `level`, `rule`, `status`, `element`,
`message_en`, `message_fr`. Lines end in CR LF (RFC 4180). A cell that a
spreadsheet would run as a formula (it starts with `=`, `+`, `-` or `@`) gets a
leading apostrophe.

## Digest

A few lines of plain text: the totals, findings by conformance level, the most
frequent rules and the routes with the most findings.

## Comparing with an earlier run

`--compare REPORT.json` reads an earlier `narrow-audit.json` and says what
changed: new findings, findings no longer reported, and findings whose status
changed. With `--out` it also writes `narrow-audit.compare.<lang>.md`. It does
not change the exit code.

```
npx tsx apps/web/src/narrow/bin.mjs --html dist/index.html --out reports/narrow \
  --compare previous/narrow-audit.json
```

- A finding is compared only where its check ran on the same route in both
  reports. Otherwise it is counted as not comparable, never as new or gone.
- "No longer reported" does not mean fixed: the element may have moved or been
  removed. A person has to look.
- The earlier file is checked before it is used. A file that is not a report
  stops the run with exit code 2 and names the field that is wrong.

## What the numbers mean

- A check relates to a criterion and does not test all of it. The table by
  criterion groups findings; it is not a list of criteria that were met.
- UNKNOWN means a person has to look. It is never counted as a failure and
  never as a pass.
- Zero findings means the checks that ran reported nothing. No format words
  that as a pass or as a conformance statement.
- Level AAA rows are good practice when the target is level AA.
- The criterion names in French are this tool's own wording. The numbers,
  English names and levels are those of WCAG 2.2 (W3C Recommendation,
  2023-10-05).
