/**
 * Error-state next actions and empty-state wording.
 * Framework-agnostic model: a view layer renders it. No data is fetched here.
 * French typography: ’ apostrophe, U+00A0 before ":", U+202F before ; ! ? and inside « ».
 */
export type Locale = "en" | "fr";

export type ErrorKind = "offline" | "timeout" | "server" | "not-found" | "unknown";
export type EmptyKind = "no-results" | "no-saved-places" | "accessibility-unknown";
export type ActionId = "retry" | "go-back" | "go-home" | "clear-filters" | "browse-places";

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
  "go-back": { en: "Go back", fr: "Retour" },
  "go-home": { en: "Go to the start", fr: "Aller à l’accueil" },
  "clear-filters": { en: "Clear filters", fr: "Effacer les filtres" },
  "browse-places": { en: "Browse places", fr: "Parcourir les lieux" },
};

interface Entry {
  readonly title: Text;
  readonly description: Text;
  readonly actions: readonly ActionId[];
}

const ERRORS: Record<ErrorKind, Entry> = {
  offline: {
    title: { en: "You are offline", fr: "Vous êtes hors ligne" },
    description: {
      en: "The App could not reach the network. Your connection may have dropped.",
      fr: "L’App n’a pas pu joindre le réseau. Votre connexion a peut-être été coupée.",
    },
    actions: ["retry"],
  },
  timeout: {
    title: { en: "This is taking too long", fr: "Le chargement est trop long" },
    description: {
      en: "The request did not finish in time.",
      fr: "La requête n’a pas abouti à temps.",
    },
    actions: ["retry", "go-back"],
  },
  server: {
    title: { en: "Something went wrong on our side", fr: "Un problème est survenu de notre côté" },
    description: {
      en: "The service returned an error. Nothing you did caused it.",
      fr: "Le service a renvoyé une erreur. Rien de ce que vous avez fait n’en est la cause.",
    },
    actions: ["retry", "go-back"],
  },
  "not-found": {
    title: { en: "We could not find that page", fr: "Cette page est introuvable" },
    description: {
      en: "The link may be old or mistyped.",
      fr: "Le lien est peut-être périmé ou mal saisi.",
    },
    actions: ["go-back", "go-home"],
  },
  unknown: {
    title: { en: "Something went wrong", fr: "Un problème est survenu" },
    description: {
      en: "The App hit an unexpected problem.",
      fr: "L’App a rencontré un problème inattendu.",
    },
    actions: ["retry", "go-home"],
  },
};

const EMPTY: Record<EmptyKind, Entry> = {
  "no-results": {
    title: { en: "No places match", fr: "Aucun lieu ne correspond" },
    description: {
      en: "Nothing matches the filters you chose.",
      fr: "Aucun lieu ne correspond aux filtres choisis.",
    },
    actions: ["clear-filters"],
  },
  "no-saved-places": {
    title: { en: "No saved places yet", fr: "Aucun lieu enregistré pour l’instant" },
    description: {
      en: "Places you save will appear here.",
      fr: "Les lieux que vous enregistrez apparaîtront ici.",
    },
    actions: ["browse-places"],
  },
  // Unknown stays UNKNOWN: never imply a place is or is not accessible.
  "accessibility-unknown": {
    title: { en: "Accessibility: UNKNOWN", fr: "Accessibilité : INCONNUE" },
    description: {
      en: "No accessibility details are recorded for this place. We do not guess.",
      fr: "Aucun détail d’accessibilité n’est enregistré pour ce lieu. Nous ne faisons pas de suppositions.",
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

export function getErrorState(kind: ErrorKind, locale: Locale): StateView {
  return build(ERRORS[kind], locale, "alert");
}

export function getEmptyState(kind: EmptyKind, locale: Locale): StateView {
  return build(EMPTY[kind], locale, "status");
}

/** Map an HTTP status (or undefined for a network failure) to an error kind. */
export function errorKindFromStatus(status: number | undefined, online: boolean): ErrorKind {
  if (!online) return "offline";
  if (status === undefined) return "unknown";
  if (status === 404) return "not-found";
  if (status === 408 || status === 504) return "timeout";
  if (status >= 500) return "server";
  return "unknown";
}

export const ERROR_KINDS = Object.keys(ERRORS) as ErrorKind[];
export const EMPTY_KINDS = Object.keys(EMPTY) as EmptyKind[];
