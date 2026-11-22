import type { QueueStatus } from "./queue";

export type QueueLanguage = "en" | "fr";

interface QueueLabels {
  title: string;
  introduction: string;
  session: string;
  picker: string;
  choose: string;
  add: string;
  noCatalog: string;
  allListed: string;
  list: string;
  start: string;
  resume: string;
  pause: string;
  pausing: string;
  clearCompleted: string;
  statusLabel: string;
  startError: string;
  paused: string;
  ready: (count: number) => string;
  savedCount: (saved: number, count: number) => string;
  active: (name: string) => string;
  stopped: (name: string) => string;
  offline: string;
  occupied: string;
  waiting: string;
  closed: string;
  absent: string;
  moveUp: (name: string) => string;
  moveDown: (name: string) => string;
  remove: (name: string) => string;
  up: string;
  down: string;
  removeLabel: string;
  outcomes: Record<QueueStatus, string>;
}

export const queueCopy: Record<QueueLanguage, QueueLabels> = {
  en: {
    title: "Region download queue",
    introduction: "Choose regions and arrange them in download order. Starting the queue downloads one region at a time. A problem stops the queue so you can decide what to do next.",
    session: "Pausing stops at a cell boundary. A cell already being received may finish. Closing pauses the queue and discards the list. The results describe the last download. Saved cells stay on this device.",
    picker: "Region to add",
    choose: "Choose a region",
    add: "Add to queue",
    noCatalog: "There are no regions to choose from in the current listing.",
    allListed: "Each listed region is already saved or in the queue.",
    list: "Queued regions",
    start: "Start downloads",
    resume: "Continue downloads",
    pause: "Pause queue",
    pausing: "Pausing downloads…",
    clearCompleted: "Remove saved entries from the list",
    statusLabel: "Download queue status",
    startError: "The queue could not start. Your list is still available.",
    paused: "The queue is paused.",
    ready: (count) => count === 0 ? "The queue is empty." : count === 1 ? "One region in the queue." : `${count} regions in the queue.`,
    savedCount: (saved, count) => `${saved} of ${count} saved.`,
    active: (name) => `Downloading ${name}.`,
    stopped: (name) => `Queue stopped at ${name}.`,
    offline: "You can arrange the list offline. When connected, select the download button to start or continue.",
    occupied: "Another operation is using the region packs. Try starting the queue after it finishes.",
    waiting: "Waiting to start the queue…",
    closed: "The region queue finished.",
    absent: "No longer in the current region listing.",
    moveUp: (name) => `Move ${name} up`,
    moveDown: (name) => `Move ${name} down`,
    remove: (name) => `Remove ${name} from the queue`,
    up: "Up",
    down: "Down",
    removeLabel: "Remove",
    outcomes: {
      pending: "Waiting",
      active: "Downloading",
      complete: "Saved",
      interrupted: "Paused. Continue when ready.",
      quota: "Insufficient storage. Make room before continuing.",
      error: "Download stopped. Try again when ready.",
      unavailable: "Region unavailable. Review the listing or remove this entry.",
    },
  },
  fr: {
    title: "File de téléchargement des régions",
    introduction: "Choisissez des régions et établissez leur ordre de téléchargement. Le lancement de la file télécharge une région à la fois. En cas de problème, la file s’arrête pour vous permettre de choisir la suite.",
    session: "La suspension prend effet entre deux cellules. La réception d’une cellule en cours peut se terminer. Fermer la file suspend les téléchargements et efface la liste. Les résultats décrivent le dernier téléchargement. Les cellules enregistrées restent sur cet appareil.",
    picker: "Région à ajouter",
    choose: "Choisir une région",
    add: "Ajouter à la file",
    noCatalog: "La liste actuelle ne propose aucune région.",
    allListed: "Chaque région proposée est déjà enregistrée ou se trouve dans la file.",
    list: "Régions dans la file",
    start: "Lancer les téléchargements",
    resume: "Reprendre les téléchargements",
    pause: "Suspendre la file",
    pausing: "Suspension des téléchargements…",
    clearCompleted: "Retirer de la liste les entrées enregistrées",
    statusLabel: "État de la file de téléchargement",
    startError: "La file n’a pas pu démarrer. Votre liste reste disponible.",
    paused: "La file est en pause.",
    ready: (count) => count === 0 ? "La file est vide." : count === 1 ? "Une région dans la file." : `${count} régions dans la file.`,
    savedCount: (saved, count) => `Régions enregistrées\u00a0: ${saved} sur ${count}.`,
    active: (name) => `Téléchargement en cours\u00a0: ${name}.`,
    stopped: (name) => `La file s’est arrêtée à la région ${name}.`,
    offline: "Vous pouvez organiser la liste hors ligne. Une fois la connexion rétablie, utilisez le bouton de téléchargement pour lancer ou reprendre la file.",
    occupied: "Une autre opération utilise les packs régionaux. Essayez de lancer la file une fois cette opération terminée.",
    waiting: "En attente du lancement de la file…",
    closed: "Le téléchargement des régions de la file est terminé.",
    absent: "Cette région ne figure plus dans la liste actuelle.",
    moveUp: (name) => `Déplacer ${name} vers le haut`,
    moveDown: (name) => `Déplacer ${name} vers le bas`,
    remove: (name) => `Retirer ${name} de la file`,
    up: "Vers le haut",
    down: "Vers le bas",
    removeLabel: "Retirer",
    outcomes: {
      pending: "En attente",
      active: "Téléchargement en cours",
      complete: "Enregistrée",
      interrupted: "En pause. Reprenez le téléchargement à votre convenance.",
      quota: "Espace de stockage insuffisant. Libérez de l’espace avant de reprendre.",
      error: "Téléchargement arrêté. Vous pouvez réessayer à votre convenance.",
      unavailable: "Région indisponible. Consultez la liste ou retirez cette entrée.",
    },
  },
};
