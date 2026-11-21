# Access inquiry planner

This browser-local, user-directed tool helps someone collect practical questions to ask about an Ontario venue or service before an outing. It is an inquiry aid, not an assessment of an individual's needs or a claim about any place's condition. Every physical-condition field remains the literal `UNKNOWN`, even when a person notes a reply. The notes record what someone said, not a current statement by the application.

## Workflow

1. Open the planner explicitly on the existing offline dashboard.
2. Add the name and area of a venue or service, and optionally a planned date.
3. Choose from question prompts about entrances, indoor routes, washrooms, arrival and pickup, transit, seating, communication, service changes, and alternatives. Custom questions may be added instead.
4. Record what was asked and any reply or follow-up information manually. Dates and channels are user-provided. A saved note does not change a physical condition from `UNKNOWN`.
5. Filter, search, and paginate the questions. The UI separates a recorded reply from an unanswered question and marks essential questions that still need follow-up.
6. Export JSON or plain text only on an explicit click. A privacy warning states that exports can contain personal notes. Import is bounded and checks the complete record schema.

The question catalogue provides reusable questions, not answers. It never performs network requests, initiates downloads, runs periodic checks, reads external accounts, or changes offline pack bytes. A page refresh clears the unsaved memory-only book.

## Data and fail-safe rules

The versioned `access-inquiry-book-v1` envelope contains places, questions, and chronological note events. Places require an identifier, label, area and explicit timestamps. Questions reference an existing place; events reference an existing question. Every file is checked for missing references, repeated IDs, invalid dates and times, unsupported states, future source dates, excess text, and record counts.

A stored reply is not proof that a venue is suitable or that equipment or services will work for a specific person. Unknown conditions do not become known through import, manually entered notes, or repeated export. The tool does not provide medical guidance, eligibility conclusions, bookings, or warranties.

## Accessibility and localization

The panel uses native labels and buttons, minimum 44 CSS-pixel targets for controls, a polite status announcement, and an explicit close action. An expanded panel remains usable by keyboard. English and French have matching copy keys. French prose uses curly apostrophes and correct nonbreaking punctuation spacing. `UNKNOWN` is never translated.

## Integration and budget

The existing dashboard calls `import("./accessInquiryPanel")`, keeping this panel outside the initial offline entry chunk. A disposal guard prevents asynchronous mounting after unmount; the returned cleanup removes event listeners and its model subscription. The public barrel exports the model, copy, report API, and `accessInquiryPanel` mount. The dashboard mounts the panel through a deferred import to keep it outside the initial offline entry chunk. Existing offline mounts and their teardown remain unchanged.

Neither per-file nor total precache limits should be adjusted. Actual budget compliance must be measured with the repository's production build and precache checker, including the 524,288-byte per-entry limit.

## Regression coverage

Tests cover the template catalogue, deliberate user transitions, foreign-key integrity, schema validation, invalid timestamps, capped arrays and files, note-order constraints, privacy-safe output, deterministic JSON serialization, source date retention, bilingual copy, pagination, selected-place filtering, stable priority ordering and late-mount disposal wiring.
