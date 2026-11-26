import type { ShellReport } from "./probe";

export type ShellLanguage = "en" | "fr";
type File = ShellReport["files"][number];
type Worker = ShellReport["worker"];
export type ShellFilter = "all" | File["state"];

interface PanelCopy {
  title: string;
  intro: string;
  start: string;
  repeat: string;
  retry: string;
  cancel: string;
  reading: string;
  cancelled: string;
  error: string;
  finished: (files: number) => string;
  resultTitle: string;
  earlierTitle: string;
  partial: string;
  worker: Record<Worker, string>;
  filter: string;
  options: Record<ShellFilter, string>;
  fileCount: (shown: number, total: number) => string;
  empty: string;
  emptySelection: string;
  groups: Record<File["kind"], string>;
  state: Record<File["state"], string>;
  meaning: string;
  definitions: Record<File["state"], string>;
  scope: string;
}

export const panelCopy: Record<ShellLanguage, PanelCopy> = {
  en: {
    title: "Check the app’s startup files",
    intro: "Look for saved copies of the app’s page document and the scripts, style sheets and modules this page currently lists for loading. The check reads the browser’s local cache.",
    start: "Check startup files",
    repeat: "Check startup files again",
    retry: "Try the file check again",
    cancel: "Cancel file check",
    reading: "Checking the browser’s saved copies…",
    cancelled: "File check cancelled.",
    error: "The file check could not finish. You can try again.",
    finished: (files) => files === 1
      ? "File check finished. 1 file listed."
      : `File check finished. ${files} files listed.`,
    resultTitle: "File check results",
    earlierTitle: "Last completed file check",
    partial: "Only part of the startup file list could be inspected. The counts cover the entries listed here.",
    worker: {
      controlled: "The app’s offline worker controls this page.",
      uncontrolled: "This page has no controlling offline worker. Opening the app with a connection and reloading the page may help.",
      unavailable: "The browser could not provide the information needed to identify this app’s offline worker.",
      "different-scope": "The offline worker for this page does not match this app’s installation. Its cache cannot establish which files belong to this app.",
    },
    filter: "Show files",
    options: { all: "All results", present: "Saved copy found", missing: "Saved copy missing", unknown: "UNKNOWN" },
    fileCount: (shown, total) => `Showing ${shown} of ${total} ${total === 1 ? "file" : "files"}.`,
    empty: "No startup files could be listed for this page.",
    emptySelection: "No files have the selected result. Choose All results to view the list.",
    groups: { document: "Page document", script: "Startup scripts", style: "Style sheets", preload: "Module preload hints" },
    state: { present: "Saved", missing: "Missing", unknown: "UNKNOWN" },
    meaning: "How to read these results",
    definitions: {
      present: "The saved response matched the expected address and file type. The check reads the response headers and leaves the file contents unopened.",
      missing: "The browser finished the lookup and found no saved copy for this file.",
      unknown: "The available information could not establish whether the cache has a matching response for this file.",
    },
    scope: "The list includes the app’s page document and files declared in the page header when you run the check. A preload hint asks the browser to prepare a module it may use later. Other files loaded by scripts, region packs and personal records fall outside this check.",
  },
  fr: {
    title: "Examiner les fichiers de démarrage de l’appli",
    intro: "Cherchez une copie du document de l’appli ainsi que des scripts, feuilles de style et modules que cette page déclare actuellement pour le chargement. L’examen consulte le cache local du navigateur.",
    start: "Examiner les fichiers de démarrage",
    repeat: "Réexaminer les fichiers de démarrage",
    retry: "Réessayer l’examen des fichiers",
    cancel: "Annuler l’examen des fichiers",
    reading: "Examen des copies conservées par le navigateur…",
    cancelled: "L’examen des fichiers a été annulé.",
    error: "L’examen des fichiers a été interrompu. Vous pouvez réessayer.",
    finished: (files) => files === 1
      ? "Examen terminé. 1 fichier dans la liste."
      : `Examen terminé. ${files} fichiers dans la liste.`,
    resultTitle: "Résultats de l’examen des fichiers",
    earlierTitle: "Dernier examen terminé",
    partial: "L’examen couvre une partie des fichiers de démarrage. Les totaux portent sur les entrées de cette liste.",
    worker: {
      controlled: "Le service hors ligne de l’appli contrôle cette page.",
      uncontrolled: "Aucun service hors ligne ne contrôle cette page. Essayez d’ouvrir l’appli avec une connexion, puis de recharger la page.",
      unavailable: "Le navigateur n’a pas pu fournir les renseignements nécessaires pour identifier le service hors ligne de l’appli.",
      "different-scope": "Le service hors ligne de cette page ne correspond pas à cette installation de l’appli. Son cache ne permet pas de déterminer quels fichiers appartiennent à l’appli.",
    },
    filter: "Afficher les fichiers",
    options: { all: "Tous les résultats", present: "Copie trouvée", missing: "Copie absente", unknown: "UNKNOWN" },
    fileCount: (shown, total) => `Fichiers affichés\u00a0: ${shown} sur ${total}.`,
    empty: "Aucun fichier de démarrage n’a pu être répertorié pour cette page.",
    emptySelection: "Aucun fichier ne correspond au résultat choisi. Sélectionnez Tous les résultats pour afficher la liste.",
    groups: { document: "Document de la page", script: "Scripts de démarrage", style: "Feuilles de style", preload: "Indications de préchargement des modules" },
    state: { present: "En cache", missing: "Absent", unknown: "UNKNOWN" },
    meaning: "Comment lire ces résultats",
    definitions: {
      present: "L’adresse et le type de fichier de la réponse en cache correspondent à ceux attendus. L’examen lit les en-têtes de la réponse sans ouvrir le contenu du fichier.",
      missing: "Le navigateur a terminé sa recherche sans trouver de copie de ce fichier dans le cache.",
      unknown: "Les renseignements disponibles ne permettent pas de déterminer si le cache contient une réponse qui correspond à ce fichier.",
    },
    scope: "La liste comprend le document de l’appli et les fichiers déclarés dans l’en-tête de la page au moment de l’examen. Une indication de préchargement demande au navigateur de préparer un module qui pourrait servir plus tard. Les autres fichiers chargés par les scripts, les packs régionaux et les données personnelles sont exclus de cet examen.",
  },
};
