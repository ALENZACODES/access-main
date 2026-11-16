// EN + FR copy for the on-device data notice lives in the shell catalogs
// (`apps/web/src/i18n/en.ts` and `fr.ts`, under `privacyNotice`) so the Day 24
// typography and banned-term sweep covers it. This module only maps those
// strings into the notice renderer. No data claims live here: callers say
// where each item is kept; anything not stated stays "unknown".

import { en } from "../../i18n/en.ts";
import { fr } from "../../i18n/fr.ts";

export type Locale = "en" | "fr";
export type Where = "on-device" | "sent-to-server" | "unknown";

export interface NoticeStrings {
  title: string;
  where: Record<Where, string>;
  reviewed: (isoDate: string) => string;
  empty: string;
  dismiss: string;
}

function fromCatalog(catalog: typeof en.privacyNotice): NoticeStrings {
  return {
    title: catalog.title,
    where: {
      "on-device": catalog.whereOnDevice,
      "sent-to-server": catalog.whereSentToServer,
      unknown: catalog.whereUnknown,
    },
    reviewed: (date) => catalog.reviewed.replaceAll("{{date}}", date),
    empty: catalog.empty,
    dismiss: catalog.dismiss,
  };
}

export const STRINGS: Record<Locale, NoticeStrings> = {
  en: fromCatalog(en.privacyNotice),
  fr: fromCatalog(fr.privacyNotice),
};
