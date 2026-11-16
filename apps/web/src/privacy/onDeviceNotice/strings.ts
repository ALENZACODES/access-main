// EN + FR copy for the on-device data notice. No data claims live here:
// callers say where each item is kept; anything not stated stays "unknown".
// FR typography: ’ apostrophe, U+00A0 before ":", U+202F before ; ! ? and inside « ».

export type Locale = "en" | "fr";
export type Where = "on-device" | "sent-to-server" | "unknown";

const NBSP = "\u00a0";

export interface NoticeStrings {
  title: string;
  where: Record<Where, string>;
  reviewed: (isoDate: string) => string;
  empty: string;
  dismiss: string;
}

export const STRINGS: Record<Locale, NoticeStrings> = {
  en: {
    title: "Where your data is kept",
    where: {
      "on-device": "Stays on this device",
      "sent-to-server": "Sent to a server",
      unknown: "Not known",
    },
    reviewed: (d) => `Last reviewed: ${d}`,
    empty: "This list is empty. That does not mean no data is kept.",
    dismiss: "Close",
  },
  fr: {
    title: "Où vos données sont conservées",
    where: {
      "on-device": "Reste sur cet appareil",
      "sent-to-server": "Envoyé à un serveur",
      unknown: "Inconnu",
    },
    reviewed: (d) => `Dernière révision${NBSP}: ${d}`,
    empty:
      "Cette liste est vide. Cela ne signifie pas qu’aucune donnée n’est conservée.",
    dismiss: "Fermer",
  },
};
