# Module contracts

`packages/shared/src/modules.ts` defines the six seams:

| Id | Route | Lane that fills it | Stub behaviour |
| --- | --- | --- | --- |
| `places` | `/places` | maps / tools | `search` returns no places |
| `journey` | `/journey` | maps | `plan` returns no itinerary. Timing from the device profile may be passed in. It is not uploaded. |
| `finders` | `/finders` | tools | `search` returns no washrooms, parking, charging, repair, or adult-change records |
| `navigator` | `/navigator` | tools | `list` returns no directory links. A real entry must set `eligibilityAdvice` to `false` and use an `https` official URL. |
| `games` | `/games` | tools | `list` returns no activities. A real activity must set `clinicalClaim` and `seizureRiskFlash` to `false`. |
| `help` | `/help` | help | `list` returns no articles. The shell's own short help text is separate and translated. |

Every stored record goes through `validateCacheEntry`. Required provenance is `source_name`, `licence` (the word `UNKNOWN` is allowed; a blank is not), `source_date`, `retrieved_at`, and `verification_tier`. Tier `TIER_4` is refused because live status is not an offline copy. The shell has no function that sets a tier to `VERIFIED`.

`SHELL_CONTRACT_VERSION` is `1.0.0`. Bump it when a field changes meaning.
