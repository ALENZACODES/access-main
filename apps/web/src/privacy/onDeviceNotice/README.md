# On-device data notice (privacy)

`renderOnDeviceNoticeHtml({ locale, items, reviewedOn?, showDismiss? })` returns
a plain EN/FR section saying, per item, whether data stays on the device, is
sent to a server, or is not known. This folder holds no data list: callers
supply the items, and an item with no `where` is shown as unknown, never
assumed. `reviewedOn` is shown only if it is a YYYY-MM-DD date. The dismiss
button is at least 44 x 44 px. No third-party code or data.

Notice strings live in the shell catalogs (`apps/web/src/i18n/en.ts` and
`fr.ts`) under `privacyNotice`, so the Day 24 typography and banned-term sweep
covers them. `aboutNoticeItems()` is the About page inventory: profile, cached
records, contribution export drafts, language choice, and optional
geolocation, each kept on this device.

Entry point: `index.ts` in this folder (the test imports through it). The
helper is also re-exported from `apps/web/src/privacy/index.ts`.
