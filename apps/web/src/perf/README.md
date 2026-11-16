# Web performance helpers

`install-budget.ts` checks the **inclusive 4,141,875-byte install limit**
using actual file sizes from a complete production install manifest:

```ts
import { assertInstallBudget } from "./install-budget";
assertInstallBudget([
  { path: "index.html", bytes: 875 },
  { path: "assets/app.js", bytes: 4_141_000 },
]);
```

Include **every installed asset**, including lazy chunks, offline files and
service workers. Sizes are raw installed bytes, not gzip/Brotli estimates.
Duplicate paths, invalid sizes and excess bytes fail closed. For untrusted
parsed JSON use `assertInstallBudgetFromJson(value)`.

**Integration required:** Generate a complete manifest from the production
build and invoke the guard during build verification. This scoped helper does
not automatically modify existing build scripts; omitted assets cannot be
detected by the guard.

`lazy-chunk.ts` provides `createLazyChunk`, `lazyImport`, `lazyExport` and
`preloadChunks`. Imports start only on an explicit `load()` or `preload()`;
concurrent calls share one request, successes are cached and failures may be
retried. `reset()` invalidates the cache but does not cancel an in-flight
request. Stale completions cannot overwrite newer state.

```ts
import { lazyImport } from "./lazy-chunk";
const feature = lazyImport(() => import("./optional-feature"));
// Call feature.load() only when the optional feature is requested.
```

The example import path is illustrative; supply a real feature module at the
integration point. Lazy loading does not exempt installed chunks from the
byte limit. Run `apps/web/src/perf/*.test.ts` with the repo's Vitest runner.
