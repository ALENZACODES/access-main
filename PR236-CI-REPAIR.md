PR #236 repair, based on current main 14394b8ede5895471969e9ac9626d2b00b277a16.

The CI typecheck failure came from a route reference to InputWorkbenchPage without a declared lazy binding. This complete router replacement declares InputWorkbenchPage before the route uses it. The lazy boundary is retained, so the workbench remains out of the initial bundle.

The reported Day 22 home-heading and navigation-focus performance failures occurred because the router could not mount after the unresolved identifier. The perf spec and its gates are unchanged. The original perf suite must be rerun in CI; no full CI pass is claimed here.

The WorkbenchPage and its model, engine, report, and copy modules are included in this archive as complete files. The other imports in router.tsx are unchanged current-main modules.
