/**
 * Day 22 error and empty states: wording and next actions (EN + FR).
 *
 * The plan names six states: no network without a pack, pack download
 * failure, search with no results, journey with no route, finder with no
 * results, and game load failure. Each has a plain-language heading, one
 * sentence on what happened, and a next action. The App is a local PWA: there
 * is no server to blame, so nothing here says "service" or "our side".
 *
 * The shell's own states (not found, render failed, storage unavailable,
 * profile save failed) stay in shell/errorStates.ts.
 * French typography: ’ apostrophe, U+00A0 before ":", U+202F before ; ! ? and inside « ».
 */
export type Locale = "en" | "fr";

export type ErrorKind = "offline-no-pack" | "pack-download-failed" | "game-load-failed" | "not-found" | "load-failed" | "offline" | "pack-unreadable";
export type EmptyKind = "search-no-results" | "journey-no-route" | "finder-no-results" | "accessibility-unknown" | "map-no-places" | "no-saved-places";
export type ActionId = "retry" | "go-home" | "go-back" | "download-pack" | "clear-search" | "change-trip" | "help";

/** The six Day 22 states, in the plan's order. */
export const DAY22_STATES = [
  "offline-no-pack",
  "pack-download-failed",
  "search-no-results",
  "journey-no-route",
  "finder-no-results",
  "game-load-failed",
] as const satisfies readonly (ErrorKind | EmptyKind)[];

/** Where each action goes when it is a link. Other actions are handled by the view. */
export const ACTION_LINKS: Partial<Record<ActionId, string>> = {
  "go-home": "/",
  "download-pack": "/offline",
  help: "/help",
};

/** WCAG 2.5.8 AA asks for 24px; the App's rule is stricter. */
export const MIN_TOUCH_TARGET_PX = 44;

export interface StateAction {
  readonly id: ActionId;
  readonly label: string;
  readonly minTargetPx: number;
}

export interface StateView {
  readonly title: string;
  readonly description: string;
  readonly actions: readonly StateAction[];
  /** Errors interrupt (alert); empty states are polite status text. */
  readonly role: "alert" | "status";
}

type Text = Record<Locale, string>;

const ACTION_LABELS: Record<ActionId, Text> = {
  retry: { en: "Try again", fr: "Réessayer" },
  "go-home": { en: "Go to the home page", fr: "Aller à l’accueil" },
  "go-back": { en: "Go back", fr: "Retour" },
  "download-pack": { en: "Download an offline pack", fr: "Télécharger un pack hors ligne" },
  "clear-search": { en: "Clear the search", fr: "Effacer la recherche" },
  "change-trip": { en: "Change the trip", fr: "Modifier le trajet" },
  help: { en: "Open help", fr: "Ouvrir l’aide" },
};

interface Entry {
  readonly title: Text;
  readonly description: Text;
  readonly actions: readonly ActionId[];
}

const ERRORS: Record<ErrorKind, Entry> = {
  "pack-unreadable": {
    title: { en: "The saved places could not be read", fr: "Les lieux enregistrés n’ont pas pu être lus" },
    description: {
      en: "The offline pack on this device could not be opened. Download it again, then come back to this list.",
      fr: "Le pack hors ligne de cet appareil n’a pas pu être ouvert. Téléchargez-le de nouveau, puis revenez à cette liste.",
    },
    actions: ["download-pack"],
  },
  "offline-no-pack": {
    title: { en: "No connection and no offline pack", fr: "Pas de connexion ni de pack hors ligne" },
    description: {
      en: "This device is offline and has no offline pack for this area, so there is nothing to search yet.",
      fr: "Cet appareil est hors ligne et n’a aucun pack hors ligne pour cette région. Il n’y a donc rien à chercher pour l’instant.",
    },
    actions: ["download-pack", "retry"],
  },
  "pack-download-failed": {
    title: { en: "The pack did not finish downloading", fr: "Le pack n’a pas fini de se télécharger" },
    description: {
      en: "The download stopped before it was complete. Check the connection and the space on this device, then try again.",
      fr: "Le téléchargement s’est arrêté avant la fin. Contrôlez la connexion et l’espace libre sur cet appareil, puis réessayez.",
    },
    actions: ["retry", "help"],
  },
  "game-load-failed": {
    title: { en: "This game did not load", fr: "Ce jeu ne s’est pas chargé" },
    description: {
      en: "Its files could not be opened on this device.",
      fr: "Ses fichiers n’ont pas pu être ouverts sur cet appareil.",
    },
    actions: ["retry", "go-home"],
  },
  "not-found": {
    title: { en: "This place was not found", fr: "Ce lieu n’a pas été trouvé" },
    description: {
      en: "No record matches this address in the pack on this device.",
      fr: "Aucune fiche ne correspond à cette adresse dans le pack sur cet appareil.",
    },
    actions: ["go-back", "go-home"],
  },
  "load-failed": {
    title: { en: "This place could not be loaded", fr: "Ce lieu n’a pas pu être chargé" },
    description: {
      en: "The record could not be opened on this device. Try again, or go back to the place list.",
      fr: "La fiche n’a pas pu être ouverte sur cet appareil. Réessayez, ou revenez à la liste des lieux.",
    },
    actions: ["retry", "go-back"],
  },
  offline: {
    title: { en: "You are offline", fr: "Vous êtes hors ligne" },
    description: {
      en: "This place could not be loaded without a connection, and no saved copy is available.",
      fr: "Ce lieu n’a pas pu être chargé sans connexion, et aucune copie enregistrée n’est disponible.",
    },
    actions: ["retry", "download-pack"],
  },
};

