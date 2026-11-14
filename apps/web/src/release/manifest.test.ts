import { describe, expect, it } from "vitest";
import { checkReleaseCandidate, createBuildManifest, describeReleaseProblem, parseBuildManifest } from "./manifest.ts";

describe("build manifest", () => {
  it("records the build id, a valid commit, and the contract version", () => {
    expect(createBuildManifest({ buildId: " rc-1 ", commit: "ABCDEF1234", contractVersion: "1.1.0" })).toEqual({
      manifestVersion: 1,
      buildId: "rc-1",
      commit: "abcdef1234",
      contractVersion: "1.1.0",
    });
  });

  it("says unknown instead of keeping a value that is not a commit", () => {
    expect(createBuildManifest({ buildId: "rc-1", commit: "main", contractVersion: "1.1.0" }).commit).toBe("unknown");
    expect(createBuildManifest({ contractVersion: "1.1.0" })).toMatchObject({ buildId: "dev", commit: "unknown" });
  });

  it("rejects a value that is not a manifest", () => {
    expect(parseBuildManifest(null)).toBeNull();
    expect(parseBuildManifest({ buildId: "rc-1" })).toBeNull();
    expect(checkReleaseCandidate("rc-1", { buildId: "rc-1" })).toEqual([{ kind: "not-a-manifest" }]);
  });
});

describe("release candidate check", () => {
  const manifest = createBuildManifest({ buildId: "rc-2026-11-20", commit: "5dcd00332131", contractVersion: "1.1.0" });

  it("passes when the tag and the commit prefix match", () => {
    expect(checkReleaseCandidate(manifest, { buildId: "rc-2026-11-20" })).toEqual([]);
    expect(checkReleaseCandidate(manifest, { buildId: "rc-2026-11-20", commit: "5dcd003" })).toEqual([]);
  });

  it("names a mismatched tag, a mismatched commit, and a dev build", () => {
    expect(checkReleaseCandidate(manifest, { buildId: "rc-2026-11-21", commit: "1234567" })).toEqual([
      { kind: "build-id-mismatch", expected: "rc-2026-11-21", actual: "rc-2026-11-20" },
      { kind: "commit-mismatch", expected: "1234567", actual: "5dcd00332131" },
    ]);
    const dev = createBuildManifest({ contractVersion: "1.1.0" });
    expect(checkReleaseCandidate(dev, { buildId: "dev", commit: "5dcd003" })).toEqual([
      { kind: "dev-build", buildId: "dev" },
      { kind: "commit-unknown" },
    ]);
  });

  it("describes each problem in a plain sentence", () => {
    for (const problem of checkReleaseCandidate(createBuildManifest({ contractVersion: "1.1.0" }), { buildId: "rc", commit: "abc1234" })) {
      expect(describeReleaseProblem(problem)).toMatch(/^[A-Z].*\.$/);
    }
  });
});
