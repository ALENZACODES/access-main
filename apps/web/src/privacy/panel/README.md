# Privacy panel

Builds on `../onDeviceNotice`. Everything here is local to the browser; nothing
is sent anywhere and no third-party code or data is used.


**What the App uses today.** Only `createPrivacyController` and `mountPrivacyPanel`,
with the data list, on the About page. Everything else in this folder is code that
no part of the App calls yet: `installPrivacyRoute` and the `#/privacy` and
`#/confidentialite` routes, the network guard, the CSP builder, the consent
helpers and, where present, `assertPolicy`. The sections below say how a shell
would call them; they do not say that it does.

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
  least 44 x 44 px. Below 40em (including 320px) the inventory table reflows into stacked cards, so it does not overflow and does not use a tabindex scroller. Column names are in the DOM as a span in each cell, so screen readers still get them when the header row is hidden.

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

## Network guard, restore, support summary, printable page, CSP and plain language (P10F)

All of it is reached from the privacy route. In the shell:

```ts
installPrivacyRoute({
  host: window, container,
  guard: { host: window, policy: createEgressPolicy({ selfOrigin: location.origin, allowedOrigins: [] }),
           storage: safeLocalStorage(), prefix: "app." },
  createController: () => createPrivacyController({ /* as before */, egress: policy }),
});
```

- **Network guard** (`egress.ts`, `egressLog.ts`): fetch, XMLHttpRequest, sendBeacon,
  WebSocket and EventSource calls to any address other than the App's own or a
  listed https origin are refused. Only the host is recorded (never path, query or
  body), as counts, for 30 days. The panel shows the allowed addresses and the
  stopped requests. It does not cover images, scripts or stylesheets the page
  loads itself: that is the Content-Security-Policy's job. It also cannot stop
  code that captured `fetch` before the guard was installed, so install it first.
- **CSP** (`csp.ts`): `buildCsp` makes a strict policy; `auditCsp` judges any
  policy. The `weak-csp` rule in `repoAudit.ts` runs it over any policy set in an
  HTML meta tag, `_headers`, `netlify.toml` or `vercel.json` under the scanned
  folders, so a weaker policy fails CI.
- **Restore** (`importData.ts`): reads a file from "Download my data". The file is
  checked completely first (format, version, prefix, 1 MB, 200 items, 200 kB per
  value, key names). Nothing is written until the person confirms; a failed write
  is rolled back.
- **Support summary** and **printable page**: names, sizes and choices only, never
  contents. The printable page is a standalone offline HTML document; its CSP
  allows only its own inline style.
- **Plain language** (`plainLanguage.ts`, `audit/copyCorpus.ts`,
  `audit/plain.audit.test.ts`): every shipped string and the visible text of the
  live panel must stay under 25 words per sentence, free of listed jargon and
  within a reading-level limit (English Flesch-Kincaid grade 9 or lower; French
  Kandel-Moles 50 or higher). These are heuristics: syllables are counted by
  rule, not from a dictionary. They catch dense text; they do not grade quality.
- New audits: `more.audit.test.ts` (lint, EN/FR parity, HTML audit of each new
  state), `document.audit.test.ts` (whole-page audit), `storage.more.audit.test.ts`.

## Browser signals, offline storage and protected copies (P10G)

Three more sections on the privacy page. Each appears only when the shell gives
the controller what it needs, so the page never shows something the App cannot do:

```ts
createPrivacyController({
  /* as before */
  signals: window,                                            // browser signals
  device: { host: window, cachePrefix: "app-", dbPrefix: "app-" }, // offline storage; removal only under these prefixes
  crypto: window.crypto,                                      // protected copies
});
```

- **Browser signals** (`signals.ts`): Global Privacy Control, Do Not Track, cookies
  allowed, secure connection, persistent storage and space used. Each is Yes, No or
  Unknown; a browser that does not answer gives Unknown, never No. This page only
  shows what the browser reports. It does not say what the App does with them.
- **Offline storage** (`deviceStorage.ts`): names of Cache Storage entries,
  IndexedDB databases and cookies a page can read; never contents. Removal covers
  caches and databases whose names start with a configured prefix, after a
  confirmation. There is no "remove everything" and cookies are never touched.
  A browser that cannot list something shows Unknown.
- **Protected copy** (`protectedBackup.ts`): PBKDF2 (SHA-256, 310,000 iterations)
  and AES-GCM through WebCrypto. The prefix and iteration count are covered by the
  integrity check; a file that asks for fewer than 100,000 iterations is refused.
  The passphrase is used once and never stored, logged, shown or exported. A
  forgotten passphrase cannot be recovered, and a wrong passphrase cannot be told
  apart from a damaged file. Opening a protected file goes through the same
  check-then-confirm restore as a plain file.
- `controller.dispatchAsync` runs the actions that wait for the browser. The
  mount code reads the signals once when the panel opens.
- New audits: `device.audit.test.ts` (wording lint, EN/FR parity, HTML audit of each
  new state, passphrase never stored); the plain-language audit now also covers
  the new copy and the live panel with all three sections on.

## Upload policy and claim wording (P10H, partial)

- `egress.ts`: a policy now has `allowUpload` (default false). Reads (GET, HEAD, OPTIONS) to a listed origin are allowed; sends (other methods, beacons, WebSockets) are blocked with the reason `upload-blocked`, reporting only the host. The App's own origin is not affected.
- `claims.ts`: words that suggest a service the App does not have (account, server, sync, cloud, upload, telemetry; FR equivalents) are allowed only in the exact approved sentences.
- `policy.ts`: `checkPolicy` / `assertPolicy` compare the declared no-server policy with the data list, the purposes and the network guard. Nothing calls `assertPolicy` yet; a shell would have to call it at start-up.

## Consent-gated storage (P10I)

- `consentGate.ts`: `gateStorage` wraps a storage so a key that belongs to a purpose is saved only while the person has agreed to that purpose under its current wording. Reading, listing and removing are never blocked. Refused writes are kept as key names and a reason (`no-choice` or `declined`), never values. `validateRules` catches an unknown purpose, an empty key, a duplicate or two purposes claiming one key. `removeForPurpose` deletes what a purpose saved when the person withdraws.
- Nothing in the App wraps its storage with the gate yet, and the panel does not yet list refused writes. A shell would build the gate once and pass it to the features that save things.
