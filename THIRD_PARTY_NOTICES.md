# Third-party notices

The shell depends on these libraries. Their names are credits, not endorsements. Full licence texts are in `node_modules` after install. axe-core is MPL-2.0: this repository links to it from tests and does not modify its source files.

| Package | SPDX | Copyright note from the upstream licence text checked for this stack |
| --- | --- | --- |
| Workbox | MIT | Copyright 2018 Google LLC |
| vite-plugin-pwa | MIT | See the package licence |
| Dexie.js | Apache-2.0 | See the package licence and NOTICE |
| React Aria / React Spectrum components | Apache-2.0 | Copyright Adobe. Do not imply Adobe endorsement. |
| i18next and react-i18next | MIT | See the package licences |
| axe-core | MPL-2.0 | File-level copyleft. Unmodified. |
| Playwright | Apache-2.0 | Copyright Microsoft. Do not imply Microsoft endorsement. |
| Vitest | MIT | See the package licence |
| eslint-plugin-jsx-a11y | MIT | See the package licence |
| React and React Router | MIT | See the package licences |

Map tiles are not shipped. When a map is added, OpenStreetMap attribution and the ODbL share-alike duty stay with that layer.

## Offline pack data

`apps/web/public/packs/toronto/content.json` is built by `apps/web/scripts/build-toronto-pack.ts`. It is downloaded only when the person asks for it.

| Part | Source | Licence |
| --- | --- | --- |
| 24 places | OpenStreetMap, Geofabrik Ontario extract, as imported by access-maps pull request 1 (retrieved 2026-11-13) | ODbL-1.0. © OpenStreetMap contributors. The pack is a derived database under the same licence. |
| 3 elevator status copies | TTC GTFS-Realtime accessibility alerts snapshot (retrieved 2026-11-13) | Open Government Licence – Toronto |
| 6 help numbers | access-help `packages/help/src/signposts.ts`, desk-checked against official pages on 2026-11-13 | Facts from official pages. No licence stated, recorded as UNKNOWN. |
