# Release checks / Contrôles avant publication

Static checks for a built copy of the web app (`apps/web/dist`). They read files only:
no network, no browser, no build. A pass says the checked files met the written rules.
It does not certify accessibility at run time.

## Run

```sh
npm run test:release   # the suites in this folder (node:test); part of npm test
npm run build
npm run verify         # the suites, then every audit below against apps/web/dist
```

`npm run verify` is opt-in. It is not a CI step and no build, test or typecheck script
calls it. On current main it reports findings and exits non-zero. Most of them come from
identifier strings in compiled JavaScript (translation keys, enum values) and from
third-party bundles, so the rules need tuning before the command can gate a release.

## What each command checks

| Command | Checks |
| --- | --- |
| `check.mjs --dir <dist>` | Valid UTF-8 with no replacement character; prohibited wording, including organisation names (needles come from `packages/shared/test/forbiddenOrg.ts`), in text files and in JavaScript string literals; total size against a byte budget. |
| `audit.mjs --dir <dist>` | `site-audit.mjs`: entry point present, referenced assets exist, page language, title and viewport, image alternatives, frame titles, no meta refresh, valid JSON, claim state and provenance, no remote map tiles. |
| `deep-audit.mjs --dir <dist>` | Navigation, privacy patterns, form/table/SVG semantics, JSON content, downloads and exports, GeoJSON, media and bilingual captions, binary signatures, interaction and target-size declarations, EN/FR locale pairs, evidence records, offline graph. |
| `preflight.mjs --root . --dist <dist>` | Repository policy (root scripts, this folder's scripts, CI workflow), bundle totals with a fingerprint, and a shipped-copy scan. |
| `prepare-copy.mjs --root .` | Rewrites display wording in the `.lanes` copies of other repositories' packages and then audits them. Not called by any script here; see below. |

Rule functions live beside each command (`*-audit.mjs`, `*-policy.mjs`) and each has a
`*.test.mjs` file with hand-made fixtures.

## Not wired in

- `prepare-copy.mjs` is not part of `build`, `pretest` or `pretypecheck`. It changes copied
  source from other repositories at build time; whether to do that is a product decision.
- The preflight rule that CI must run `npm run verify` is unmet on purpose, for the reason above.

## Parsing sources

`extractShippedStrings(source, fileName)` picks the parser mode from the file name.
Built bundles are JavaScript. Copied package sources are TypeScript or TSX and must be
parsed as such: read as JavaScript, a call with explicit type arguments such as
`new Map<string, number>()` is a syntax error.

## Unknown stays unknown

The record audits never turn a missing source, licence, date or measurement into a pass
or into a positive statement. Missing evidence is reported as missing.
