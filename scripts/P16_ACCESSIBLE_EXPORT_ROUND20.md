# P16 Round 20 — accessible evidence export

This self-contained, read-only utility accepts EN/FR accessibility records,
checks their source, open licence, collection and review dates, evidence tier,
offline truth state, and safe local cache path, and produces a deterministic
CSV suitable for local inspection. Nothing is fetched, modified or written.

Files:

- `scripts/p16-accessible-export-round20.mjs`
- `scripts/p16-accessible-export-round20.node.mjs`
- `scripts/P16_ACCESSIBLE_EXPORT_ROUND20.md`

## Data contract

Each record contains `id`, `language`, `title`, `summary`, `state`, `tier`,
`reviewedOn`, `source: {name,url,licence,collectedOn}`, and
`offline: {state,path?}`. A missing language is not silently translated.
Unknown states remain unknown; a tier is never promoted automatically.
URLs must use HTTPS without embedded credentials or fragments. Cache paths
must be local and cannot contain traversal or encoded path delimiters.

`prepareEvidenceExport(records, {requireBothLanguages:true})` returns rows,
field-path diagnostics and record counts. `evidenceCsv(result,
{requireClean:true})` throws when diagnostics are present; without that option
it exports only accepted rows. CSV fields are quoted, embedded quotes escaped,
and formula-like leading characters neutralized. Report summaries expose
only known issue codes and paths, not untrusted record text.

## Local commands

```sh
node --check scripts/p16-accessible-export-round20.mjs
node --check scripts/p16-accessible-export-round20.node.mjs
node --test scripts/p16-accessible-export-round20.node.mjs
npx tsc --allowJs --checkJs --noEmit --target es2022 --module nodenext --moduleResolution nodenext scripts/p16-accessible-export-round20.mjs
npm run lint
npm run typecheck
npm test
```

The `.node.mjs` suffix ensures the Node fixture file is not automatically
collected as a Vitest suite. No repository imports, dependencies, packages,
configuration, or workflows are introduced. Browser, physical switch, and
screen-reader sessions remain separate accessibility requirements.
