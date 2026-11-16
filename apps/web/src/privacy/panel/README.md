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
  least 44 x 44 px; the table scrolls by keyboard.

Not covered by tests: `adaptElement` and `browserDownload` need a real browser.

Wiring: AboutPage mounts the panel. The caller passes the real
inventory, the App's storage prefix and a container, e.g.

    mountPrivacyPanel(adaptElement(el), createPrivacyController({ storage: safeLocalStorage(), prefix, inventory, now: () => new Date() }), { onExport: browserDownload });

and `apps/web/src/privacy/index.ts` should add `export * from "./panel";`.
Run: `vitest run apps/web/src/privacy`.
