# Privacy panel

Builds on `../onDeviceNotice`. Everything here is local to the browser; nothing
is sent anywhere and no third-party code or data is used.

- `inventory.ts`: the list of what the App keeps. Each entry has a source (EN +
  FR), a record date and an optional licence. A missing `where`, `purpose` or
  `keptFor` is shown as unknown, never filled in. `createPrivacyController`
  throws at start-up if the list breaks a rule (bad id, bad date, blank text,
  banned wording, French typography).
- `copyLint.ts`: wording and French typography checks. `strings.lint.test.ts`
  runs them over every shipped string in both languages, so a regression fails
  the normal test run. Banned: overclaims (verified, real-time, certified,
  guarantee), partnership claims, AI wording, "AAA", eligibility wording.
- `localData.ts`: export and erase only the keys under one prefix. Erase checks
  each key is really gone and reports any that are not.
- `controller.ts` + `panel.ts` + `mount.ts`: the panel (language, table, download,
  erase with confirmation, polite status). Buttons and language options are at
  least 44 x 44 px. Below 40em (including 320px) the inventory table reflows into stacked cards, so it does not overflow and does not use a tabindex scroller.

Not covered by tests: `adaptElement` and `browserDownload` need a real browser.

Wiring: AboutPage mounts the panel. The caller passes the real
inventory, the App's storage prefix and a container, e.g.

    mountPrivacyPanel(adaptElement(el), createPrivacyController({ storage: safeLocalStorage(), prefix, inventory, now: () => new Date() }), { onExport: browserDownload });

and `apps/web/src/privacy/index.ts` should add `export * from "./panel";`.
Run: `vitest run apps/web/src/privacy`.

## Consent, expiry and audits (P10D)

- `consent.ts`: optional features are off until the person decides. Each choice
  is stored on this device with its date and wording version; a changed wording
  makes it undecided again. Feature code asks `isAllowed(state, purpose)`, which
  is true only for a current "granted". Erasing local data resets every choice.
- `expiry.ts`: `putExpiring` stores a value with an expiry date. The controller
  removes expired items at start-up and says how many. Values without an expiry
  are never removed: their lifetime is unknown, not assumed.
- `../audit/htmlAudit.ts`: static HTML audit (names, Label in Name, 44 px targets,
  headings, tables, ids, outside URLs, inline handlers). A target size that
  cannot be read from the markup is a violation, not a pass.
- `../audit/parity.ts`: EN and FR tables must match in shape, digits and placeholders.
- `../audit/repoAudit.ts` + `exemptions.ts`: repository rules over `apps/web/src`
  and `.github/workflows` (outside organisation name, third-party tile and tracker
  hosts, secrets, plain http, scheduled workflows, claim wording in copy files).
  An exemption needs a reason and a date and is reported if it goes stale.

CI: `panel.audit.test.ts`, `parity.audit.test.ts` and `repo.audit.test.ts` run
with the normal `vitest run`. `repo.audit.test.ts` reads the whole source tree
(read-only), so it fails on any existing violation elsewhere in the app until it
is fixed or listed in `exemptions.ts` with a reason.

## Stored items, activity, changes, downloads and the page (P10E)

- `reconcile.ts`: compares what is stored under the App's prefix with the data
  list. Entries name their storage with `storageKeys` (a trailing `*` matches a
  prefix). Items the list does not describe are shown as such; on-device entries
  that name no key are reported as unmatchable, never as fine. Contents are never
  read into the result, only names, sizes and expiry dates.
- `ownEntries.ts`: the panel's own storage is described in the same list, only
  for the features that are switched on. Ids starting `privacy-` are reserved.
- `activityLog.ts` (`logActivity: true`): a local list of the person's own privacy
  actions, newest 50, expiring 90 days after the latest one, removed on erase.
- `changes.ts` (`trackChanges: true`): remembers the last list marked as seen
  (fingerprints and labels, 365 days) and shows what was added, changed or
  removed. The first time nothing is compared.
- `inventoryExport.ts`: the data list as CSV (formula-safe, `;` in French) or text.
- `route.ts` + `page.ts`: `#/privacy` and `#/confidentialite`. `installPrivacyRoute`
  shows or hides the panel, sets the document title and language, moves focus to
  the heading on arrival and restores title, language and focus on leave.
  `renderPrivacyLinkHtml(locale)` gives the shell a 44 px link.

Shell wiring, one call at start-up (the host and container are your window and
the element that holds the page):

    installPrivacyRoute({ host: window, container, onExport: browserDownload,
      createController: () => createPrivacyController({ storage: safeLocalStorage(),
        prefix, inventory, purposes, logActivity: true, trackChanges: true,
        now: () => new Date(), languages: navigator.languages }) });

CI: `storage.audit.test.ts` fails if the panel stores anything its data list does
not describe; `panel.audit.test.ts` now also audits every new section and each
step of the live panel; `parity.audit.test.ts` covers the new copy.
