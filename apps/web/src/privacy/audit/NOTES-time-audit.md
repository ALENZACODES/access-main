# Time audit (P10-tm)

Separate from the shared panel README on purpose. It describes the audit in `apps/web/src/privacy/audit/tm*`.

## What it is

A reader of source text that finds where the App's code reads the clock, writes a time into text, or answers in the device's time zone, and behaviour tests of the privacy code that writes times. It reads text and runs real functions on times and zones written in the tests. It does not run a browser.

| File | Job |
| --- | --- |
| `tmMask.ts` | Blanks comments, strings and regex bodies; keeps code in `${ }`. |
| `tmScan.ts` | Finds sites: clock reads, fine timers, written times, time zone reads, local getters, formats. |
| `tmRules.ts` | Turns sites into findings (seven codes). |
| `tmRegister.ts` | The accepted rows (path, code, count, reason) and the known folders. |
| `tmCompare.ts` | Findings against rows, both ways, plus unlisted and stale folders. |
| `tmReport.ts` | Plain-text report. |
| `tmText.ts` | Finds times in written text; precision and zone of each. |
| `tmCopies.ts` | Takes a function's text out of the source and compiles it, to run every copy. |

## Rules that pass today

- **No time zone read anywhere.** No `getTimezoneOffset`, no `resolvedOptions`, no `timeZone` option other than `"UTC"`. This cannot be accepted by a row.
- Everything the privacy code stores or exports as JSON (expiry envelopes, activity log, refusal log, device scan, permission states, local data export, stored consent) is UTC text with `Z`, no offset, and is the same text in every zone tried (UTC, Toronto, Kolkata, Kiritimati, St John's, Pago Pago).
- Expiry adds whole 24-hour days in milliseconds, so it does not move with a change of clock (checked across the 1 November change in Toronto).
- The three downloadable register lists (offline workers, browser questions, addresses) hold dates only, no time of day, and the same content in every zone and both languages.
- All 20 copies of `localDate` in the privacy folder give the date of the device, the same as an independent way of writing it, on 15 chosen moments in 6 zones and on 400 moments across a year in 2 zones.
- A new clock call or written time in a folder not on the known list, or in the privacy folder without a row, fails the audit.

## Known findings (recorded as tests; each fails when the code changes)

1. **File name date is local, content date is UTC.** An export made at 23:30 in Toronto is named `…-2026-11-21.json` and holds `exportedAt` on 2026-11-22. The same moment gives different file names in different zones, and the pair (name date, UTC date) narrows the zone to one side of midnight. Only the file name depends on the zone.
2. **Twenty copies of one function.** `localDate` is written out again in 20 files of `privacy/panel` (with a 21st way of the same thing in `controller.ts`). They agree today; nothing keeps them agreeing.
3. **Two meanings of "today".** The privacy code writes today's date in the device's zone; other folders write it as `toISOString().slice(0, 10)`, in UTC. In the evening in Toronto they differ by a day.
4. **Full precision.** What is stored and exported as JSON keeps the time to the millisecond (the activity log, expiry envelopes, refusal log, device scan, consent records), and the profile export shows the time of withdrawal to the millisecond. Nothing coarsens it.
5. **Time in identifiers.** Three places write the time of the call into an identifier (`hub/RouteReportsPage.tsx`, `offline/robust/contingencyPanel.ts`, `offline/robust/localEvidenceTimelinePanel.ts`), the last with a full ISO time.
6. **Fine timers.** Three panels in `narrow/` time what the person does with `performance.now()`.

None of these is shown to be a leak. They are what the code does, written down so a change is seen.

## Not checked

- A real browser, or what a person's device answers for its zone. The tests set the zone of the Node process.
- What the page passes in as the time (the click time, to the millisecond, is passed by the provider and was not run).
- Where a time that is written into an identifier or a store goes afterwards.
- Other lanes' files were read and tested, not changed. The rows for them say only what was read in the lines named.