const EMPTY: Record<EmptyKind, Entry> = {
  "search-no-results": {
    title: { en: "No places match this search", fr: "Aucun lieu ne correspond à cette recherche" },
    description: {
      en: "Try fewer words or different words.",
      fr: "Essayez moins de mots ou d’autres mots.",
    },
    actions: ["clear-search"],
  },
  "journey-no-route": {
    title: { en: "No route found for this trip", fr: "Aucun itinéraire trouvé pour ce trajet" },
    description: {
      en: "Check the start and the destination, or choose places nearby.",
      fr: "Contrôlez le départ et la destination, ou choisissez des lieux à proximité.",
    },
    actions: ["change-trip", "help"],
  },
  "finder-no-results": {
    title: { en: "Nothing of this kind was found", fr: "Rien de ce type n’a été trouvé" },
    description: {
      en: "Choose another kind, or clear the search words.",
      fr: "Choisissez un autre type, ou effacez les mots de recherche.",
    },
    actions: ["clear-search"],
  },
  "no-saved-places": {
    title: { en: "No saved places yet", fr: "Aucun lieu enregistré" },
    description: {
      en: "No places are saved on this device.",
      fr: "Aucun lieu n’est enregistré sur cet appareil.",
    },
    actions: ["go-home"],
  },
  // The map has no search box; an empty view is about the area and filters.
  "map-no-places": {
    title: { en: "No places in this map view", fr: "Aucun lieu dans cette vue de la carte" },
    description: {
      en: "Try moving the map or changing the filters.",
      fr: "Déplacez la carte ou modifiez les filtres.",
    },
    actions: ["help"],
  },
  // Unknown stays UNKNOWN: never imply a place is or is not accessible.
  "accessibility-unknown": {
    title: { en: "Accessibility: UNKNOWN", fr: "Accessibilité : INCONNUE" },
    description: {
      en: "No accessibility details are recorded for this place. The App does not guess.",
      fr: "Aucun détail d’accessibilité n’est enregistré pour ce lieu. L’application ne fait pas de suppositions.",
    },
    actions: ["go-back"],
  },
};

function build(entry: Entry, locale: Locale, role: StateView["role"]): StateView {
  return {
    title: entry.title[locale],
    description: entry.description[locale],
    role,
    actions: entry.actions.map((id) => ({
      id,
      label: ACTION_LABELS[id][locale],
      minTargetPx: MIN_TOUCH_TARGET_PX,
    })),
  };
}


/** Map an HTTP-style load failure onto a place-route error kind. */
export function errorKindFromStatus(httpStatus: number | undefined, online: boolean): ErrorKind {
  if (!online) return "offline";
  if (httpStatus === 404) return "not-found";
  return "load-failed";
}

export function getErrorState(kind: ErrorKind, locale: Locale): StateView {
  return build(ERRORS[kind], locale, "alert");
}

export function getEmptyState(kind: EmptyKind, locale: Locale): StateView {
  return build(EMPTY[kind], locale, "status");
}

export function getState(kind: ErrorKind | EmptyKind, locale: Locale): StateView {
  return kind in ERRORS ? getErrorState(kind as ErrorKind, locale) : getEmptyState(kind as EmptyKind, locale);
}

export const ERROR_KINDS = Object.keys(ERRORS) as ErrorKind[];
export const EMPTY_KINDS = Object.keys(EMPTY) as EmptyKind[];
