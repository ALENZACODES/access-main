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
- `validateRules` reports an overlap whichever order the rules are listed in: two rules of different purposes overlap when either can match a key the other matches.
- `live.ts` is the App's own gate. It holds one purpose, `route-reports`, with the rule for `access.routeReports.v1`. `liveStorage()` reads the person's choice again on every write, and `saveGated()` returns `saved`, `needs-choice`, `declined` or `no-storage`.
- Wired so far: the route reports page saves through the gate and tells the person which of the four happened (the strings are in `hub/i18n.ts`), and the About page passes the purpose to the panel so the person can agree or decline there. Not wired: the other keys the App writes (preferences, corrections queue, peer requests, language, map tiles). Those belong to other lanes and are not gated.
- `refusedSection.ts` adds a "Not saved" section to the panel. It lists feature names and counts for the writes the gate stopped, never keys or values, and shows nothing when the list is empty. The controller takes `refused: () => list`; the About page passes `liveRefused`, the in-memory list `saveGated` fills (cleared on reload). The hub DOM test file cannot run in this environment (it fails on main too), so the page change is covered by the `live.ts` unit tests only.
- Withdrawing: the controller takes `withdrawRules` (the gate's rules). When given, choosing "do not allow" also removes what that feature saved, using `removeForPurpose`, and the status says how many items went (`consent-withdrawn`). Without it the data stays and only new saves stop. The About page passes `LIVE_RULES`, so declining "Keep my route reports" there removes the route reports saved on this device. Other keys are not gated, so declining never touches them.
- `storageRegister.ts` lists every storage key the App's source uses, with a plain description in EN and FR, and whether saving it goes through the gate. `audit/storage.repo.audit.test.ts` scans the source tree and fails if a key has no row, or a row has no key. The scan finds constants whose name ends in KEY, literals passed to `getItem`, `setItem` or `removeItem`, and `${PREFIX}name` constants. It cannot find keys built at run time or set inside another package; those go in `UNSCANNED` by hand (the connection request store is there, with its key UNKNOWN).
- Finding recorded 2026-11-19: the panel used to act only on names that start with `access.`; the preferences, corrections queue, data status and map tile keys did not start with it, so Download and Erase missed them. `dataScope.ts` fixes most of that: a scope is the prefix plus exact extra names (`extraKeys` on the controller), and Download, Erase and Restore cover both. Names are exact, never patterns. The register marks each key `reach: "panel"` or `"elsewhere"`; only the map tile list is "elsewhere", because its tiles live in the browser cache and erasing the list alone would orphan them. `outsideSection.ts` lists what is still not reached, and `liveControllerDeps()` supplies `extraKeys` from the register. The stored-items table still lists the prefix only.
- `liveController.ts`: `liveControllerDeps()` returns the prefix, purposes, gate rules, refused list and outside list in one object, and `checkLiveControllerDeps` reports any disagreement with the register. A page that builds the panel can spread it into its controller settings. The About page does not use it yet; that edit belongs to the shell lane, and until it is made the About panel does not show the outside section or the refused list.
- `registerExport.ts`: the register as CSV or plain text in EN and FR (item, whether saving needs the person's choice, whether Erase reaches it, source, date). Key names are not written. Nothing offers it as a button yet.



## Caches and databases (P10Q)

`storageRegister.ts` lists the localStorage keys the App's code uses. `deviceRegister.ts` does the same for the
other two places a page can keep things: Cache Storage and IndexedDB. Each row is a name (one exact name, or a
prefix that ends in a hyphen because the code adds a version after it), the file that names it, what it holds in
both languages, a source and a date.

- `../audit/deviceStorageScan.ts` reads the source for cache and database names (constants called `…CACHE`,
  `cachePrefix: "…"`, a `PREFIX` constant beside a `cacheName` function, `caches.open("…")`, `databaseName = "…"`,
  `…DB` constants and `indexedDB.open("…")`). `device.repo.audit.test.ts` fails when the source names one that has
  no row, when a row is no longer backed by the source, and when a row points at the wrong file. Names built at
  run time cannot be read from the source and are not found; `packages/` is not scanned.
- `deviceKnown.ts` is the panel section shown after "Check this device". It pairs each name the browser reports
  with its row. A name with no row is shown as unknown and nothing is guessed. It also says whether the clear
  button, with the prefixes it was given, would remove that name. It appears only when the controller is given
  `device` and `deviceRegister`; `liveControllerDeps()` supplies the register.
- `keptExport.ts` writes "everything the App keeps on this device" as CSV or text: every localStorage item, every
  cache and database the App's code names, and storage whose name could not be read. Each line says where it is
  kept, whether saving it needs the person's choice, whether Erase reaches it and whether the offline storage
  button does. A cache or database line never claims a consent check: it says "Not confirmed". The controller
  offers the two download buttons when it is given `kept`; `liveControllerDeps()` supplies it.
- Not covered: cookies and the browser's own storage are still only listed by name; Playwright e2e was not run.

## Browser features (P10R)

`featureRegister.ts` lists what the App asks of the browser: the features its code uses (a background page for
offline copies, space checks, a request to keep offline data, copying text you chose, saving and reading files,
printing, reading the language and display settings) and the powerful ones it does not use (location, camera and
microphone, notifications, reading the clipboard, background sends, cookies, device connections, sensors, stored
sign-in details). Each row says whether the browser asks the person first; what the App has not confirmed is
UNKNOWN.

- `../audit/featureScan.ts` holds the patterns that show each feature in the source. `feature.repo.audit.test.ts`
  fails when a feature the register says is unused appears in the source, when a used row is no longer backed by
  the source, when a row names the wrong file, and when a header claim is not in the header file. Tests, comments,
  the audit folder and the network guard's own wrapping of the background send are skipped.
- `permissions.ts` asks the browser what it has allowed, only when the person presses the check button, and only
  reads. A browser that has no permission query, rejects the name or gives an answer the App does not know is shown
  as unknown, never as a guess.
- `featureSection.ts` shows two tables, "Used by the App" and "Not used by the App", and the check button. The
  controller shows it when given `features`; `liveControllerDeps()` supplies the register and the page's browser.
- Not covered: whether the site a person uses really sends the header settings (not checked); features reached
  by a name built at run time; `packages/`; Playwright e2e was not run.

## Addresses, network requests and counts (P10S)

`addressRegister.ts` lists the web hosts the App's own code names (each marked as a page a person can open or a name inside a data format that is never contacted) and the files that make network requests, with where each request goes. A destination chosen by data, such as the offline map pack's file addresses, is `UNKNOWN`. `audit/addressScan.ts` reads the source and `audit/address.repo.audit.test.ts` fails when a host or a request appears, goes or moves without a row. Calls made through a name the code passes around are not found by the scan. Test scripts (`*.node.mjs`), the privacy folder's own code and the network guard in `egress.ts` are not scanned.

`addressSection.ts` and `addressExport.ts` show and download those rows. `glance.ts` and `glanceSection.ts` count the rows of the storage, offline storage, browser feature and address lists into one short summary; a figure for things the App has not confirmed is shown as unknown, never as a yes or a no. Both sections are switched on by the controller options `addresses` and `glance`, and the live controller sets them.

## Record of choices, statements about data (P10T)

`receipt.ts` and `receiptSection.ts` build a record of the person's optional choices from the stored answers, the gate's rules and the App's own list of what it saves: the answer and its date, what the choice lets the App save, what is saved now, and what a no does. An answer given under older wording is shown as asked again, with its earlier date. The controller option is `receipt`.

`statementRegister.ts` lists the files whose text says that data stays on the device or is not sent, with how many lines say it in each language. `audit/claimScan.ts` reads the source and `audit/statement.repo.audit.test.ts` fails when a statement appears, goes or changes count without a row. Only lines that hold a quoted string are read, and statements worded some other way are not found. The only check set beside each row is whether the file that holds the statement makes a network request itself (from `addressRegister.ts`). Code in other files is not covered, so a pass is not proof that a statement is true, and a file that does make requests, or a row checked without the list of requests, is shown as unknown. The controller option is `statements`. The counts section includes both.

## Links that open another app (P10X)

`handoffRegister.ts` lists the links in the App that open another app: an email draft, a place in a maps app and a help-line number in a dialler. Each row names the kind of link, the file that makes it, how many places in that file make one, which app opens and what the App passes on. `audit/handoffScan.ts` reads the source and fails CI when a link appears, goes or changes count without a row. It also finds navigation to an address built at run time (`location.assign`, `window.open` and the like), which has no row and so fails. A variable called `location` is not a hand-off.

`handoffLink.ts` reads a mail, phone, text or map link and says what it carries: the addresses and the length of an email, the digits of a number, the place and how many decimal places it is written to. `audit/handoff.behaviour.audit.test.ts` builds the real links and checks that they carry what the register says, and `audit/fuzz.handoff.audit.test.ts` runs the reader and the builders over generated text.

`handoffSection.ts` shows the list in the panel and offers it as a CSV or text download (`export-handoff-csv`, `export-handoff-text`). The controller option is `handoffs`; the live controller passes `HANDOFF_REGISTER`. Nothing here opens a link or contacts anything.

Known issue, outside this lane: `mailtoHref` in `states/visitMessage.ts` throws a `URIError` for text with a lone surrogate, which a place name from the data could hold. `fuzz.handoff.audit.test.ts` pins that behaviour and will fail when it is fixed.
## How long things are kept (P10W)

`retentionRegister.ts` lists, for each name the App stores under, what it holds and what the code that saves it sets: a number of days before it expires, a limit on how many items, or a limit on size, each pointing at the constant it was read from. A row with no limit says so, and the store the scanner could not read stays `UNKNOWN`; it is never shown as having no limit. `validateRetention` checks the list against the storage register, the unscanned list and the panel's own names.

`audit/retentionScan.ts` reads the source and compares each number with the constant it names, finds limit-like constants no row claims, files that name a key but are not listed, and files that call `putExpiring` and are in no row. `audit/retention.repo.audit.test.ts` runs it against the repository and has mutation tests.

`retentionSection.ts` renders the list in the panel and as a CSV or text download (`export-retention-csv`, `export-retention-text`). `retentionLive.ts` compares the list with what is stored on this device now: a value with no end date, kept longer than listed, over its limit, or not readable (`check-retention`). Values past their end date are removed when the panel opens, so they are not reported. The controller option is `retention`; the live controller passes `RETENTION_REGISTER`. The comparison reads storage and writes nothing.

## What a web address can carry (P10Y)

`queryRegister.ts` lists the names the App reads from, or builds into, the part of a web address after the question mark: a place on the map (`near`, `lat`, `lon`), typed words (`q`), picked places (`ids`, `place`), the choices and layout of the pages that filter and sort, a language and a kind of download. Each row says what the name holds, which file reads it and which builds it, how many places in that file do so, and the limit on length where the code sets one (with the constant it comes from). Names the code builds at run time cannot be read by the scan, so they are rows of their own: the facets of the offline pack list and the stale-days thresholds list the names they can take, and the data page's layout row lists the names its helper functions set. A call that only looks like one, such as the key added to a stored map file, is in `NOT_QUERY` with its reason.

`audit/queryScan.ts` finds the calls (`get`, `getAll`, `has`, `set`, `append`) on a query receiver and compares them with the rows in both directions, place by place. It also compares each limit with its constant and each listed set of names with the array in the source. A name read some other way, such as a regular expression over `location.search`, is not found, and the list says nothing about it. `audit/query.repo.audit.test.ts` runs the scan against the repository and has mutation tests; `audit/query.behaviour.audit.test.ts` runs the App's own filter, facet, layout and threshold builders and parsers, so a name the code builds without a row, or a limit that no longer cuts, fails there.

`querySection.ts` renders the list and the CSV and text downloads (`export-query-csv`, `export-query-text`). `queryLive.ts` reads the address of the page being shown (the controller option `address`, for example `() => window.location.search`; the live controller defaults to the page it runs in) and says what it carries: a place, typed words or picked places; a name no row lists, which is reported as unknown and never as fine; a value longer than the code reads. It names the parameter and never repeats a value. It reads one string and writes nothing: the address is not changed, kept or sent. The controller option is `queries`; the live controller passes `QUERY_REGISTER`.

What a browser keeps, and what happens to an address after it is copied or shared, is outside the App and is not known here, so no row and no sentence says it.

## What the App asks your browser (P10AD)

`browserRegister.ts` lists the places where the App asks the browser a question about the device or its settings, or makes something on the device: the language the browser is set to, whether it says it is online, two display settings (more contrast, less motion), how much storage space is used and whether the browser promised to keep it, a few privacy and secure-connection settings, a random identifier, and a number written in the browser's own language. Each row has a kind, the file, how many places are in it, what is asked and what the answer is used for, in English and French. The list holds 25 rows at 36 places in 19 files, in the web app and in the packages.

`audit/browserScan.ts` finds those calls in the source and compares them with the rows in both directions, kind by kind and file by file. A new question to the browser, or a row whose file no longer asks it, fails `browser.repo.audit.test.ts`. The scan reads text, not a syntax tree: a call written some other way (a name held in a variable, say) is not found, so the audit shows the list matches the calls it can recognise, not that there are no others.

`browser.behaviour.audit.test.ts` checks what the code does around them: only two display settings are asked, no reading that tells one device from another (browser name, screen size, time zone, referrer and the like) appears anywhere, the browser is asked to keep storage only in `offline/robust/storageDurability.ts`, and no line both reads the language, online state or storage and sends something. A made-up element id built from `Math.random` is allowed by name; a made-up identifier elsewhere is not.

`browserSection.ts` renders the list in the panel and as CSV and text downloads (`export-browser-csv`, `export-browser-text`). `browserLive.ts` asks the browser the six questions now, when the person presses the button (`check-browser`), and shows the answers in the panel: the language, online or not, the two settings, the space used and allowed, and whether the browser promised to keep it. A question the browser does not answer, or answers oddly, stays Unknown and is never turned into No. Nothing is stored, sent or logged by that button; the answers live only in the panel until the page is closed. The controller option is `browser`; the live controller passes `BROWSER_REGISTER` and `browserHost()`, which asks only those six questions and never asks the browser to keep storage.

What the browser does with the same questions on its own side is outside the App and is not known here, so no row and no sentence says it.
