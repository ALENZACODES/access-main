import { en } from "../../i18n/en.ts";
import { fr } from "../../i18n/fr.ts";
import type { NoticeItem } from "./render.ts";

function item(
  id: string,
  key: keyof typeof en.privacyNotice,
  where: NoticeItem["where"],
): NoticeItem {
  return {
    id,
    label: { en: en.privacyNotice[key], fr: fr.privacyNotice[key] },
    where,
  };
}

/**
 * Inventory shown on the About page. Language choice is stored in this
 * browser. Optional geolocation is used by maps on this device and is not
 * uploaded by the shell.
 */
export function aboutNoticeItems(): NoticeItem[] {
  return [
    item("profile", "itemProfile", "on-device"),
    item("cache", "itemCache", "on-device"),
    item("outbox", "itemOutbox", "on-device"),
    item("language", "itemLanguage", "on-device"),
    item("geolocation", "itemGeolocation", "on-device"),
  ];
}
