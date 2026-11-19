# Coverage, the worksheet and site checks on the command line

Options added to `narrow-audit`. None of them changes the exit code rules:
a failure still exits 1, and nothing here turns a failure off.

| Option | What it does |
| --- | --- |
| `--coverage` | Prints what the report says for each of the 55 Level A and AA criteria of WCAG 2.2: something found, checks ran and found nothing, checks not run, or by hand only. |
| `--format coverage` | Writes the same as a Markdown table, `narrow-audit.coverage.<lang>.md`. |
| `--format worksheet` | Writes `narrow-audit.worksheet.<lang>.html`: one block per criterion with a by-hand step, what the report says, a box to tick and a notes field. |
| `--format detail` | The detailed report now ends with a table of the 55 criteria and what the report says about each. |
| `--markup-checks` | Runs every markup check on the `--html` files (ARIA, references, labels, tables and the others), not only the page markup check. |
| `--site-root DIR` | Says which folder the `--html` files are served from, and compares them as pages of one site (`consistency`, `site-links`, `lang-pairs`). Needs at least two `--html` files. |
| `--site-complete` | Says the `--html` files are every page of the site. A link to a page outside them then fails, and a page nothing links to is reported. |
| `--manual-log FILE` | Reads a log of what people saw when they looked at a criterion by hand. Prints a summary and adds the newest note to each block of the worksheet. |
| `--html-list FILE` | Reads the `--html` files from a list, one path per line. Blank lines, lines that start with `#` and repeats are skipped. |

All of them have a key in the config file: `coverage`, `markupChecks`,
`siteRoot`, `siteComplete`, `manualLog`, `htmlList`, and the two formats go
in `format`.

## Things to know

- **Coverage reads the full report.** `--filter` hides findings from the views
  for people. It does not change which checks ran, so `--coverage`, the
  coverage table and the worksheet ignore it. They hold counts and no page
  text, so `--redact` has nothing to remove from them.
- **`--markup-checks` is off by default** so that existing baselines, budgets
  and ledgers for `--html` runs do not move. Turning it on adds findings; write
  a new baseline when you do.
- **`--site-root` maps files to routes.** `dist/fr/index.html` under `dist` is
  `/fr`, and `dist/about.html` is `/about`. Files outside the folder, and a
  second file for a route already given, are named in the output and left out
  of the comparison. The result is a part of the report called `site:files`.
- **Without `--site-complete` the files are treated as a sample.** Links to
  pages that were not given are counted in one UNKNOWN entry.
- **The worksheet saves nothing.** A ticked box and typed notes are lost when
  the page is closed, and the page says so. A ticked box records that someone
  looked, not that the criterion is met.

## The by-hand log

```json
{ "version": 1, "notes": [
  { "sc": "2.4.7", "result": "no-problem-found", "on": "2026-11-12", "by": "@sam", "note": "Light and dark, five pages." },
  { "sc": "1.2.2", "result": "problem", "on": "2026-11-12", "by": "@sam", "note": "The intro video has no captions." }
] }
```

- `sc` is a Level A or AA criterion of WCAG 2.2. `result` is `problem`,
  `no-problem-found` or `not-sure`. There is no result that reads as a pass.
- A `problem` needs a `note` that says what was seen.
- The newest note for a criterion counts. A note older than 180 days is listed
  as old, because pages change. A note dated after today is refused.
- The log never changes the exit code. A problem seen by hand is for the team
  to act on, and `no-problem-found` clears nothing in the audit.
- `no-problem-found` is what one person saw that day on the pages they looked
  at. It is not a conformance statement, and the output says so.

## What was looked at

- `worksheet.test.ts` runs this module's own markup, static and copy checks on
  the worksheet in both languages and expects no finding.
- `e2e-detail.test.ts` (with `NARROW_E2E=1` and a Chromium) serves the
  worksheet and the detailed report and runs the browser checks: the English
  worksheet in every profile, the French one in the narrow and dark profiles.
  No measured failure.
- Not looked at: how a screen reader reads the worksheet, and how it prints.
