/** Only the Settings feature entrypoints are discoverable. Missing packages remain pending. */
const entrypoints = import.meta.glob([
  "../../../../packages/controls/src/index.ts",
  "../../../../packages/consent/src/index.ts",
  "../../../../packages/caregiver/src/index.ts",
  "../../../../packages/sync/src/index.ts",
  "../../../../packages/advocacy/src/index.ts",
  "../../../../packages/data-client/src/index.ts",
]);

export type FeaturePackage = "controls" | "consent" | "caregiver" | "sync" | "advocacy" | "data-client";

export async function loadFeaturePackage(name: FeaturePackage): Promise<Record<string, unknown> | null> {
  const path = `../../../../packages/${name}/src/index.ts`;
  const load = entrypoints[path];
  if (!load) return null;
  return (await load()) as Record<string, unknown>;
}
