/**
 * Day 25 acceptance test 6: the build was unchanged during the session, or a
 * change followed the fallback process and is recorded. A snapshot is the
 * build identifier and a SHA-256 per built file, taken before and after.
 */
export interface BuildSnapshot {
  format: "build-snapshot-1.0.0";
  buildId: string;
  takenAt: string;
  /** Path relative to the build folder, forward slashes, to a hex SHA-256. */
  files: Record<string, string>;
}

export interface BuildComparison {
  unchanged: boolean;
  buildIdChanged: boolean;
  added: string[];
  removed: string[];
  changed: string[];
}

export function compareSnapshots(before: BuildSnapshot, after: BuildSnapshot): BuildComparison {
  const added = Object.keys(after.files).filter((path) => !(path in before.files)).sort();
  const removed = Object.keys(before.files).filter((path) => !(path in after.files)).sort();
  const changed = Object.keys(before.files)
    .filter((path) => path in after.files && before.files[path] !== after.files[path])
    .sort();
  const buildIdChanged = before.buildId !== after.buildId;
  return { unchanged: !buildIdChanged && added.length + removed.length + changed.length === 0, buildIdChanged, added, removed, changed };
}

export interface SessionChangeRecord {
  /** What failed in the session. */
  failure: string;
  /** What was done: the fallback section used, or the fix applied. */
  action: string;
  fallbackUsed: boolean;
}

/**
 * Pass when the build is unchanged, or when it changed and the change is
 * recorded with the fallback used. A silent change fails.
 */
export function sessionBuildVerdict(
  comparison: BuildComparison,
  record?: SessionChangeRecord,
): { pass: boolean; detail: string } {
  if (comparison.unchanged) return { pass: true, detail: "The build was unchanged during the session." };
  const parts = [
    comparison.buildIdChanged ? "build identifier changed" : "",
    comparison.added.length ? `${comparison.added.length} file(s) added` : "",
    comparison.removed.length ? `${comparison.removed.length} file(s) removed` : "",
    comparison.changed.length ? `${comparison.changed.length} file(s) changed` : "",
  ].filter(Boolean);
  if (!record || record.failure.trim() === "" || record.action.trim() === "") {
    return { pass: false, detail: `The build changed (${parts.join(", ")}) and no change record was written.` };
  }
  if (!record.fallbackUsed) {
    return { pass: false, detail: `The build changed (${parts.join(", ")}) without the fallback process.` };
  }
  return { pass: true, detail: `The build changed (${parts.join(", ")}). Recorded: ${record.failure} Action: ${record.action}` };
}
