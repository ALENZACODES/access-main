# P16 Round 21 — bilingual source and offline consistency

Mainline base: `b70ba5e5f6b7e79ec03d4bcf080b4a0495d39649`.

This is a read-only consistency audit. It does not fetch URLs, edit cached
assets, translate records, promote evidence tiers, or publish information.
Existing keyboard and DOM-ID regression files are not included.

## Complete files in this increment

- `scripts/p16-source-drift-round21.mjs`: pure audit and safe findings.
- `scripts/p16-source-drift-round21.node.mjs`: built-in Node test cases.
- `scripts/P16_SOURCE_DRIFT_ROUND21.md`: this operational description.
- `package.json`: the complete current-main copy, changing only `test:scripts`.

## Data shape

Each entry supplies `id`, `pairKey`, `locale` (`en` or `fr`), `availability`,
`title`, `description`, `source`, and `cache`. A source carries `name`, HTTPS
`url`, `licence`, `collectedOn`, and `tier`. A cache carries `state`; when stored,
it also includes a local `path` and `capturedOn` date. Missing content remains
missing; the audit never inserts a substitute or increases confidence.

Each issue contains only an issue code and structural field path, never a
record's title, address, attribution name, or description. Both languages are
required by default, with an explicit option to disable pair completeness
for isolated fixture cases. Dates are evaluated against a caller-supplied
`asOf` value, not the machine clock.

## Test ownership

The `test:scripts` command runs these Node suites through a single Node
runner: the existing lane-sync suite, the existing Round 10 record audit,
Rounds 16/17/19, and this new Round 21 suite. The Round 10 TypeScript import
uses Node's native type stripping. The `.test.mjs` suites under `scripts/`
remain owned by Vitest and are not listed in `test:scripts`.

From the project root with dependencies installed:

```sh
npm run lint
npm run typecheck
npm test
npm run test:scripts
```

Focused local checks, requiring only Node and TypeScript:

```sh
node --test scripts/p16-source-drift-round21.node.mjs
node --check scripts/p16-source-drift-round21.mjs
node --check scripts/p16-source-drift-round21.node.mjs
tsc --noEmit --allowJs --checkJs --strict --target ES2022 --module NodeNext --moduleResolution NodeNext scripts/p16-source-drift-round21.mjs
```

The new audit does not establish full WCAG conformance or screen-reader and
hardware-switch behaviour. It checks records and structured metadata only.
