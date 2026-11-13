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
```

`validate` prints `PASS` or `FAIL` and the file name. Invalid examples are supposed to fail.

## What is in the schemas

Canonical records: place, entrance, washroom (adult change table and hoist), parking (type A van-accessible bay), segment, transit stop, elevator asset, outage, charging, repair and supply, benefits directory, journey, user profile (device only), game definition, game session, city skeleton, correction report, source, licence.

Import records: the access-maps venue, washroom, path, transit, and source shapes. Real fixtures from that pull request are in `fixtures/import/real/`.

Counting rules: `docs/counting-rules.md`. Tiers: `docs/verification-tiers.md`. Migration: `docs/migration-from-access-maps.md`.

## Scripts

```bash
npm run emit --workspace @access-main/schema
npm run generate-types --workspace @access-main/schema
npm test --workspace @access-main/schema
```

`src/generated/types.ts` is generated from the catalog. Do not edit it by hand.
