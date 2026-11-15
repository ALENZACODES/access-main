# @access-main/caregiver

First slice of Major Idea 10 (Caregiver and Family), issue #18.

The person who owns the profile grants, narrows and revokes exactly what a caregiver sees. Nothing is shared by default. Every grant, change and use is logged where the owner can read it. Data stays on the device (IndexedDB, or memory in tests). There is no server, no account and no messaging in this slice.

## Scopes (a closed list)

| Scope | What the caregiver sees |
| --- | --- |
| `journey_reference` | A reference code and a short description the owner typed. No live tracking. |
| `check_in_receipt` | A reference code, a short description and a date the owner typed. |
| `equipment_snapshot` | Values copied from the equipment profile for the fields the owner ticked: `equipment_type_general`, `chair_width_mm`, `chair_length_mm`, `transfer_side_preference`, `attendant_travels`. Names match `packages/shared/src/profile.ts`. |

There is no scope for the whole profile. The profile has no health or diagnosis field and this package adds none. Narrowing only removes access (fewer fields, or an earlier end). Widening needs a new grant.

## Data status

Records here hold the owner's own choices, not facts about places, so they carry no verification tier. The demonstration profile in `src/fixtures.ts` is invented and the screens label it as demonstration data.

## Commands

```
npm run typecheck -w @access-main/caregiver
npm test -w @access-main/caregiver
npm run test:e2e -w @access-main/caregiver   # Playwright + axe-core, EN and FR at 1280 and 320 px
```

Vitest also runs axe-core in jsdom (structure rules). Colour contrast and reflow are checked only by the Playwright test.
