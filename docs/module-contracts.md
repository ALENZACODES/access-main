# Module contracts

`packages/shared/src/modules.ts` defines the six seams:

| Id | Route | Package this route calls | This build |
| --- | --- | --- | --- |
| `places` | `/places` | `access-maps` (`ALENZACODES/access-maps`) | Search stays off. No records, because the open-data files are not bundled. No map canvas and no map attribution. |
| `journey` | `/journey` | `@access-maps/journey` | Origin and destination stay off. No itinerary. Live elevator status stays unavailable. |
| `finders` | `/finders` | `@access-tools/finders` | Kind and text stay off. No washroom, parking, charging, repair, or adult-change records. Fixture places are not copied. |
| `navigator` | `/navigator` | `@access-tools/navigator` at `5f893a8` | No directory links are bundled in the page. A stored entry is `directory-record-1.0.0` with `verificationTier: "administrator_page"`, `notEligibilityAdvice: true`, and an `https` `officialUrl`. The cache provenance tier is `E`. A `directory-record-1.1.0` payload, or a payload field named `tier`, is rejected. |
| `games` | `/games` | `@access-tools/games` at `5f893a8` | No activities yet. A real activity must set `clinicalClaim` and `seizureRiskFlash` to `false`. |
| `help` | `/help` | `@access/help` | Article search stays off. No articles from that package. The shell's own short help text is separate and translated. |

The pins, including the commit each binding was checked against, live in `packages/shared/src/lanes.ts`. `createModules` accepts a real module for any of those ids. Omitted ids return an empty list and `modules.unavailable`. The screen says that part is not available yet. The package and repository names sit in a technical note, not in the lead sentence. They do not invent records.

Every stored record goes through `validateCacheEntry`. Required provenance is `source_name`, `licence` (the word `UNKNOWN` is allowed; a blank is not), `source_date`, `retrieved_at`, and canonical `tier`. Tier ids are `0`, `1`, `2`, `3`, `4`, and `E`. A prototype cache may store `0`, `1`, and `E`, with labels `PROTOTYPE-UNVERIFIED` or `SEEDED-OPEN-DATA`. It refuses tier `2`, tier `3`, tier `4`, `COMMUNITY-REPORTED`, and `VERIFIED`. `UNKNOWN` is not a tier.

Tier ids and the access-tools string map, including `administrator_page` → `E`, are imported from `@access-main/schema/tiers`. `packages/shared` does not keep a second copy of those lists.

The directory payload matches access-tools pull request 2 (`DirectoryRecord` in `packages/navigator`). Unknown keys are rejected, including a key named `eligibility`. `packages/schema/TIERS.md` maps `administrator_page` to tier `E`: a desk check of an official page, not an eligibility decision. A stored directory link uses that mapping: `canonicalTierFromForeign` reads `verificationTier` and the provenance tier must match. It is not a hard-coded `E`.

`SHELL_CONTRACT_VERSION` is `1.1.0`. Bump it when a field changes meaning.

## Contract check before display

`packages/shared/src/conformance.ts` checks every route's result before the shell shows it. `createModules` wraps all six routes with `guardModules`.

- Result: `moduleId` matches the route, `availability` is `stub`, `ready`, or `error`, `liveStatus` is `unavailable`, `asOf` is `null` or an ISO date-time, and only a `ready` result lists items. Item ids are unique.
- Places, journey, finders, and help items need a provenance that passes `validateProvenance`: source, licence (`UNKNOWN` allowed, blank refused), source date, retrieval time, and a prototype-cache tier.
- A finder hit keeps `detail: "unknown"`. A journey plan keeps `liveStatus: "unavailable"`. A directory record passes `validateDirectoryRecord` and maps to tier `E`. A game keeps `clinicalClaim: false`, `seizureRiskFlash: false`, and `keyboardOperable: true`. A help article states `en` or `fr`.
- Health and credential keys are refused anywhere in an item.

A result that fails is replaced by an empty `error` result with `modules.contractError`. A module that throws gives `modules.error`. The checker does not repair or fill in a record. Lane repositories can copy `checkModuleItem` and `checkModuleResult` into their own tests.

Each listed item shows its source, licence, date, and tier in a description list, in English or French. A licence of `UNKNOWN` is shown as Unknown. A help article in the other language carries a `lang` attribute and a note saying which language it is in. Lane message keys are not shell strings, so the shell picks its own sentence for each state.
