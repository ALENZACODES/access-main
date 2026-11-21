# The `plan` command

The route planning modules (see `ROUTE-PLANNING.md`) can be used from the
command line.

```
npx tsx apps/web/src/narrow/bin.mjs plan --base-url https://app.example \
  --sitemap sitemap.xml --robots robots.txt --page /=dist/index.html \
  --per-template 3 --always / --out routes.txt
```

`plan` reads the files named and prints the plan. It opens no browser and
fetches nothing. `--out` writes the chosen routes one per line.

| Option | What it does |
| --- | --- |
| `--base-url URL` | Required. Says which host the routes belong to. |
| `--sitemap FILE` | A sitemap as XML or as one address per line. Repeatable. |
| `--routes FILE` | One route or address per line. Repeatable. |
| `--page ROUTE=FILE` | Saved markup of one page, read for its links. Repeatable. |
| `--robots FILE` | Routes the file excludes are listed and left out of the plan. |
| `--agent NAME` | The user agent to read the robots file for. Default `narrow-audit`. |
| `--per-template N` | Routes taken from each template. Default 3. |
| `--max-routes N` | Upper limit on the routes in the plan. |
| `--min-siblings N` | Distinct values from which a path segment is read as data. Default 10. |
| `--always ROUTE` | A route that is always in the plan. Repeatable. |
| `--literal SEGMENT` | A section whose pages are kept apart. Repeatable. |
| `--lang en\|fr` | Language of the output. |

Exit code 0 when a plan was printed, 2 on a usage or read error.

A sitemap index is reported and not followed: give each sitemap it names with
its own `--sitemap`.

The plan is a sample. The audit says something about the routes in it and
nothing about the others.
