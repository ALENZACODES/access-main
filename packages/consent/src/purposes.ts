import type { Purpose } from "./types.ts";

/**
 * Demonstration purposes. They show how the engine works and are labelled PROTOTYPE-UNVERIFIED.
 * Other packages decide what each purpose gates. This package only records the choice.
 * Bump `version` whenever the text or the data categories change.
 */
export const PURPOSES: readonly Purpose[] = [
  {
    record_type: "consent_purpose",
    schema_version: "consent-purpose-1.0.0",
    id: "store-preferences-on-device",
    version: 1,
    title: {
      en: "Keep my preferences on this device",
      fr: "Garder mes préférences sur cet appareil",
    },
    description: {
      en: "The App saves your display settings, route preferences and general equipment size choices in this device's storage so you do not have to enter them again. They are never sent to a server, a partner or another person. You can revoke this at any time.",
      fr: "L'application enregistre vos réglages d'affichage, vos préférences d'itinéraire et les dimensions générales de votre équipement dans la mémoire de cet appareil, pour que vous n'ayez pas à les saisir de nouveau. Ces données ne sont jamais envoyées à un serveur, à un partenaire ni à une autre personne. Vous pouvez révoquer ce choix en tout temps.",
    },
    data_categories: ["display_settings", "route_preferences", "equipment_size", "language"],
    leaves_device: false,
    prototype_label: "PROTOTYPE-UNVERIFIED",
  },
  {
    record_type: "consent_purpose",
    schema_version: "consent-purpose-1.0.0",
    id: "keep-places-offline",
    version: 1,
    title: {
      en: "Keep map and place data offline on this device",
      fr: "Garder les cartes et les lieux hors ligne sur cet appareil",
    },
    description: {
      en: "The App keeps copies of the open map and place data you open in this device's storage so they work without a connection. Which places you open is not sent anywhere. If you revoke this, the App stops keeping new copies.",
      fr: "L'application garde dans la mémoire de cet appareil des copies des données ouvertes de cartes et de lieux que vous consultez, pour qu'elles fonctionnent sans connexion. Les lieux que vous consultez ne sont envoyés nulle part. Si vous révoquez ce choix, l'application cesse de garder de nouvelles copies.",
    },
    data_categories: ["offline_map_cache"],
    leaves_device: false,
    prototype_label: "PROTOTYPE-UNVERIFIED",
  },
  {
    record_type: "consent_purpose",
    schema_version: "consent-purpose-1.0.0",
    id: "count-feature-use-locally",
    version: 1,
    title: {
      en: "Count which features I use, on this device only",
      fr: "Compter les fonctions que j'utilise, sur cet appareil seulement",
    },
    description: {
      en: "The App counts, on this device, how often you open each feature so it can show you shortcuts. The counts never leave this device and hold no place names and no personal details.",
      fr: "L'application compte, sur cet appareil, combien de fois vous ouvrez chaque fonction afin de vous proposer des raccourcis. Les compteurs ne quittent jamais cet appareil et ne contiennent ni nom de lieu ni renseignement personnel.",
    },
    data_categories: ["local_usage_counts"],
    leaves_device: false,
    prototype_label: "PROTOTYPE-UNVERIFIED",
  },
];
