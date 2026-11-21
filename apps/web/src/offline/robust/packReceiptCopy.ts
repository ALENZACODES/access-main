import type { Language } from "./regionDownload";
import type { ReceiptChange, ReceiptFilter, ReceiptOrder } from "./packReceipt";

export const PACK_RECEIPT_COPY = {
  en: {
    title: "Offline pack receipts",
    open: "Open offline pack receipts",
    close: "Close offline pack receipts",
    compared: "Latest readings compared.",
    intro: "Record a portable summary of the listed offline cells and compare two readings. Receipt files contain metadata, not downloaded content.",
    caution: "A receipt is a historical record. An imported receipt does not describe what is currently saved on this device or establish physical access.",
    digest: "SHA-256 digest",
    capture: "Record current reading",
    compare: "Compare latest readings",
    exportJson: "Export receipt history JSON",
    exportText: "Export receipt comparison text",
    importJson: "Import receipt history JSON",
    clear: "Clear page history",
    empty: "No receipt has been recorded on this page.",
    one: "Record another reading to compare changes.",
    captured: "Receipt recorded in this page.",
    imported: "Receipt history imported. Current device storage has not been checked by the import.",
    exported: "Receipt export prepared. Keep the file in a private location.",
    cleared: "Receipt history cleared from this page.",
    digestMatches: "The receipt digest matches its recorded contents.",
    digestMismatch: "The receipt digest does not match its recorded contents.",
    invalid: "The receipt file could not be read safely.",
    tooLarge: "The receipt file exceeds the size limit.",
    full: "The receipt history has reached its capture limit.",
    error: "The requested action could not be completed.",
    busy: "Preparing receipt…",
    summary: "Latest reading",
    captures: "Recorded readings",
    saved: "Saved copies",
    unknown: "UNKNOWN copies",
    changed: "Changed cells",
    bytes: "Listed bytes",
    capturedAt: "Reading time",
    status: "Reading status",
    region: "Region",
    search: "Search cell or source",
    filter: "Filter changes",
    order: "Sort results",
    page: "Receipt comparison pages",
    previous: "Previous page",
    next: "Next page",
    position: "Showing",
    noRows: "No matching cells.",
    cell: "Cell",
    change: "Change",
    source: "Source",
    licence: "Licence",
    date: "Source date",
    size: "Listed bytes",
    before: "Earlier reading",
    after: "Later reading",
    earlierState: "Earlier local state",
    laterState: "Later local state",
    currentUnavailable: "A receipt is not a current storage check.",
    digestHelp: "The digest detects changes to the receipt contents. It is not a signature or a source attestation.",
    historyLimit: "Up to twelve readings can be kept on this page.",
  },
  fr: {
    title: "Reçus des packs hors ligne",
    open: "Ouvrir les reçus des packs hors ligne",
    close: "Fermer les reçus des packs hors ligne",
    compared: "Les dernières lectures ont été comparées.",
    intro: "Enregistrez un résumé transférable des cellules répertoriées et comparez deux lectures. Les reçus contiennent des métadonnées, pas le contenu téléchargé.",
    caution: "Un reçu est un document historique. Un reçu importé ne décrit pas ce qui est actuellement enregistré sur cet appareil et n’établit pas l’accès physique.",
    digest: "Empreinte SHA-256",
    capture: "Enregistrer la lecture actuelle",
    compare: "Comparer les dernières lectures",
    exportJson: "Exporter l’historique JSON des reçus",
    exportText: "Exporter la comparaison des reçus en texte",
    importJson: "Importer l’historique JSON des reçus",
    clear: "Effacer l’historique de la page",
    empty: "Aucun reçu n’a été enregistré sur cette page.",
    one: "Enregistrez une autre lecture pour comparer les changements.",
    captured: "Reçu enregistré sur cette page.",
    imported: "Historique des reçus importé. L’importation n’a pas contrôlé le stockage actuel de cet appareil.",
    exported: "Export du reçu préparé. Conservez le fichier dans un lieu privé.",
    cleared: "Historique des reçus effacé de cette page.",
    digestMatches: "L’empreinte du reçu correspond à son contenu enregistré.",
    digestMismatch: "L’empreinte du reçu ne correspond pas à son contenu enregistré.",
    invalid: "Impossible de lire le fichier de reçus de manière sûre.",
    tooLarge: "Le fichier de reçus dépasse la taille maximale.",
    full: "L’historique des reçus a atteint sa limite de lectures.",
    error: "Impossible d’effectuer l’action demandée.",
    busy: "Préparation du reçu…",
    summary: "Dernière lecture",
    captures: "Lectures enregistrées",
    saved: "Copies enregistrées",
    unknown: "Copies UNKNOWN",
    changed: "Cellules modifiées",
    bytes: "Octets répertoriés",
    capturedAt: "Heure de lecture",
    status: "État de la lecture",
    region: "Région",
    search: "Chercher une cellule ou une source",
    filter: "Filtrer les changements",
    order: "Trier les résultats",
    page: "Pages de comparaison des reçus",
    previous: "Page précédente",
    next: "Page suivante",
    position: "Affichage",
    noRows: "Aucune cellule correspondante.",
    cell: "Cellule",
    change: "Changement",
    source: "Source",
    licence: "Licence",
    date: "Date de la source",
    size: "Octets répertoriés",
    before: "Lecture précédente",
    after: "Lecture suivante",
    earlierState: "État local précédent",
    laterState: "État local suivant",
    currentUnavailable: "Un reçu ne constitue pas un contrôle du stockage actuel.",
    digestHelp: "L’empreinte détecte les changements du contenu du reçu. Ce n’est ni une signature ni une attestation de source.",
    historyLimit: "Jusqu’à douze lectures peuvent être conservées sur cette page.",
  },
} as const satisfies Record<Language, Record<string, string>>;

