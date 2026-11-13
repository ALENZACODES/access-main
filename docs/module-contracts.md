# Module contracts

`packages/shared/src/modules.ts` defines the six seams:

| Id | Route | Package this route calls | This build |
| --- | --- | --- | --- |
| `places` | `/places` | `access-maps` (`ALENZACODES/access-maps`) | Search form. No records, because the open-data files are not bundled. No map canvas and no map attribution. |
| `journey` | `/journey` | `@access-maps/journey` | Origin and destination form. No itinerary. Live elevator status stays unavailable. |
| `finders` | `/finders` | `@access-tools/finders` | Kind and text form. No washroom, parking, charging, repair, or adult-change records. Fixture places are not copied. |
| `navigator` | `/navigator` | `@access-tools/navigator` at `06c9d4b` | No directory links are bundled in the page. A stored entry is `directory-record-1.0.0` with `verificationTier: "administrator_page"`, `notEligibilityAdvice: true`, and an `https` `officialUrl`. The cache provenance tier is `E`. A `directory-record-1.1.0` payload, or a payload field named `tier`, is rejected. |
| `games` | `/games` | `@access-tools/games` | No activities yet. A real activity must set `clinicalClaim` and `seizureRiskFlash` to `false`. |
| `help` | `/help` | `@access/help` | Search form. No articles from that package. The shell's own short help text is separate and translated. |

The pins, including the commit each binding was checked against, live in `packages/shared/src/lanes.ts`. `createModules` accepts a real module for any of those ids. Omitted ids return an empty list and `modules.assigned`. They do not invent records.

Every stored record goes through `validateCacheEntry`. Required provenance is `source_name`, `licence` (the word `UNKNOWN` is allowed; a blank is not), `source_date`, `retrieved_at`, and canonical `tier`. Tier ids are `0`, `1`, `2`, `3`, `4`, and `E`. A prototype cache may store `0`, `1`, and `E`, with labels `PROTOTYPE-UNVERIFIED` or `SEEDED-OPEN-DATA`. It refuses tier `2`, tier `3`, tier `4`, `COMMUNITY-REPORTED`, and `VERIFIED`. `UNKNOWN` is not a tier.

Tier ids and the access-tools string map, including `administrator_page` → `E`, are imported from `@access-main/schema/tiers`. `packages/shared` does not keep a second copy of those lists.

The directory payload matches access-tools pull request 2 (`DirectoryRecord` in `packages/navigator`). `packages/schema/TIERS.md` maps `administrator_page` to tier `E`: a desk check of an official page, not an eligibility decision. `canonicalTierFromForeign` applies that mapping.

`SHELL_CONTRACT_VERSION` is `1.1.0`. Bump it when a field changes meaning.
