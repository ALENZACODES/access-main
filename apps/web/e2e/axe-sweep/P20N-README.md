# P20N: Playwright API repair and evidence continuity

The `p20l-provenance.spec.ts` uses ordinary `for ... of` test declarations.
Playwright does not provide Vitest's data-driven test declaration API.
Every generated case retains an independently reported test title.

The new evidence-transition contracts exercise changes between English and
French, and between online and offline copies. A missing field or declared
unknown state cannot be upgraded merely by changing language or connectivity.
The tests use synthetic records only; they make no accessibility assertion
about any real place. Sources and licence metadata are not generated.

These specs live under `apps/web/e2e`, so the existing Playwright test runner
picks them up without a workflow or package change.

Execute from the repository's web project:

    npx playwright test e2e/axe-sweep/p20l-provenance.spec.ts e2e/axe-sweep/p20n-evidence-transitions.spec.ts

Browser and end-to-end checks elsewhere in the suite remain separate.
