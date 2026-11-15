import Ajv2020 from "ajv/dist/2020.js";
import budgetSchema from "../schemas/budget.schema.json";
import reportSchema from "../schemas/report.schema.json";

export type AssetKind = "js" | "css" | "html" | "image" | "workbox" | "manifest";
export interface InstallAsset { path: string; bytes: number; kind: AssetKind }
export interface Budget {
  version: 1;
  maxPrecacheBytes: number;
  maxLargestJsEntryBytes: number;
  maxTotalJsBytes: number;
  maxTotalCssBytes: number;
  maxAssetBytes: number;
}
export type Dimension = "empty_manifest" | "precache" | "largest_js_entry" | "total_js" | "total_css" | "asset";
export interface Violation { dimension: Dimension; actualBytes: number; limitBytes: number; paths: string[] }
export interface Report {
  version: 1;
  status: "pass" | "fail";
  fixture: boolean;
  budget: Budget;
  totals: {
    precacheBytes: number;
    largestJsEntryBytes: number;
    totalJsBytes: number;
    totalCssBytes: number;
    assetCount: number;
  };
  violations: Violation[];
}

const ajv = new Ajv2020({ allErrors: true, strict: true });
ajv.addSchema(budgetSchema);
const registeredBudgetSchema = ajv.getSchema(budgetSchema.$id);
if (!registeredBudgetSchema) throw new Error("Budget schema was not registered");
const validateBudgetSchema = registeredBudgetSchema;
const validateReportSchema = ajv.compile(reportSchema);

export function isBudget(value: unknown): value is Budget { return validateBudgetSchema(value) === true; }
export function isReport(value: unknown): value is Report { return validateReportSchema(value) === true; }

const kinds: ReadonlySet<string> = new Set(["js", "css", "html", "image", "workbox", "manifest"]);

function checkAssets(assets: readonly InstallAsset[]): void {
  const seen = new Set<string>();
  for (const asset of assets) {
    if (!asset || typeof asset.path !== "string" || !asset.path.trim() ||
      asset.path.startsWith("/") || asset.path.includes("\\") ||
      asset.path.split("/").some((segment) => segment === ".." || segment === "." || !segment) ||
      seen.has(asset.path) || !kinds.has(asset.kind) ||
      !Number.isSafeInteger(asset.bytes) || asset.bytes < 0) {
      throw new TypeError("Invalid, unsafe, or duplicate install asset");
    }
    seen.add(asset.path);
  }
}

/** Only listed precached files count; runtime-cached pages and map tiles do not. */
export function checkInstall(assets: readonly InstallAsset[], budgetValue: unknown): Report {
  if (!isBudget(budgetValue)) throw new TypeError("Invalid budget schema");
  const budget = budgetValue;
  checkAssets(assets);
  const js = assets.filter((asset) => asset.kind === "js");
  const jsAndWorkbox = assets.filter((asset) => asset.kind === "js" || asset.kind === "workbox");
  const css = assets.filter((asset) => asset.kind === "css");
  const sum = (items: readonly InstallAsset[]): number => items.reduce((total, asset) => total + asset.bytes, 0);
  const totals = {
    precacheBytes: sum(assets),
    largestJsEntryBytes: Math.max(0, ...js.map((asset) => asset.bytes)),
    totalJsBytes: sum(jsAndWorkbox),
    totalCssBytes: sum(css),
    assetCount: assets.length,
  };
  if (Object.values(totals).some((value) => !Number.isSafeInteger(value))) {
    throw new RangeError("Install-size aggregate exceeds safe integer range");
  }
  const violations: Violation[] = [];
  const add = (dimension: Dimension, actualBytes: number, limitBytes: number, paths: string[]): void => {
    if (actualBytes > limitBytes) violations.push({ dimension, actualBytes, limitBytes, paths });
  };
  if (assets.length === 0) violations.push({ dimension: "empty_manifest", actualBytes: 0, limitBytes: 0, paths: [] });
  add("precache", totals.precacheBytes, budget.maxPrecacheBytes, assets.map((asset) => asset.path));
  add("largest_js_entry", totals.largestJsEntryBytes, budget.maxLargestJsEntryBytes,
    js.filter((asset) => asset.bytes === totals.largestJsEntryBytes).map((asset) => asset.path));
  add("total_js", totals.totalJsBytes, budget.maxTotalJsBytes, jsAndWorkbox.map((asset) => asset.path));
  add("total_css", totals.totalCssBytes, budget.maxTotalCssBytes, css.map((asset) => asset.path));
  for (const asset of assets) add("asset", asset.bytes, budget.maxAssetBytes, [asset.path]);
  const report: Report = {
    version: 1, status: violations.length ? "fail" : "pass", fixture: true, budget, totals, violations,
  };
  if (!isReport(report)) throw new Error("Generated report does not match report schema");
  return report;
}
