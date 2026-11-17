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
      reportRoute: "Report a route condition here",
    },
    journey: {
      awaiting: "Choose where you start and where you are going, then plan. Each place is looked up in the data pack on this device.",
      needBoth: "Enter both a start and a destination.",
      notFound: "No place with exactly this name is in the data pack. Use the place search under the field to choose one.",
      ambiguous: "More than one place in the data pack has this name. Use the place search under the field to choose one.",
      noCoordinates: "The planner is not available for this area: this place has no recorded position.",
      noArea: "The planner is not available for this area: no downloaded data with recorded paths covers it.",
      tooFar: "No rolling route is planned: the two places are more than 3 km apart in a straight line.",
      noRoute: "No connected rolling route was found in the downloaded data. This does not mean that no route exists.",
      planned: "This is what the planner returned from the downloaded data. It has not been checked on site.",
      find: "Find places for {{field}}",
      matchesFor: "Places in the data pack for {{field}}",
      noMatches: "No place in the data pack matches this text.",
      searchFailed: "The place search could not be read. Nothing is shown.",
      use: "Use this place",
      useName: "Use this place: {{name}}",
      chosen: "Chosen from the place search: {{name}}",
      notices: "Notes from the planner",
      endpoint: "{{role}}: {{name}}. Position from {{source}}, {{licence}}, {{date}}, tier {{tier}}.",
      stepFree: "No step or raised kerb is recorded on its segments in the downloaded data. Not checked on site.",
      unknownAccess: "Some segments have Unknown access fields, so step-free access is not confirmed.",
      metres: "{{distance}} m",
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
      reportRoute: "Signaler une condition du trajet à cet endroit",
    },
    journey: {
      awaiting: "Choisissez votre point de départ et votre destination, puis planifiez. Chaque lieu est cherché dans le jeu de données de cet appareil.",
      needBoth: "Indiquez un départ et une destination.",
      notFound: "Aucun lieu portant exactement ce nom ne figure dans le jeu de données. Choisissez-en un avec la recherche sous le champ.",
      ambiguous: "Plusieurs lieux du jeu de données portent ce nom. Choisissez-en un avec la recherche sous le champ.",
      noCoordinates: "Le planificateur n’est pas offert pour ce secteur\u00a0: ce lieu n’a pas de position enregistrée.",
      noArea: "Le planificateur n’est pas offert pour ce secteur\u00a0: aucune donnée téléchargée avec des chemins enregistrés ne le couvre.",
      tooFar: "Aucun parcours en fauteuil n’est planifié\u00a0: les deux lieux sont à plus de 3\u00a0km à vol d’oiseau.",
      noRoute: "Aucun parcours en fauteuil connecté n’a été trouvé dans les données téléchargées. Cela ne veut pas dire qu’il n’en existe aucun.",
      planned: "Voici ce que le planificateur a produit à partir des données téléchargées. Rien n’a été vérifié sur place.",
      find: "Chercher des lieux pour {{field}}",
      matchesFor: "Lieux du jeu de données pour {{field}}",
      noMatches: "Aucun lieu du jeu de données ne correspond à ce texte.",
      searchFailed: "La recherche de lieux n’a pas pu être lue. Rien n’est affiché.",
      use: "Choisir ce lieu",
      useName: "Choisir ce lieu\u00a0: {{name}}",
      chosen: "Choisi dans la recherche de lieux\u00a0: {{name}}",
      notices: "Remarques du planificateur",
      endpoint: "{{role}}\u00a0: {{name}}. Position selon {{source}}, {{licence}}, {{date}}, niveau {{tier}}.",
      stepFree: "Aucune marche ni bordure surélevée n’est enregistrée sur ses segments dans les données téléchargées. Rien n’a été vérifié sur place.",
      unknownAccess: "Certains segments ont des caractéristiques d’accès inconnues\u00a0; l’accès sans marche n’est donc pas confirmé.",
      metres: "{{distance}}\u00a0m",
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
