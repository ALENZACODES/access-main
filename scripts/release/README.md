# Release checks / Contrôles avant publication

Run `npm run verify --prefix scripts/release` after building the web app.
This runs the built-in Node tests and scans `apps/web/dist` recursively.
The checker fails closed on a missing or empty build, invalid UTF-8,
replacement characters, prohibited wording, symlinks, or a total build size
over **4,141,875 bytes**. All files count toward the budget, including binary
assets. Only known textual extensions are decoded and inspected for strings.

For a different build location or byte limit, run:

```sh
node scripts/release/check.mjs --dir path/to/dist --budget 4141875
```

## Root npm integration

The root `npm run verify` runs these checks after `npm run build`. CI calls
`npm run verify` on pull requests and on pushes to `main`.
