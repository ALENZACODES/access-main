# P20AD — Offline resilience, localized names and journey continuity

The `p20ad-offline-contracts` layer audits observed accessibility behavior during
network transitions. It does not infer accessibility features of any real place.
The evidence schema preserves source, licence, retrieval date and tier. Unknown
measurements remain `UNKNOWN` rather than being upgraded to a positive fact.

The `p20ad-offline-browser` observer reads rendered DOM state only. It does not
write to IndexedDB, localStorage, service-worker caches or app documents. A
navigation snapshot records the HTTP response and visible route title.
Browser observations leave cache freshness, announcement timestamps and source
provenance UNKNOWN until explicitly supplied by the test scenario.

`p20ad-offline-live.spec.ts` builds its route inventory from `appRoutes()` and
checks two viewport widths and both supported languages. It also observes
network disconnect/reconnect without requiring a saved region pack. The
existing exhaustive axe suite remains the source of route-wide WCAG coverage;
this suite tests a different failure mode and avoids another expensive crawl.

French assertions use document language and rendered accessible naming paths,
not literal English `aria-label` strings. Text from `aria-labelledby`, native
labels, visible button text and image alternatives can name a control.

`p20ad-offline-contracts.node.mjs` runs with Node 22's type stripping and has
independent fixtures for trace discontinuity, record lineage, two-language copy,
keyboard focus, offline fallback and matrix completeness.

## Apply notes

The root `PR-BODY.md` was inherited as a tracked file on main. The ZIP contains
`DELETE_FILES.txt` and a unified deletion patch rather than an empty file;
applying the deletion is required to remove that tracked file. Do not place any
replacement `PR-BODY.md` at repository root.

No scheduled workflows, synthetic place evidence, secrets, external API calls,
symlinks or third-party branding are added.
