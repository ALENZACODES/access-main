# states: search, saved, filters, audits (round 4)

Everything is exported from `index.ts`. A shell calls a route view function, then the matching renderer:

| Route | View | Renderer |
| --- | --- | --- |
| search | `searchRouteView(load, { locale, connectivity, today, filter })` | `renderSearchRoute` |
| place | `placeRouteView(...)` | `renderPlaceRoute` |
| saved | `savedRouteView(load, { locale, connectivity, today })` | `renderSavedRoute` |

- `filters.ts`: a requirement is met only by a detail reported "yes" with valid provenance. "no" and "partial" do not meet it. A place whose required detail is UNKNOWN is never counted as a match and never silently dropped: search shows how many are hidden and offers a 44px control to show them, labelled UNKNOWN.
- `urlState.ts`: filter state in the query string (`need`, `unk`, `q`), validated on decode.
- `messages.ts`: plural-aware EN/FR catalogue. `auditCatalog` fails on empty text, EN/FR placeholder drift, prohibited wording and French typography.
- `contrast.ts`: WCAG contrast maths and the light/dark palette used by the renderers; tests fail if any pair drops below 4.5:1 (focus ring 3:1).
- `renderHtml.ts` and `htmlAudit.ts`: semantic, escaped HTML (labelled regions, `lang`, headings, 44px buttons and summaries) and an audit that reports target size, language, names, contrast, duplicate ids, prohibited wording and inferred-accessibility wording. `renderHtml.test.ts` renders every view in EN/FR, light/dark, online/offline and fails on any violation.
- `dataAudit.ts`: `assertPlacesClean(places, today)` throws if any record shows a known value without a source, open licence and valid date. Stale details (over 365 days) are warnings. A data package should call it from its own tests.
- `testHelpers.ts` is test-only and holds no real data.

"Reported" is used instead of stronger claims. The App records who reported a detail and when; it does not certify it.
