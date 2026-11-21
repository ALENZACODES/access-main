# narrow: working with a report

Small, pure functions that take a report and return another report, text, or
a list. None of them runs a browser or reads a file. They are library code:
the command line does not call them yet.

| File | What it does |
| --- | --- |
| `guidance.ts` | for each check, who is affected and how to look by hand; `renderNextSteps` writes a "what to do next" section for the checks that found something |
| `merge.ts` | joins the reports of several runs into one |
| `filter.ts` | narrows a report to one status, some routes, some rules or some elements, for reading |
| `annotations.ts` | writes findings as workflow commands, so a CI host shows them next to the code |
| `cluster.ts` | groups the same finding seen on several routes |

## Rules they all keep

- A count is never changed. Grouping and filtering change what is shown, and
  say how much was left out.
- UNKNOWN stays UNKNOWN. In annotations it is a notice, never a warning or an
  error.
- Nothing is worded as a pass, as conformance, or as fixed. A hand check shows
  where to look and does not make a page conform.
- Text is in English and in French.

## Guidance

`guidanceFor(check)` returns the entry of a check, or a general fallback for a
check that has no entry yet. The texts name people and tasks. They give no
medical advice.

## Merge

`mergeReports(reports, emptyAt)` joins routes side by side. The same route and
viewport in two reports is joined check by check. When the same check ran on
the same route twice, the newer result is kept and the clash is returned, so
findings are not counted twice. A check is listed as skipped only when every
report skipped it and none ran it.

## Filter

`parseFilter('status:fail route:/help* rule:contrast/* -rule:copy/* id:nav')`
reads a filter, and `filterReport` applies it. The number of things each check
looked at stays as it was. A filtered report is a view for reading: do not use
it to decide whether a run fails. `describeFiltered` gives the note to print
with it.

## Annotations

`renderAnnotations(report, lang, max)` writes `::error` and `::notice` lines.
Only findings from an HTML file carry a file and a line. The list is cut at
`max` (10 by default), failures first, and a last line says how many were left
out.

## Cluster

`sharedFindings(report)` returns the findings seen on two routes or more.
They are most likely in a shared part of the site, such as the header. That is
a likelihood, not a measurement: each route still has to be looked at after a
change.

## From the command line

| Option | What it does |
| --- | --- |
| `--merge REPORT.json` | Joins an earlier report with this run (repeatable). May be used with nothing else to audit. A newer result replaces an older one for the same route and check, and each replacement is logged. |
| `--filter "status:fail route:/help*"` | Filters the views for people: the printed text, the HTML and the `--format` files. `narrow-audit.json` stays whole. |
| `--shared` | Prints the findings that repeat across routes. |
| `--next-steps` | Prints who each check matters to and how to look by hand. |
| `--annotations` | Prints workflow command lines (`::error`, `::notice`) for the first findings. |

None of these changes the exit code: it is always decided on the full report.

In French output the status token is UNKNOWN, the same as in English.
