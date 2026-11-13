# Module contracts

`packages/shared/src/modules.ts` defines the six seams:

| Id | Route | Lane that fills it | Stub behaviour |
| --- | --- | --- | --- |
| `places` | `/places` | maps / tools | `search` returns no places |
| `journey` | `/journey` | maps | `plan` returns no itinerary. Timing from the device profile may be passed in. It is not uploaded. |
| `finders` | `/finders` | tools | `search` returns no washrooms, parking, charging, repair, or adult-change records |
| `navigator` | `/navigator` | tools | `list` returns no directory links. A stored entry is a `directory-record-1.0.0` object: `notEligibilityAdvice: true`, `verificationTier: "administrator_page"`, and an `https` `officialUrl`. The cache provenance tier is `E`. |
| `games` | `/games` | tools | `list` returns no activities. A real activity must set `clinicalClaim` and `seizureRiskFlash` to `false`. |
| `help` | `/help` | help | `list` returns no articles. The shell's own short help text is separate and translated. |

Every stored record goes through `validateCacheEntry`. Required provenance is `source_name`, `licence` (the word `UNKNOWN` is allowed; a blank is not), `source_date`, `retrieved_at`, and canonical `tier`. Tier ids match `packages/schema/TIERS.md` on `cursor/schema-package-61db`: `0`, `1`, `2`, `3`, `4`, and `E`. A prototype cache may store `0`, `1`, and `E`, with labels `PROTOTYPE-UNVERIFIED` or `SEEDED-OPEN-DATA`. It refuses tier `2`, tier `3`, tier `4`, `COMMUNITY-REPORTED`, and `VERIFIED`. `UNKNOWN` is not a tier.

The directory payload matches access-tools pull request 2 (`DirectoryRecord` in `packages/navigator`). `administrator_page` is tier `E`, a desk check of an official page, not an eligibility decision.

`SHELL_CONTRACT_VERSION` is `1.1.0`. Bump it when a field changes meaning.
