// The privacy panel's own storage, described in the same data list as the rest.
// Each entry is included only when the feature that writes it is switched on,
// so the list never claims more than the App does.

import { ACTIVITY_KEY_SUFFIX, ACTIVITY_TTL_DAYS } from "./activityLog";
import { SEEN_KEY_SUFFIX, SEEN_TTL_DAYS } from "./changes";
import { CONSENT_KEY_SUFFIX } from "./consent";
import type { InventoryEntry } from "./inventory";
import { PREFS_KEY_SUFFIX } from "./preferences";

export interface OwnEntryOptions {
  consent: boolean;
  activity: boolean;
  changes: boolean;
}

const SOURCE = { en: "Privacy panel code", fr: "Code du panneau de confidentialité" };
const RECORDED_ON = "2026-11-15";
const UNTIL_ERASED = { en: "Until you erase local data", fr: "Jusqu’à ce que vous effaciez les données locales" };

export function ownEntries(o: OwnEntryOptions): InventoryEntry[] {
  const out: InventoryEntry[] = [
    {
      id: "privacy-language",
      label: { en: "Your language choice", fr: "Votre choix de langue" },
      where: "on-device",
      purpose: { en: "Show the privacy page in your language", fr: "Afficher la page de confidentialité dans votre langue" },
      keptFor: UNTIL_ERASED,
      storageKeys: [PREFS_KEY_SUFFIX],
      source: SOURCE,
      recordedOn: RECORDED_ON,
    },
  ];
  if (o.consent) {
    out.push({
      id: "privacy-consent",
      label: { en: "Your choices about optional features", fr: "Vos choix sur les fonctions facultatives" },
      where: "on-device",
      purpose: { en: "Remember what you allowed and when", fr: "Se souvenir de ce que vous avez autorisé et quand" },
      keptFor: UNTIL_ERASED,
      storageKeys: [CONSENT_KEY_SUFFIX],
      source: SOURCE,
      recordedOn: RECORDED_ON,
    });
  }
  if (o.activity) {
    out.push({
      id: "privacy-activity",
      label: { en: "Recent privacy actions", fr: "Actions récentes de confidentialité" },
      where: "on-device",
      purpose: { en: "Show you what you did on this page", fr: "Vous montrer ce que vous avez fait sur cette page" },
      keptFor: {
        en: `Up to ${ACTIVITY_TTL_DAYS} days after the latest action`,
        fr: `Jusqu’à ${ACTIVITY_TTL_DAYS} jours après la dernière action`,
      },
      storageKeys: [ACTIVITY_KEY_SUFFIX],
      source: SOURCE,
      recordedOn: RECORDED_ON,
    });
  }
  if (o.changes) {
    out.push({
      id: "privacy-seen",
      label: { en: "The last data list you saw", fr: "La dernière liste de données que vous avez vue" },
      where: "on-device",
      purpose: { en: "Tell you what changed in the list", fr: "Vous indiquer ce qui a changé dans la liste" },
      keptFor: {
        en: `Up to ${SEEN_TTL_DAYS} days after you last marked the list as seen`,
        fr: `Jusqu’à ${SEEN_TTL_DAYS} jours après la dernière fois que vous avez marqué la liste comme vue`,
      },
      storageKeys: [SEEN_KEY_SUFFIX],
      source: SOURCE,
      recordedOn: RECORDED_ON,
    });
  }
  return out;
}
