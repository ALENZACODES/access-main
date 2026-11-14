/**
 * Build manifest written next to the built shell as `build-manifest.json`.
 *
 * Day 22 asks that the rehearsal-candidate tag match the deployed build, and
 * Day 24 asks that the final build identifier agree everywhere it is shown.
 * The footer and About read `VITE_BUILD_ID`. This file records the same value
 * so a person (or `npm run verify:build`) can compare a deployed copy with the
 * tag they expected, without opening the app.
 */
export const BUILD_MANIFEST_FILE = "build-manifest.json";
export const BUILD_MANIFEST_VERSION = 1;

export interface BuildManifest {
  manifestVersion: typeof BUILD_MANIFEST_VERSION;
  buildId: string;
  /** Git commit the build was made from, or `unknown` when it was not supplied. */
  commit: string;
  contractVersion: string;
}

export interface ManifestInput {
  buildId?: string | undefined;
  commit?: string | undefined;
  contractVersion: string;
}

const COMMIT = /^[0-9a-f]{7,40}$/;

export function createBuildManifest(input: ManifestInput): BuildManifest {
  const buildId = input.buildId?.trim() || "dev";
  const commit = input.commit?.trim().toLowerCase() ?? "";
  return {
    manifestVersion: BUILD_MANIFEST_VERSION,
    buildId,
    commit: COMMIT.test(commit) ? commit : "unknown",
    contractVersion: input.contractVersion,
  };
}

export type ReleaseProblem =
  | { kind: "not-a-manifest" }
  | { kind: "dev-build"; buildId: string }
  | { kind: "build-id-mismatch"; expected: string; actual: string }
  | { kind: "commit-mismatch"; expected: string; actual: string }
  | { kind: "commit-unknown" };

export interface ReleaseExpectation {
  buildId: string;
  /** Optional. When given, the manifest commit must start with it. */
  commit?: string | undefined;
}

export function parseBuildManifest(value: unknown): BuildManifest | null {
  if (value === null || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.manifestVersion !== BUILD_MANIFEST_VERSION) return null;
  if (typeof record.buildId !== "string" || record.buildId.length === 0) return null;
  if (typeof record.commit !== "string" || typeof record.contractVersion !== "string") return null;
  return {
    manifestVersion: BUILD_MANIFEST_VERSION,
    buildId: record.buildId,
    commit: record.commit,
    contractVersion: record.contractVersion,
  };
}

/** Lists every way a built shell differs from the tag a rehearsal expects. An empty list means it matches. */
export function checkReleaseCandidate(value: unknown, expected: ReleaseExpectation): ReleaseProblem[] {
  const manifest = parseBuildManifest(value);
  if (!manifest) return [{ kind: "not-a-manifest" }];
  const problems: ReleaseProblem[] = [];
  if (manifest.buildId === "dev") problems.push({ kind: "dev-build", buildId: manifest.buildId });
  if (manifest.buildId !== expected.buildId) {
    problems.push({ kind: "build-id-mismatch", expected: expected.buildId, actual: manifest.buildId });
  }
  if (expected.commit) {
    const want = expected.commit.trim().toLowerCase();
    if (manifest.commit === "unknown") problems.push({ kind: "commit-unknown" });
    else if (!manifest.commit.startsWith(want) && !want.startsWith(manifest.commit)) {
      problems.push({ kind: "commit-mismatch", expected: want, actual: manifest.commit });
    }
  }
  return problems;
}

export function describeReleaseProblem(problem: ReleaseProblem): string {
  switch (problem.kind) {
    case "not-a-manifest":
      return "The file is not a build manifest from this shell.";
    case "dev-build":
      return "The build identifier is dev. Set VITE_BUILD_ID when building a rehearsal or final build.";
    case "build-id-mismatch":
      return `Expected build ${problem.expected}, found ${problem.actual}.`;
    case "commit-mismatch":
      return `Expected commit ${problem.expected}, found ${problem.actual}.`;
    case "commit-unknown":
      return "The manifest does not record a commit. Set VITE_BUILD_COMMIT when building.";
  }
}
