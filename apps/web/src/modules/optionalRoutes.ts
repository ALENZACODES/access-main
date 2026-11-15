import { createElement, lazy, type ComponentType, type LazyExoticComponent } from "react";
import { useRoutes, type RouteObject } from "react-router-dom";
import { PendingSection } from "./Section.tsx";

/**
 * Entry files that other lanes create. `import.meta.glob` finds the ones that
 * exist at build time, so a missing file does not break the build. A section
 * whose file is missing renders PendingSection, which is not counted as done.
 */
const loaders = import.meta.glob([
  "../map/MapPage.tsx",
  "../contribute/ContributePage.tsx",
  "../pages/OfflinePage.tsx",
  "../features/routes.tsx",
  "../hub/routes.tsx",
]) as Record<string, () => Promise<Record<string, unknown>>>;

const PAGES = {
  map: { file: "../map/MapPage.tsx", name: "MapPage" },
  contribute: { file: "../contribute/ContributePage.tsx", name: "ContributePage" },
  offline: { file: "../pages/OfflinePage.tsx", name: "OfflinePage" },
} as const;

const ROUTE_TABLES = {
  settings: { file: "../features/routes.tsx", name: "featureRoutes" },
  more: { file: "../hub/routes.tsx", name: "hubRoutes" },
} as const;

export type OptionalPage = keyof typeof PAGES;
export type OptionalRouteTable = keyof typeof ROUTE_TABLES;

function pending(section: string): { default: ComponentType } {
  return { default: () => createElement(PendingSection, { section }) };
}

/** True when the lane's entry file is part of this build. */
export function hasEntry(section: OptionalPage | OptionalRouteTable): boolean {
  const entry = section in PAGES ? PAGES[section as OptionalPage] : ROUTE_TABLES[section as OptionalRouteTable];
  return entry.file in loaders;
}

/** A lazy page component for `export function <Name>()` in an entry file. */
export function optionalPage(section: OptionalPage): LazyExoticComponent<ComponentType> {
  const { file, name } = PAGES[section];
  return lazy(async () => {
    const load = loaders[file];
    if (!load) return pending(section);
    const page = (await load())[name];
    return typeof page === "function" ? { default: page as ComponentType } : pending(section);
  });
}

/** A lazy component that renders an entry file's `RouteObject[]` under a splat route. */
export function optionalRoutes(section: OptionalRouteTable): LazyExoticComponent<ComponentType> {
  const { file, name } = ROUTE_TABLES[section];
  return lazy(async () => {
    const load = loaders[file];
    if (!load) return pending(section);
    const table = (await load())[name];
    if (!Array.isArray(table)) return pending(section);
    const routes = table as RouteObject[];
    return {
      default: function NestedRoutes() {
        return useRoutes(routes);
      },
    };
  });
}
