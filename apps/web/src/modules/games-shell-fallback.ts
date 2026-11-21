import { emptyModuleResult } from "@access/shared";

/** Used when the games package is not pulled into .lanes: the route stays unavailable and lists nothing. */
export const GAME_LIBRARY: readonly never[] = [];
export function listGamesForShell() {
  return emptyModuleResult("games", "modules.unavailable");
}
