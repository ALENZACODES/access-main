# @access-main/schema

JSON Schema 2020-12, an Ajv validator, and the field-value counter. The package does not invent accessibility facts. Unknown stays unknown. Every fact can carry a source, a licence, a date, and a verification tier. In French the product is called l'application. Tier ids are listed in [TIERS.md](TIERS.md). `dist/` is built by `prepare` and is not committed.

## Install from git

From another repository:

```bash
npm install github:ALENZACODES/access-main#cursor/schema-package-61db
```

```ts
import { countRecords, getValidator, migrateImportRecord } from "access-main/schema";
```

That installs this repo. `access-main/schema` is the compiled entry. Ajv is a dependency of the repo root, which is what a git install resolves.

Inside this repo the package name is `@access-main/schema`:

```bash
npm install
node packages/schema/dist/cli.js validate packages/schema/fixtures/valid
```

pnpm can depend on the package directory:

```bash
pnpm add github:ALENZACODES/access-main#cursor/schema-package-61db&path:packages/schema
```

## CLI

```bash
access-schema validate fixtures/valid fixtures/import/real
access-schema validate fixtures/invalid
access-schema count --as-of 2026-11-13 path/outside/fixtures
access-schema migrate fixtures/import/real/venue.osm-node-238726675.json
access-schema deep-sample --seed day-30 --as-of 2026-11-14 --counts counts.json --format md path/to/seed/files
```

`validate` prints `PASS` or `FAIL` and the file name. Invalid examples are supposed to fail.

`deep-sample` is the seed-data deep sample (master plan Day 30, extended prompt 29). It counts every record in each file itself and, with `--counts`, compares that number to the seed-count report (a JSON object of file path to count). It lists defects a program can see: duplicate ids within and across files, a missing id, source, licence, date, or tier, an empty-string value, a 0 with no method and observation date, a number that reads as a measurement with no method or source key, and any tier above `SEEDED-OPEN-DATA` or `PROTOTYPE-UNVERIFIED`. It then draws up to 20 records per file (`--size`) with a seeded hash, so the same seed and files give the same sample. `--format md` prints a worksheet.

The command never reports `PASS`. The columns for the stated source, the second approved source, and agreement are left as `not checked` for a person to fill in. Exit code 1 means a defect or a count mismatch was found. Exit code 0 means only that no automatic defect was found.

## What is in the schemas

Canonical records: place, entrance, washroom (adult change table and hoist), parking (type A van-accessible bay), segment, transit stop, elevator asset, outage, charging, repair and supply, benefits directory, journey, user profile (device only), game definition, game session, city skeleton, correction report, source, licence.

Import records: the access-maps venue, washroom, path, transit, and source shapes, plus the GTFS-RT service alert. Real fixtures from that pull request are in `fixtures/import/real/`. The 32 TTC alerts are in `fixtures/import/alerts/`.

Counting rules: `docs/counting-rules.md`. Tiers: `docs/verification-tiers.md`. Migration: `docs/migration-from-access-maps.md`.

## Scripts

```bash
npm run emit --workspace @access-main/schema
npm run generate-types --workspace @access-main/schema
npm test --workspace @access-main/schema
```

`src/generated/types.ts` is generated from the catalog. Do not edit it by hand.
