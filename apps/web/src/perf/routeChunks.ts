import { lazy, type ComponentType, type LazyExoticComponent } from "react";
import { lazyImport, type LazyChunk } from "./lazy-chunk.ts";

/**
 * Route chunks for the live router. Each page is split into its own chunk and
 * requested only when its route renders, or when a person shows intent by
 * focusing or pointing at its nav link (preloadRoute). One LazyChunk per route
 * means the router and the preload share a single request, and a failed
 * request can be retried on the next attempt.
 *
 * Preloading fetches only the small page chunk. MapLibre and PMTiles (about
 * 1 MB) stay on demand inside the map page, and are never preloaded.
 */
export const routeChunks = {
  "/about": lazyImport(() => import("../pages/AboutPage.tsx")),
  "/profile": lazyImport(() => import("../pages/ProfilePage.tsx")),
  "/places": lazyImport(() => import("../pages/ModulePage.tsx")),
  "/place": lazyImport(() => import("../pages/PlaceDetailPage.tsx")),
  "/help": lazyImport(() => import("../pages/HelpPage.tsx")),
  "/data-status": lazyImport(() => import("../pages/DataStatusPage.tsx")),
  "/build-card": lazyImport(() => import("../pages/BuildCardPage.tsx")),
  "/offline": lazyImport(() => import("../pages/OfflinePackPage.tsx")),
} as const;

export type ChunkedRoute = keyof typeof routeChunks;

/** Module pages (journey, finders, navigator, games) share the places page chunk. */
const ALIASES: Record<string, ChunkedRoute> = {
  "/journey": "/places",
  "/finders": "/places",
  "/navigator": "/places",
  "/games": "/places",
};

type RouteModule<K extends ChunkedRoute> = Awaited<ReturnType<(typeof routeChunks)[K]["load"]>>;

/** A React.lazy page backed by the shared route chunk. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function routePage<K extends ChunkedRoute, P = any>(
  route: K,
  pick: (module: RouteModule<K>) => ComponentType<P>,
): LazyExoticComponent<ComponentType<P>> {
  const chunk = routeChunks[route] as unknown as LazyChunk<RouteModule<K>>;
  return lazy(async () => ({ default: pick(await chunk.load()) }));
}

/** Starts the page chunk for a nav target. Never throws; a failure is retried when the route renders. */
export function preloadRoute(path: string): void {
  const key = (path in routeChunks ? path : ALIASES[path]) as ChunkedRoute | undefined;
  if (!key) return;
  routeChunks[key].preload().catch(() => undefined);
}
