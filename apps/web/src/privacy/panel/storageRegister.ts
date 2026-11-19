// What the App's code saves in browser storage, key by key. The scan in audit/storageKeys.ts fails
// CI when a key appears in the source without a row here, so a new feature cannot start saving
// something silently. The privacy panel reads the same rows to tell the person what its erase button
// does not reach. Nothing here is read from a user's device.

import type { Bilingual } from "./inventory";

export interface RegisterRow {
  key: string;
  /** Repo-relative path of the file that names the key */
  path: string;
  /** What the key holds, in plain words */
  holds: Bilingual;
  /** True when saving it goes through the consent gate */
  gated: boolean;
  /** Where the statement came from */
  source: string;
  /** YYYY-MM-DD */
  recordedOn: string;
}

const REVIEWED = "2026-11-19";
const SOURCE = "Read from the source file named in the row";

export const STORAGE_REGISTER: readonly RegisterRow[] = [
  { key: "__map_tile_list", path: "apps/web/src/map/tileCache.ts", holds: { en: "The list of map tiles kept for offline use", fr: "La liste des tuiles de carte gardées pour l’usage hors ligne" }, gated: false, source: SOURCE, recordedOn: REVIEWED },
  { key: "access.language", path: "apps/web/src/i18n/index.ts", holds: { en: "The language you chose", fr: "La langue que vous avez choisie" }, gated: false, source: SOURCE, recordedOn: REVIEWED },
  { key: "access.language.set", path: "apps/web/src/i18n/index.ts", holds: { en: "A note that you chose the language yourself", fr: "Une note indiquant que vous avez choisi la langue vous-même" }, gated: false, source: SOURCE, recordedOn: REVIEWED },
  { key: "access.routeReports.v1", path: "apps/web/src/privacy/panel/live.ts", holds: { en: "Route reports you wrote on this device", fr: "Les signalements de parcours que vous avez rédigés sur cet appareil" }, gated: true, source: SOURCE, recordedOn: REVIEWED },
  { key: "app.corrections.v1", path: "apps/web/src/states/submissionQueue.ts", holds: { en: "Corrections you wrote and have not sent", fr: "Les corrections que vous avez rédigées et pas encore envoyées" }, gated: false, source: SOURCE, recordedOn: REVIEWED },
  { key: "app.pack-shortlist.v1", path: "apps/web/src/states/shortlist.ts", holds: { en: "The places you added to your list of saved places", fr: "Les lieux que vous avez ajoutés à votre liste de lieux enregistrés" }, gated: false, source: SOURCE, recordedOn: REVIEWED },
  { key: "app.preferences.v1", path: "apps/web/src/states/preferences.ts", holds: { en: "Your display preferences", fr: "Vos préférences d’affichage" }, gated: false, source: SOURCE, recordedOn: REVIEWED },
  { key: "data-status:history:v1", path: "apps/web/src/data-status/history.ts", holds: { en: "A history of data status checks", fr: "Un historique des contrôles de l’état des données" }, gated: false, source: SOURCE, recordedOn: REVIEWED },
  { key: "data-status:saved-views:v1", path: "apps/web/src/data-status/savedViews.ts", holds: { en: "Views of the data status page you saved", fr: "Les vues de la page sur l’état des données que vous avez enregistrées" }, gated: false, source: SOURCE, recordedOn: REVIEWED },
  { key: "data-status:snapshot:v1", path: "apps/web/src/data-status/snapshot.ts", holds: { en: "The last data status snapshot", fr: "Le dernier aperçu de l’état des données" }, gated: false, source: SOURCE, recordedOn: REVIEWED },
];

/**
 * Storage the scan cannot see. The name of the key is UNKNOWN because it is set inside a
 * package that is not in this repository's source tree.
 */
export interface UnscannedRow {
  where: string;
  holds: Bilingual;
  key: "UNKNOWN";
  recordedOn: string;
}

export const UNSCANNED: readonly UnscannedRow[] = [
  {
    where: "apps/web/src/hub/PeerRequestPage.tsx (the connection request store from the peers package)",
    holds: { en: "Connection requests you made", fr: "Les demandes de connexion que vous avez faites" },
    key: "UNKNOWN",
    recordedOn: REVIEWED,
  },
];