export const RECEIPT_FILTERS: readonly ReceiptFilter[] = ["all", "changed", "saved", "lost", "UNKNOWN", "added", "removed"];
export const RECEIPT_ORDERS: readonly ReceiptOrder[] = ["listed", "id", "largest", "source", "change"];

const CHANGE_TEXT: Readonly<Record<Language, Readonly<Record<ReceiptChange, string>>>> = {
  en: {
    unchanged: "No listed change",
    saved: "Copy saved in later reading",
    lost: "Previously saved copy is no longer listed as saved",
    "source-changed": "Source details changed",
    "size-changed": "Listed byte count changed",
    added: "Cell added to the listing",
    removed: "Cell removed from the listing",
    UNKNOWN: "UNKNOWN",
  },
  fr: {
    unchanged: "Aucun changement répertorié",
    saved: "Copie enregistrée dans la lecture suivante",
    lost: "La copie précédemment enregistrée n’est plus indiquée comme enregistrée",
    "source-changed": "Les détails de la source ont changé",
    "size-changed": "Le nombre d’octets répertoriés a changé",
    added: "Cellule ajoutée à la liste",
    removed: "Cellule retirée de la liste",
    UNKNOWN: "UNKNOWN",
  },
};

export function receiptChangeText(change: ReceiptChange, language: Language): string {
  return CHANGE_TEXT[language][change];
}

export function receiptFilterText(filter: ReceiptFilter, language: Language): string {
  const en: Record<ReceiptFilter, string> = {
    all: "All cells", changed: "Changed cells", saved: "Saved later", lost: "No longer saved",
    UNKNOWN: "UNKNOWN", added: "Added", removed: "Removed",
  };
  const fr: Record<ReceiptFilter, string> = {
    all: "Toutes les cellules", changed: "Cellules modifiées", saved: "Enregistrées ensuite",
    lost: "Non enregistrées ensuite", UNKNOWN: "UNKNOWN", added: "Ajoutées", removed: "Retirées",
  };
  return language === "fr" ? fr[filter] : en[filter];
}

export function receiptOrderText(order: ReceiptOrder, language: Language): string {
  const en: Record<ReceiptOrder, string> = {
    listed: "Listed order", id: "Cell ID", largest: "Largest first", source: "Source name", change: "Change type",
  };
  const fr: Record<ReceiptOrder, string> = {
    listed: "Ordre de la liste", id: "Identifiant de cellule", largest: "Plus volumineuses d’abord",
    source: "Nom de la source", change: "Type de changement",
  };
  return language === "fr" ? fr[order] : en[order];
}
