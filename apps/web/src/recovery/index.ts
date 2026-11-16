/** Recovery states never imply that partial data is complete. */
export type RecoveryLocale = "en" | "fr";
export type RecoveryOperation = "pack" | "download" | "export";
export type RecoveryReason =
  | "offline"
  | "quota"
  | "permission"
  | "interrupted"
  | "invalid-data"
  | "unknown";
export type RecoveryAction = "retry" | "free-space" | "check-input";

/** Only supplied provenance is displayed; no source or licence is inferred. */
export interface RecoverySource {
  readonly name: string;
  readonly licence: string;
  /** ISO 8601 calendar date of the source, if known to the caller. */
  readonly date: string;
}

export interface RecoveryFailure {
  readonly operation: RecoveryOperation;
  readonly reason: RecoveryReason;
  readonly source?: RecoverySource;
}

export interface RecoveryMessage {
  readonly title: string;
  readonly description: string;
  readonly actionLabel: string;
  readonly dismissLabel: string;
  readonly action: RecoveryAction;
}

type MessageCopy = Pick<
  RecoveryMessage,
  "title" | "description" | "actionLabel" | "action"
>;
type CopyTable = Readonly<
  Record<RecoveryOperation, Readonly<Record<RecoveryReason, MessageCopy>>>
>;

const EN: CopyTable = {
  pack: {
    offline: {
      title: "Pack unavailable",
      description: "The pack could not be opened offline. Reconnect and try again.",
      actionLabel: "Try again",
      action: "retry",
    },
    quota: {
      title: "Not enough storage",
      description: "The pack was not saved. Free up device space before trying again.",
      actionLabel: "Storage guidance",
      action: "free-space",
    },
    permission: {
      title: "Pack access blocked",
      description: "The pack could not be accessed. Check browser or device permissions.",
      actionLabel: "Try again",
      action: "retry",
    },
    interrupted: {
      title: "Pack interrupted",
      description: "The pack operation did not finish. Do not use it as a complete pack.",
      actionLabel: "Try again",
      action: "retry",
    },
    "invalid-data": {
      title: "Pack could not be read",
      description: "The pack data is not in the expected format. Check the source file.",
      actionLabel: "Check file",
      action: "check-input",
    },
    unknown: {
      title: "Pack operation failed",
      description: "The cause is unknown. The pack has not been confirmed complete.",
      actionLabel: "Try again",
      action: "retry",
    },
  },
  download: {
    offline: {
      title: "Download unavailable",
      description: "The download did not finish offline. Reconnect and try again.",
      actionLabel: "Try again",
      action: "retry",
    },
    quota: {
      title: "Not enough storage",
      description: "The download was not saved. Free up device space before trying again.",
      actionLabel: "Storage guidance",
      action: "free-space",
    },
    permission: {
      title: "Download blocked",
      description: "The file could not be saved. Check download permissions.",
      actionLabel: "Try again",
      action: "retry",
    },
    interrupted: {
      title: "Download interrupted",
      description: "The download did not finish. Do not use a partial file as a complete file.",
      actionLabel: "Try again",
      action: "retry",
    },
    "invalid-data": {
      title: "Download failed its checks",
      description: "The downloaded data did not match its expected size, fingerprint or record count. Nothing from it was saved.",
      actionLabel: "Try again",
      action: "retry",
    },
    unknown: {
      title: "Download failed",
      description: "The cause is unknown. The file has not been confirmed complete.",
      actionLabel: "Try again",
      action: "retry",
    },
  },
  export: {
    offline: {
      title: "Export unavailable",
      description: "The export did not finish. Check the connection if one is needed.",
      actionLabel: "Try again",
      action: "retry",
    },
    quota: {
      title: "Not enough storage",
      description: "The export was not saved. Free up device space before trying again.",
      actionLabel: "Storage guidance",
      action: "free-space",
    },
    permission: {
      title: "Export blocked",
      description: "The export could not be saved. Check file access permissions.",
      actionLabel: "Try again",
      action: "retry",
    },
    interrupted: {
      title: "Export interrupted",
      description: "The export did not finish. Do not share a partial file.",
      actionLabel: "Try again",
      action: "retry",
    },
    "invalid-data": {
      title: "Export data could not be read",
      description: "The data to export is not in the expected format. Correct it, then export again.",
      actionLabel: "Correct the data",
      action: "check-input",
    },
    unknown: {
      title: "Export failed",
      description: "The cause is unknown. No complete export has been confirmed.",
      actionLabel: "Try again",
      action: "retry",
    },
  },
};

