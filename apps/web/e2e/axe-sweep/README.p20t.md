# Auditors embedded-language boundary

The auditors package currently renders two English paragraphs even when the App shell is in French. `AuditorsLanguageRegion` marks only those exact English-only paragraphs with `lang="en"`, including content rendered after a component state update. Other language markup is not rewritten, and any marker owned by the adapter is removed when the shell changes back to English or the paragraph is replaced with translated text.

`AuditorsPage.tsx` mounts the adapter in the live `/more/auditors` route. The unit tests cover matching, unrelated French text, ownership and mutation. The Playwright spec covers French at both 320 and 1280 CSS pixels, then switches language using the header controls. The established semantic-integrity sweep stays fail-closed.

Run from the repository root with `npm run lint`, `npm run typecheck`, `npm test`, and `npm run test:e2e --workspace @access/web` after syncing the pinned tools lane. No additional data, services, workflows, or third-party assets are used.
