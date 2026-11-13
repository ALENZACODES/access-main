# Repository map

| Path | What belongs here |
| --- | --- |
| `apps/web` | The PWA: routes, layout, design system, English and French strings, onboarding, settings, data status, service worker. |
| `packages/shared` | TypeScript contracts: profile shape, provenance checks, cache rules, and the module interfaces other lanes implement. |
| `packages/schema` | JSON Schemas. Owned by another lane. Not created or edited here. |
| `docs` | Decisions, this map, and the privacy note for device storage. |
| `.github/workflows/ci.yml` | Pull-request checks only. |

`apps/web/src/modules/stubs.ts` is the file to replace, one property at a time, when a lane ships a real module. A module must return records that already satisfy `validateCacheEntry` before the shell will store them.
