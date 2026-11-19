# Config file, routes file and the detailed report

Three additions to the command line. None of them changes what a check does
or how the exit code is decided.

## `--config FILE.json`

Keeps the options in one reviewed file instead of a long command.

```json
{
  "$comment": "Weekly run. Paths are relative to where the command runs.",
  "html": ["dist/index.html"],
  "out": "audit",
  "lang": "fr",
  "format": ["markdown", "detail"],
  "ledger": "audit/ledger.json",
  "nextSteps": true
}
```

- A key is the option name in camel case: `--base-url` is `baseUrl`,
  `--next-steps` is `nextSteps`. `--route` is `routes`, a list.
- Options that repeat (`html`, `routes`, `merge`, ...) and options that take
  a comma list (`format`, `only`, `skip`, `profiles`) are written as lists.
- Switches (`offline`, `redact`, ...) are `true` or `false`.
- `$schema`, `$comment` and `comment` are for notes and are skipped.
- A key the tool does not know stops the run with code 2 and, where one is
  close, a suggestion. Nothing is guessed.
- The file becomes the same arguments a person would type, placed where
  `--config` stood. An argument typed after `--config` wins for an option that
  takes one value. List options from the file and from the command line are
  added together.
- One config file per run. A config file cannot name another one.

`config.ts` holds the table of keys. A test compares it with the help text, so
an option added to the command line without a key fails the tests.

## `--routes-file FILE`

Reads routes from a file, one per line, as `narrow-audit plan --out` writes
them. This is what joins the plan to the audit:

```
npx tsx apps/web/src/narrow/bin.mjs plan --base-url https://app.example --sitemap sitemap.xml --out routes.txt
npx tsx apps/web/src/narrow/bin.mjs --base-url https://app.example --routes-file routes.txt --out audit
```

- Blank lines and lines that start with `#` are skipped.
- A line is a path that starts with `/`, or a full address on the host of
  `--base-url`. Any other line stops the run with its line number, so a wrong
  file is never half used.
- Repeats are dropped and reported. A list of more than 200 routes gets a
  note that the run will take a while; it is not refused.
- The option may be given more than once, and next to `--route`.

## `--format detail`

Writes `narrow-audit.detail.<lang>.html` into `--out`: totals, findings by
WCAG criterion and by level, findings that repeat across routes, every route
in full with failures first, and who each check matters to with a way to look
by hand.

- One file, no script, no outside resource. It opens offline and prints.
- It follows `--filter` and `--redact` like the other views for people.
- A route with no finding reads "The checks that ran reported nothing on this
  route. That is not a statement that the route conforms."
- In French the status token is UNKNOWN, as in English.

Two sets of tests look at the page:

- `detail.test.ts` runs this module's own markup, static and copy checks on
  the page for four different reports in both languages, and expects no
  finding.
- `e2e-detail.test.ts` (with `NARROW_E2E=1` and a Chromium) serves the page
  and runs the browser checks in every profile, in English and French, and
  expects no measured failure. That first run found two real problems the
  markup checks could not see: a skip link hidden off-screen, and a scrolling
  table region whose name did not hold its visible text. The skip link is now
  always visible, and the tables have a fixed layout that wraps, so no
  scrolling region is needed.

What neither set covers: how a screen reader reads the tables, how the page
prints, and anything the browser checks report as UNKNOWN. Those have not been
looked at by a person.
