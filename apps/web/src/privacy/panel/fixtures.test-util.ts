import type { InventoryEntry } from "./inventory";

/** Test-only entries. They describe nothing about the real App. */
export const FIXTURE: readonly InventoryEntry[] = [
  {
    id: "saved-places",
    label: { en: "Saved places", fr: "Lieux enregistrés" },
    where: "on-device",
    purpose: { en: "Show them again next time", fr: "Les afficher de nouveau la prochaine fois" },
    keptFor: { en: "Until you erase them", fr: "Jusqu’à ce que vous les effaciez" },
    source: { en: "Test fixture", fr: "Données d’essai" },
    recordedOn: "2026-11-15",
  },
  {
    id: "feedback-note",
    label: { en: "Feedback <note>", fr: "Commentaire" },
    where: "sent-to-server",
    source: { en: "Test fixture", fr: "Données d’essai" },
    licence: "CC0-1.0",
    recordedOn: "2026-11-14",
  },
  {
    id: "settings",
    label: { en: "Settings", fr: "Réglages" },
    source: { en: "Test fixture", fr: "Données d’essai" },
    recordedOn: "2026-11-13",
  },
];

export const PREFIX = "app.";
