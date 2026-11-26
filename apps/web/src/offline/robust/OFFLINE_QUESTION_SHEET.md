# Offline question sheet — P12 R50

## Scope

The question sheet is an optional, browser-local preparation aid. A person chooses the questions they want to ask about an outing or service, the relative importance, an optional region cell reference, and their own follow-up notes. The feature does not contact service providers or perform an accessibility assessment. Any physical condition is the literal `UNKNOWN`, including when a personal reply is recorded or data is saved locally.

## Use

1. Open the existing offline dashboard and choose **Open question sheet**. The question-sheet JavaScript is loaded only after this explicit action.
2. Give the sheet a title, select from 24 bilingual suggested questions or enter a custom question, choose a topic and importance, and optionally link a cell from the currently listed region. Add more questions in the order you intend to ask them.
3. Reorder or remove questions. Record an asked state or a reply as a manually entered note. Replies have no implied source-validation or physical-access status.
4. Search, filter by missing local data or unanswered questions, and navigate pages of ten items.
5. Export a plain-text handout with private notes **excluded by default**. Select the checkbox if you deliberately want to include private notes in that handout. JSON backup always contains the complete working sheet and requires an explicit click.
6. Choose **Print handout** for an explicit browser print action. The print surface uses `textContent`; it cannot interpret imported HTML.
7. To restore an earlier backup, paste JSON, choose **Preview import**, review the added/removed/edited/moved questions and affected reply records, and then explicitly apply or cancel. The preview does not print private reply text. Invalid input leaves the current sheet untouched.

## Provenance, safety, and bounded data

Each linked cell carries the current manifest's source, licence and date. The local data state is `saved` only if the inventory has a matching present record and the stored source, licence, bytes and date agree. Stale, missing, unreadable, conflicting, unlisted and unavailable observations yield `UNKNOWN`. Neither `saved` nor a user's reported reply establishes access at a real-world site. There are no synthetic place records, agency endorsements, location claims, external APIs, tracking, timers, or on-device background persistence.

The versioned `offline-question-sheet-v1` JSON schema accepts at most 120 questions and 131,072 bytes. Imported objects must have exactly the allowed keys, unique stable IDs, ordered positions, a matching region, valid topics, priorities, and reply states. Replies require text; unasked or merely asked questions cannot carry a recorded reply. Control characters and directional overrides are excluded. Title and question text are bounded to 400 characters; personal notes and replies are bounded to 1,200 characters.

## Localization and UI

All controls are native HTML inputs, selects, buttons and labelled textareas, with 44 px minimum touch targets. Dynamic changes are announced in a polite live status. English and French have matched keys, curly French apostrophes and nonbreaking punctuation. Physical-condition status is always the untranslated token `UNKNOWN`. The optional panel returns a cleanup callback that unsubscribes from the dashboard, removes all event listeners, and removes the UI. The deferred launch also protects against asynchronous module resolution after a panel has been closed or the dashboard has been disposed.

## Build budget and deployment

The service worker includes the question sheet in the first install. The dashboard imports its module when the user opens the sheet, so someone who installed the app online can open it for the first time offline. The production build counts the emitted chunk toward the 4,718,592-byte install budget and the 524,288-byte per-entry cap.

## Testing

Unit tests cover immutable edits, stable IDs, priorities, ordering, reply-state validity, privacy-sensitive export, exact import schema and reference constraints, duplicate keys, unsafe labels, source conflicts, bilingual templates and punctuation, deterministic difference previews, pagination, and hard-fail behaviour. Wiring tests assert that the existing dashboard panels remain mounted and properly disposed, while this optional feature is loaded on explicit interaction only.
