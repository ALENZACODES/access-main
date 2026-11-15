/**
 * Every error state the shell can show, with the plain-language message and
 * the next actions it offers. Day 22 asks that each error state have plain
 * language and a working next action. The tests check that each message and
 * label exists in English and French, and that each link goes to a real route.
 */
export const SHELL_PATHS = [
  "/",
  "/about",
  "/onboarding",
  "/profile",
  "/data-status",
  "/places",
  "/journey",
  "/finders",
  "/navigator",
  "/games",
  "/help",
] as const;

export type ShellPath = (typeof SHELL_PATHS)[number];

export type ErrorAction =
  | { kind: "link"; to: ShellPath; labelKey: string }
  /** Runs the screen's own retry, for example reading storage again. */
  | { kind: "retry"; labelKey: string };

export interface ErrorState {
  id: "notFound" | "renderFailed" | "storageUnavailable" | "profileSaveFailed";
  /** Where it appears. */
  screen: string;
  messageKeys: readonly string[];
  actions: readonly ErrorAction[];
}

export const ERROR_STATES = {
  notFound: {
    id: "notFound",
    screen: "Any address the shell does not know",
    messageKeys: ["notFound.title", "notFound.body"],
    actions: [
      { kind: "link", to: "/", labelKey: "notFound.home" },
      { kind: "link", to: "/help", labelKey: "notFound.help" },
    ],
  },
  renderFailed: {
    id: "renderFailed",
    screen: "Any page whose content throws while rendering",
    messageKeys: ["error.title", "error.body"],
    actions: [
      { kind: "retry", labelKey: "error.retry" },
      { kind: "link", to: "/", labelKey: "error.home" },
    ],
  },
  storageUnavailable: {
    id: "storageUnavailable",
    screen: "Data status, when the browser refuses on-device storage",
    messageKeys: ["data.storageUnavailable", "data.storageNext"],
    actions: [
      { kind: "retry", labelKey: "data.storageRetry" },
      { kind: "link", to: "/help", labelKey: "data.storageHelp" },
    ],
  },
  profileSaveFailed: {
    id: "profileSaveFailed",
    screen: "Settings, when saving to this device fails",
    messageKeys: ["profile.couldNotSave"],
    actions: [{ kind: "link", to: "/data-status", labelKey: "profile.dataStatusLink" }],
  },
} as const satisfies Record<ErrorState["id"], ErrorState>;

export function errorStateList(): ErrorState[] {
  return Object.values(ERROR_STATES);
}
