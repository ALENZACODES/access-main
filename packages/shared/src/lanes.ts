import { MODULE_IDS, type ModuleId } from "./modules.ts";

/**
 * Which package each shell route calls.
 *
 * The packages are not installed in this app. They are unpublished workspace
 * packages on open pull requests. access-maps also carries open-data files
 * this shell must not bundle, and its map UI loads MapLibre. This shell does
 * not mount that canvas and does not show a map attribution, because it does
 * not load map tiles. Finder fixtures are not copied. The timing package is
 * not part of the shell profile.
 *
 * `createModules` in the web app is the seam. Pass a real module there when
 * the package can be imported without those files.
 */
export interface LaneBinding {
  id: ModuleId;
  route: `/${ModuleId}`;
  repository: "ALENZACODES/access-maps" | "ALENZACODES/access-tools" | "ALENZACODES/access-help";
  packageName: string;
  /** Branch of the open pull request. Not merged to that repo's main. */
  ref: string;
  /** Commit this binding was checked against. */
  commit: string;
}

export const LANE_BINDINGS: { readonly [Id in ModuleId]: LaneBinding } = {
  places: {
    id: "places",
    route: "/places",
    repository: "ALENZACODES/access-maps",
    packageName: "access-maps",
    ref: "cursor/ontario-open-data-pipeline-986f",
    commit: "3b98630ceb1f5e75ee5a0df3a5b4f6fe198bd18c",
  },
  journey: {
    id: "journey",
    route: "/journey",
    repository: "ALENZACODES/access-maps",
    packageName: "@access-maps/journey",
    ref: "cursor/journey-chain-engine-9aae",
    commit: "eb694a1cd2f5082018ead6a09f5d9555805dbed2",
  },
  finders: {
    id: "finders",
    route: "/finders",
    repository: "ALENZACODES/access-tools",
    packageName: "@access-tools/finders",
    ref: "cursor/place-search-finders-fa64",
    commit: "cd3b4e869a1a76ae382ce2b3c1ff7564f5eef01c",
  },
  navigator: {
    id: "navigator",
    route: "/navigator",
    repository: "ALENZACODES/access-tools",
    packageName: "@access-tools/navigator",
    ref: "cursor/navigator-timing-games-76b0",
    commit: "06c9d4b9324414543b1569f018e2aa54cbaa1876",
  },
  games: {
    id: "games",
    route: "/games",
    repository: "ALENZACODES/access-tools",
    packageName: "@access-tools/games",
    ref: "cursor/navigator-timing-games-76b0",
    commit: "06c9d4b9324414543b1569f018e2aa54cbaa1876",
  },
  help: {
    id: "help",
    route: "/help",
    repository: "ALENZACODES/access-help",
    packageName: "@access/help",
    ref: "main",
    commit: "fc6cedbace2ba0e28dda9f0c9a907494004e6131",
  },
};

export function laneBinding(id: ModuleId): LaneBinding {
  return LANE_BINDINGS[id];
}

export function laneBindingList(): LaneBinding[] {
  return MODULE_IDS.map((id) => LANE_BINDINGS[id]);
}
