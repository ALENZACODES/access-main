import type { PackSource } from "@access-main/data-client";

/**
 * The App's shared pack source, or null when it cannot be had. The place additions use this instead of importing
 * the module registry directly, so a page still renders (without them) where that registry is replaced.
 */
export async function sharedPackSource(): Promise<PackSource | null> {
  try {
    const linked = await import("../modules/linked.ts");
    return typeof linked.getPackSource === "function" ? linked.getPackSource() : null;
  } catch {
    return null;
  }
}
