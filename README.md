# the App

Ontario accessibility prototype, spinal-cord-injury first. This repository holds the shell and the shared schema package. The shell is navigation, settings, language, and offline storage. `@access-main/schema` is JSON Schema, the validator, the field-value counter, and the verification-tier vocabulary. It is an independent prototype. No organisation has endorsed it.

Preferences stay on the device. The shell does not upload them, does not ask for location, and does not list places. Unknown stays unknown. The device profile has no washroom interval, continuous-travel limit, or pressure-relief reminder.

In French the product is called l'application. Tier ids are not translated. The lists live in [`packages/schema/TIERS.md`](packages/schema/TIERS.md). The shell reads those lists from the schema package.

## Prerequisites

1. Node.js 22 or newer.
2. npm 11 or newer. npm 10 can fail while resolving this workspace. `npx npm@11.6.2 install` is a working install command.

## Install

1. Clone this repository.
2. From the repository root, run `npm install`.

`prepare` compiles `@access-main/schema`. `dist/` is gitignored.

## Run locally

1. Run `npm run dev`.
2. Open the URL Vite prints (port 5173 unless `PORT` is set).
3. The dev server binds to `0.0.0.0` so a platform can reach it.
4. Service-worker offline behaviour is part of the production build, not the dev server. Use the steps under “Production build” to try that.

## Test

1. Run `npm run typecheck` for TypeScript (schema, shared contracts, and the web app).
2. Run `npm run lint` for ESLint, including `eslint-plugin-jsx-a11y`.
3. Run `npm test` for Vitest: shell and shared tests, then the schema package.
4. Run `npx playwright install --with-deps chromium` once, from the repository root, if the browser is not installed.
5. Run `npm run test:e2e` for Playwright. That command builds the app and checks routes with axe, keyboard, English and French, settings, and an offline reload.

## Production build

1. Run `npm run build`.
2. Run `npm run preview`.
3. Preview listens on `0.0.0.0` and uses `PORT` when that variable is set, otherwise 4173.

## Schema package

[`packages/schema`](packages/schema) is `@access-main/schema`. A git install of this repository exposes the compiled entry:

```ts
import { countRecords, getValidator } from "access-main/schema";
```

Tier ids for other packages in this repo:

```ts
import { CANONICAL_TIER_IDS, PROTOTYPE_LABELS } from "@access-main/schema/tiers";
```

## Why these dependencies

| Package | Role | Licence |
| --- | --- | --- |
| React, React DOM, React Router | Interface and routing | MIT |
| React Aria Components | Keyboard and screen-reader behaviour for controls | Apache-2.0 |
| i18next, react-i18next | English and French shell text | MIT |
| Vite, @vitejs/plugin-react | Build | MIT |
| vite-plugin-pwa, Workbox | Service worker and web app manifest | MIT |
| Dexie | IndexedDB for preferences and the record cache | Apache-2.0 |
| Ajv, ajv-formats | JSON Schema validation | MIT |
| Vitest, Testing Library | Unit and component tests | MIT |
| Playwright | Browser tests | Apache-2.0 |
| axe-core, @axe-core/playwright | Automated accessibility checks | MPL-2.0 (axe-core is file-level copyleft; this repo does not modify it) |
| eslint-plugin-jsx-a11y | Static JSX accessibility checks | MIT |

Credits are not endorsements. Notices are in `THIRD_PARTY_NOTICES.md`.

## What is not in this shell

Places, journeys, finders, the services directory, activities, and help-centre articles are typed stubs in `apps/web/src/modules/stubs.ts`. They return no records.

No open data is ingested here. A later ingest still needs a licence check on the day it is downloaded.
