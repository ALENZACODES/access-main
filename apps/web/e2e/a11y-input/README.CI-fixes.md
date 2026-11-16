# P16 keyboard and announcement regression repairs

These complete modules can be installed on the current main branch, without
requiring the P16C or P16E branches. Playwright discovers the two `*.spec.ts`
files under `apps/web/e2e/`.

- `navigation-audit.ts` checks each adjacent Tab / Shift+Tab transition in
  place, without reconstructing the sequence after re-focusing the body.
  Reversed or missing focus targets still produce a failing assertion.
- `announcements-round5.ts` checks the actual `document.activeElement` after
  a keyboard-activated status update instead of calling a nonexistent Locator
  method. Focus theft is reported as a violation.
- The two fixture specifications test both expected behaviour and deliberate
  failures; they do not add synthetic accessibility data.

Run `npm run lint`, `npm run typecheck`, and `npm run test` from the root,
then `npm run test:e2e -w @access/web` with the existing web server setup.
A browser run remains necessary to confirm behaviour on the deployed routes.
