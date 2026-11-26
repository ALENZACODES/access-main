/** Complete, uncompressed installation footprint limit in bytes. */
export const INSTALL_BUDGET_BYTES = 4_718_592;

export interface InstallAsset {
  readonly path: string;
  readonly bytes: number;
}

export interface InstallBudgetReport {
  readonly budgetBytes: number;
  readonly totalBytes: number;
  readonly remainingBytes: number;
  readonly withinBudget: boolean;
  readonly assets: number;
}

export class InstallBudgetError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InstallBudgetError";
  }
}

/** Evaluate a complete install manifest, including downloaded lazy chunks. */
export function evaluateInstallBudget(
  assets: readonly InstallAsset[],
): InstallBudgetReport {
  const seen = new Set<string>();
  let totalBytes = 0;

  for (const asset of assets) {
    if (typeof asset.path !== "string" || asset.path.trim().length === 0) {
      throw new InstallBudgetError("Asset path must be non-empty.");
    }
    if (!Number.isSafeInteger(asset.bytes) || asset.bytes < 0) {
      throw new InstallBudgetError(`Invalid byte size for ${asset.path}.`);
    }
    if (seen.has(asset.path)) {
      throw new InstallBudgetError(`Duplicate asset path: ${asset.path}`);
    }
    seen.add(asset.path);
    const nextTotal = totalBytes + asset.bytes;
    if (!Number.isSafeInteger(nextTotal)) {
      throw new InstallBudgetError("Install total exceeds safe integer precision.");
    }
    totalBytes = nextTotal;
  }

  return {
    budgetBytes: INSTALL_BUDGET_BYTES,
    totalBytes,
    remainingBytes: INSTALL_BUDGET_BYTES - totalBytes,
    withinBudget: totalBytes <= INSTALL_BUDGET_BYTES,
    assets: seen.size,
  };
}

/** Throw when a complete installation exceeds the inclusive byte limit. */
export function assertInstallBudget(
  assets: readonly InstallAsset[],
): InstallBudgetReport {
  const report = evaluateInstallBudget(assets);
  if (!report.withinBudget) {
    throw new InstallBudgetError(
      `Install budget exceeded: ${report.totalBytes} B > ${report.budgetBytes} B ` +
        `(over by ${-report.remainingBytes} B).`,
    );
  }
  return report;
}

/** Validate a parsed JSON manifest before applying the budget guard. */
export function assertInstallBudgetFromJson(value: unknown): InstallBudgetReport {
  if (!Array.isArray(value)) {
    throw new InstallBudgetError("Install manifest must be an array.");
  }
  const assets: InstallAsset[] = [];
  for (const entry of value as readonly unknown[]) {
    if (typeof entry !== "object" || entry === null ||
        !("path" in entry) || !("bytes" in entry)) {
      throw new InstallBudgetError("Invalid manifest entry.");
    }
    const path: unknown = entry.path;
    const bytes: unknown = entry.bytes;
    if (typeof path !== "string" || typeof bytes !== "number") {
      throw new InstallBudgetError("Invalid manifest asset properties.");
    }
    assets.push({ path, bytes });
  }
  return assertInstallBudget(assets);
}
