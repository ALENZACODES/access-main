import { useTranslation } from "react-i18next";

/**
 * Strings for the lane seam: loading and pending sections, and the place page.
 * They are added to the active i18n instance the first time a component asks
 * for them. A key already in the main catalogs wins.
 * French follows the typography rule: U+00A0 before : ; ? ! and inside « ».
 */
export const LANE_STRINGS = {
  en: {
    lanes: {
      loading: "Loading this section…",
      loadFailed: "This section could not be loaded. Reload the page to try again.",
      pendingTitle: "This section is being connected",
      pendingBody: "Its package has not been added to this build yet. Nothing is shown here until it is.",
      openPlace: "Open details for {{name}}",
    },
    placeDetail: {
      title: "Place details",
      back: "Back to places",
      nameUnknown: "Unknown",
      loading: "Loading the record…",
      found: "Record found in the data pack.",
      notFound: "No record with this identifier is in the data pack. Nothing is shown for it.",
      unavailable: "This record could not be read, or one of its facts has no source, licence, date or tier. Nothing is shown for it.",
      attribution: "Attribution",
    },
  },
  fr: {
    lanes: {
      loading: "Chargement de cette section…",
      loadFailed: "Cette section n’a pas pu être chargée. Rechargez la page pour réessayer.",
      pendingTitle: "Cette section est en cours de raccordement",
      pendingBody: "Son module n’a pas encore été ajouté à cette version. Rien n’est affiché ici tant qu’il ne l’est pas.",
      openPlace: "Ouvrir la fiche de {{name}}",
    },
    placeDetail: {
      title: "Fiche du lieu",
      back: "Retour aux lieux",
      nameUnknown: "Inconnu",
      loading: "Chargement de la fiche…",
      found: "Fiche trouvée dans le jeu de données.",
      notFound: "Aucune fiche portant cet identifiant ne figure dans le jeu de données. Rien n’est affiché.",
      unavailable: "Cette fiche n’a pas pu être lue, ou l’un de ses faits n’a ni source, ni licence, ni date, ni niveau. Rien n’est affiché.",
      attribution: "Attribution",
    },
  },
} as const;

const registered = new WeakSet<object>();

/** `useTranslation` with the lane strings added to the instance. */
export function useLaneStrings(): ReturnType<typeof useTranslation> {
  const result = useTranslation();
  const { i18n } = result;
  if (!registered.has(i18n)) {
    registered.add(i18n);
    const ns = typeof i18n.options.defaultNS === "string" ? i18n.options.defaultNS : "translation";
    for (const lng of ["en", "fr"] as const) i18n.addResourceBundle(lng, ns, LANE_STRINGS[lng], true, false);
  }
  return result;
}
