# PR #236 router repair

Current main baseline: `14394b8ede5895471969e9ac9626d2b00b277a16`.

The complete router defines the lazy `InputWorkbenchPage` before the `/input-workbench` route references it, retains the offline evidence workbench disclosure, and keeps the new page out of the initial bundle. The Home page includes a bilingual entry link. The WorkbenchPage and all direct local model/engine/report/copy modules are included.

The current-main root package manifest is preserved with the workbench node integration test appended. Existing P20 test entries remain.

The latest CI showed performance failures as well as the missing identifier. The performance suite must be rerun against this repaired router; no full CI result is claimed here.
