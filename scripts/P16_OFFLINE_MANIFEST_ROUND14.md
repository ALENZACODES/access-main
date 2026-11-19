# P16 Round 14 — offline record and bilingual attribution contracts

Base: `ALENZACODES/access-main` at `3cc05b65dfb48582dfd3096559cf33c5c1173b68`.

This is an additive, dependency-free chunk. It does not modify the application,
change package metadata, install workflows, or alter the existing DOM-ID tests.
Only the two new `.mjs` files and this README belong to this patch.

The module treats a record as untrusted data. It validates the explicit English
or French language, title and description, declared availability and tier,
source name, HTTPS URL, licence, collection date, and offline-cache state.
An unknown status cannot inherit a higher tier. Cache paths must be local,
not traversal paths or network URLs. A bilingual manifest can require both
languages while retaining independent attribution for each record.

The audit never fetches a URL, translates text, updates a cache, or changes its
input. Its diagnostics contain stable codes and paths, not content taken from
source records. The inventory is metadata-only and sorted for review.

Run the focused checks from the repository root:

```sh
node --check scripts/p16-offline-manifest-round14.mjs
node --check scripts/p16-offline-manifest-round14.test.mjs
node --test scripts/p16-offline-manifest-round14.test.mjs
```

Run the full project checks after installing dependencies in a fresh checkout:

```sh
npm ci
npm run lint
npm run typecheck
npm test
```

The focused checks cover 41 cases. They do not establish real-world accessibility,
actual offline network behaviour, or production route correctness; continue to
run browser, screen-reader, keyboard and physical-switch sessions separately.
