import { emptyModuleResult } from "@access/shared";

/** Used when the navigator package is not pulled into .lanes: the route stays unavailable and lists nothing. */
export function listForShell() {
  return emptyModuleResult("navigator", "modules.unavailable");
}