const FR: CopyTable = {
  pack: {
    offline: {
      title: "Ensemble indisponible",
      description: "L’ensemble n’a pas pu être ouvert hors ligne. Rétablissez la connexion et réessayez.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    quota: {
      title: "Espace de stockage insuffisant",
      description: "L’ensemble n’a pas été enregistré. Libérez de l’espace avant de réessayer.",
      actionLabel: "Conseils de stockage",
      action: "free-space",
    },
    permission: {
      title: "Accès à l’ensemble bloqué",
      description: "L’ensemble est inaccessible. Contrôlez les autorisations du navigateur ou de l’appareil.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    interrupted: {
      title: "Opération interrompue",
      description: "L’opération sur l’ensemble est inachevée. Ne l’utilisez pas comme ensemble complet.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    "invalid-data": {
      title: "Lecture de l’ensemble impossible",
      description: "Les données ne respectent pas le format attendu. Contrôlez le fichier source.",
      actionLabel: "Contrôler le fichier",
      action: "check-input",
    },
    unknown: {
      title: "Échec de l’opération",
      description: "La cause est inconnue. L’ensemble n’a pas été confirmé comme complet.",
      actionLabel: "Réessayer",
      action: "retry",
    },
  },
  download: {
    offline: {
      title: "Téléchargement indisponible",
      description: "Le téléchargement est inachevé hors ligne. Rétablissez la connexion et réessayez.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    quota: {
      title: "Espace de stockage insuffisant",
      description: "Le téléchargement n’a pas été enregistré. Libérez de l’espace avant de réessayer.",
      actionLabel: "Conseils de stockage",
      action: "free-space",
    },
    permission: {
      title: "Téléchargement bloqué",
      description: "Le fichier n’a pas été enregistré. Contrôlez les autorisations de téléchargement.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    interrupted: {
      title: "Téléchargement interrompu",
      description: "Le téléchargement est inachevé. N’utilisez pas un fichier partiel comme fichier complet.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    "invalid-data": {
      title: "Échec des contrôles du téléchargement",
      description: "Les données téléchargées ne correspondent pas à la taille, à l’empreinte ou au nombre de fiches attendus. Rien n’a été enregistré.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    unknown: {
      title: "Échec du téléchargement",
      description: "La cause est inconnue. L’intégrité du fichier n’a pas été confirmée.",
      actionLabel: "Réessayer",
      action: "retry",
    },
  },
  export: {
    offline: {
      title: "Exportation indisponible",
      description: "L’exportation est inachevée. Contrôlez la connexion si elle est nécessaire.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    quota: {
      title: "Espace de stockage insuffisant",
      description: "L’exportation n’a pas été enregistrée. Libérez de l’espace avant de réessayer.",
      actionLabel: "Conseils de stockage",
      action: "free-space",
    },
    permission: {
      title: "Exportation bloquée",
      description: "L’exportation n’a pas été enregistrée. Contrôlez les autorisations d’accès aux fichiers.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    interrupted: {
      title: "Exportation interrompue",
      description: "L’exportation est inachevée. Ne partagez pas un fichier partiel.",
      actionLabel: "Réessayer",
      action: "retry",
    },
    "invalid-data": {
      title: "Données à exporter illisibles",
      description: "Les données à exporter ne respectent pas le format attendu. Corrigez-les, puis relancez l’exportation.",
      actionLabel: "Corriger les données",
      action: "check-input",
    },
    unknown: {
      title: "Échec de l’exportation",
      description: "La cause est inconnue. Aucune exportation complète n’a été confirmée.",
      actionLabel: "Réessayer",
      action: "retry",
    },
  },
};

export function getRecoveryMessage(
  failure: RecoveryFailure,
  locale: RecoveryLocale,
): RecoveryMessage {
  const copy = (locale === "fr" ? FR : EN)[failure.operation][failure.reason];
  return {
    ...copy,
    dismissLabel: locale === "fr" ? "Fermer" : "Dismiss",
  };
}

export { classifyPackDownloadError, classifyRecoveryError, runRecoverable, type RecoveryResult } from "./classify.ts";
export { RecoveryNotice, type RecoveryNoticeProps } from "./RecoveryNotice.tsx";

