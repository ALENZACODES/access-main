# @access-main/freshness

On-device freshness evaluation for place, path, transit, and condition fields
in the App.

This package has no backend, account system, network requests, scheduled
checks, persistence, or publishing mechanism.

## Default expiry classes

| Class | Example fields | Default duration |
| --- | --- | --- |
| `elevator` | Elevator or lift status | 4 hours |
| `condition` | Snowbanks, path and transit conditions | 24 hours |
| `washroom` | Washroom usability | 180 days |
| `geometry` | Door width and measured geometry | 365 days |
| `operatorHours` | Operator-claimed hours | 90 days |

These are configurable freshness windows, **not guarantees** that a fact is
correct until its expiry.

Days mean fixed 24-hour periods. Expiry is inclusive: at the exact expiry
instant, a fact becomes `needs-check`.

Directory and benefits dates are excluded. G5 continues to own their existing
90-day audit and handoff process. Do not duplicate that audit here.

## Field format

Use the existing accessibility field structure:

```ts
interface AccessibilityFact {
  value: unknown; // "UNKNOWN" indicates an unknown value
  source_id: string;
  licence: string;
  retrieved_at: string | null;
  tier: 0 | 1 | 2 | 3;
  source_key?: string;
  raw?: unknown;
  derived?: unknown;
}
```

`retrieved_at` is the timestamp used by this package as the last-check
reference. If the source provides a distinct survey or observation date,
the integration must establish the applicable checked timestamp without
silently replacing an old observation with a newer download date.

The caller must preserve source provenance, original dates, evidence
protocol, verifier role, method, and survey date wherever applicable.

The evaluator does not create or upgrade evidence tiers.

## Evaluating a fact

```ts
import {
  badgeFor,
  classForField,
  evaluate,
} from "@access-main/freshness";

const fact = {
  value: 850,
  source_id: "example-open-data",
  licence: "CC0",
  retrieved_at: "2026-11-01T12:00:00Z",
  tier: 1 as const,
};

const classId = classForField("door_width");

if (classId) {
  const freshness = evaluate(
    fact,
    new Date("2026-11-15T12:00:00Z"),
    classId,
  );

  const badge = badgeFor(freshness, fact, "en");
  // badge.label: "Last checked ..."
  // badge.verified: false (tier 1)
}
```

`evaluate` returns:

```ts
{
  state: "current" | "needs-check" | "unknown",
  lastChecked: string | null,
  expiresAt: string | null
}
```

Both dates are UTC ISO-8601 timestamps when known.

A missing, invalid, future, or timezone-less date is `unknown`.
An absent or `"UNKNOWN"` value is also `unknown`.
Tier-0 drafts are never current facts.

An expired field is `needs-check`, **not current**. An unknown field remains
unknown; never infer that it is inaccessible, accessible, working, or broken.

## Override a duration or register a field

```ts
const policy = {
  durations: {
    elevator: 2 * 60 * 60 * 1000,
  },
  fieldClasses: {
    platform_lift_status: "elevator" as const,
  },
};

const classId = classForField("platform_lift_status", policy);

if (classId) {
  const result = evaluate(fact, new Date(), classId, policy);
}
```

Unclassified fields must be treated as unknown by integration code, not
silently assigned an expiry class. Do not map directory or benefits dates
into this package.

## Needs-check tasks

```ts
import { tasks } from "@access-main/freshness";

const pending = tasks(
  [{
    recordId: "synthetic-place-1",
    fields: {
      door_width: fact,
    },
  }],
  new Date(),
);
```

Each task has:

```ts
{
  recordId: string;
  field: string;
  lastChecked: string;
