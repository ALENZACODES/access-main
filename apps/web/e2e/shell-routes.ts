/** Canonical shell routes used by the Day 17 audit, shell smoke tests, and the 320px narrow audit. */
export const ROUTES = [
  "/",
  "/about",
  "/onboarding",
  "/profile",
  "/data-status",
  "/build-card",
  "/offline",
  "/places",
  "/map",
  "/journey",
  "/finders",
  "/navigator",
  "/games",
  "/settings",
  "/more",
  "/help",
] as const;

export type ShellRoute = (typeof ROUTES)[number];
