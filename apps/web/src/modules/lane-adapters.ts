import type { PackSource } from "@access-main/data-client";
import { emptyModuleResult, type JourneyModule } from "@access/shared";

/**
 * The journey-data package plans over coordinates, not the shell's origin and
 * destination labels. Until that wiring exists, the route stays unavailable
 * and does not invent a trip.
 */
export function createJourneyModule(source: PackSource): JourneyModule {
  void source;
  return {
    id: "journey",
    plan: async () => emptyModuleResult("journey", "modules.unavailable"),
  };
}
