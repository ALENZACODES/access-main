import { appRoutes } from "./a11y-input/helpers.ts";

/**
 * The narrow-screen audit route, taken from the routes the live app serves
 * (the same `appRoutes()` list the a11y-input audit uses), so the narrow
 * specs fail at once if the route is renamed or dropped from the router.
 */
export function narrowRoute(): string {
  const route = appRoutes().find((path) => path === "/dev/narrow");
  if (!route) throw new Error("The app no longer serves /dev/narrow: update the narrow specs.");
  return route;
}
