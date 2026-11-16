import { appRoutes } from "./a11y-input/helpers.ts";

/** Live shell routes from the same appRoutes() list used by the a11y-input audit. */
export const ROUTES: readonly string[] = appRoutes();

export type ShellRoute = (typeof ROUTES)[number];
