# On-device data notice (privacy)

`renderOnDeviceNoticeHtml({ locale, items, reviewedOn?, showDismiss? })` returns
a plain EN/FR section saying, per item, whether data stays on the device, is
sent to a server, or is not known. This folder holds no data list: callers
supply the items, and an item with no `where` is shown as unknown, never
assumed. `reviewedOn` is shown only if it is a YYYY-MM-DD date. The dismiss
button is at least 44 x 44 px. No third-party code or data.

Entry point: `index.ts` in this folder (the test imports through it). It is
not yet re-exported from `apps/web/src/privacy/index.ts` because that file was
not visible when this was written: add
`export * from "./onDeviceNotice";` there.
