# Saved help numbers

Shows the `help_numbers` stored in the Toronto pack on the help page, as copies, with a way to
search them, save them and save a check for gaps. It is built from what the pack holds. It does not
dial, link, fetch, rank or say that a line is open.

## Files (apps/web/src)

| File | What it does |
| --- | --- |
| `states/packUrl.ts` | `readHttpsLink`: keeps an https address of at most 500 characters with a host. |
| `states/packHelp.ts` | `parseHelpNumbers`: reads own keys only; counts records it cannot read; missing parts stay null. |
| `states/helpContact.ts` | Reads a number's digits, groups and kind; `spokenContact` says it digit by digit in English or French. |
| `states/helpText.ts` | `pickText`: the page's language, else the other one, and says which. |
| `states/helpView.ts` | Search (both languages, digits, id), sort (pack order or name), announcement. |
| `states/helpAudit.ts` | `auditHelp`: missing parts, copies older than 180 days, a date after today, one number under two ids. |
| `states/helpCopy.ts` | English and French words; no claim of verification, availability or storage. |
| `states/helpExport.ts` | CSV (UNKNOWN for missing, formula guard) and text. |
| `states/HelpNumbers.tsx` | The section. Tools are closed by default and add no heading. |
| `pages/HelpPage.tsx` | Reads `getPack("toronto")` and mounts the section after the articles. |

## Rules kept

- The pack's order is the default, so 911 stays first. Search never reorders; only the person's own "by name" choice does.
- A number is shown exactly as the pack writes it. Text that is not a number (letters, words) is not shown as one.
- No `tel:` link is made and addresses are shown as text.
- Unknown parts are written UNKNOWN. The licence UNKNOWN stays UNKNOWN.
- The check for gaps reads the saved copy only. It cannot tell whether a number still works.

## Tests

`packHelp`, `helpContact`, `helpView`, `helpAudit`, `helpCopy`, `helpExport` unit tests; `HelpNumbers.dom.test.tsx`
(axe, both languages, saving); `pages/HelpPage.helpNumbers.dom.test.tsx` (mocked `getPack`); `help.source.test.ts`
(no tel/mailto/geo, no fetch or storage, no markup injection); `help.fuzz.test.ts` (seeded, 600 lists).
