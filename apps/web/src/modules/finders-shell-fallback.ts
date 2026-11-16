import type { PackSource } from "@access-main/data-client";
import type { FinderKind, ModuleContext } from "@access/shared";
import { createFindersModule } from "./lane-fallbacks.ts";

const fallback = createFindersModule();

/** Used when the tools finders shell has not been pinned into .lanes/. */
export function searchFindersForShell(
  _source: PackSource,
  query: { kind: FinderKind; text: string },
  ctx: ModuleContext,
) {
  return fallback.search(query, ctx);
}
