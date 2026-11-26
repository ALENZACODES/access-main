import type { SetProblemCode } from "./model";
import type { ReceiptIssue } from "./receipt";
import type { PlanIssueCode } from "./planner";

export type MultipartLocale = "en" | "fr";
export interface MultipartCopy {
  readonly title: string;
  readonly description: string;
  readonly caution: string;
  readonly addFiles: string;
  readonly chooseFiles: string;
  readonly create: string;
  readonly open: string;
  readonly clear: string;
  readonly cancel: string;
  readonly savePart: string;
  readonly saveMember: string;
  readonly saveReceipt: string;
  readonly parts: string;
  readonly members: string;
  readonly bytes: string;
  readonly setId: string;
  readonly receipt: string;
  readonly opened: string;
  readonly openedHeading: string;
  readonly created: string;
  readonly checking: string;
  readonly saving: string;
  readonly cleared: string;
  readonly failed: string;
  readonly empty: string;
  readonly noFiles: string;
  readonly selectFirst: string;
  readonly fileName: string;
  readonly memberKind: string;
  readonly recordCount: string;
  readonly receiptMatches: string;
  readonly receiptDiffers: string;
  readonly chooseReceipt: string;
  readonly compareReceipt: string;
  readonly planning: string;
  readonly planSummary: string;
  readonly issues: Readonly<Record<SetProblemCode | PlanIssueCode, string>>;
  readonly receiptIssues: Readonly<Record<ReceiptIssue, string>>;
}

const en: MultipartCopy = {
  title: "Multi-part recovery transfer",
  description: "Create one transfer file from several ordinary recovery bundles. The original exports remain unchanged and can be saved individually after the complete set is checked.",
  caution: "A set is complete only when every numbered part is present and its contents pass the checks. A matching fingerprint compares bytes; it does not identify a sender or establish that the records are accurate.",
  addFiles: "Build a multi-part transfer",
  chooseFiles: "Choose two or more recovery JSON exports",
  create: "Create multi-part transfer",
  open: "Open multi-part transfer",
  clear: "Clear multi-part selection",
  cancel: "Cancel",
  savePart: "Save ordinary bundle part",
  saveMember: "Save original export",
  saveReceipt: "Save counts-only receipt",
  parts: "Parts",
  members: "Exports",
  bytes: "Original bytes",
  setId: "Transfer set fingerprint",
  receipt: "Transfer receipt",
  opened: "All parts passed their checks. Individual exports are available below.",
  openedHeading: "Opened transfer set",
  created: "Multi-part transfer file is ready to save.",
  checking: "Checking selected exports…",
  saving: "Preparing the transfer set…",
  cleared: "Selection cleared.",
  failed: "The browser could not read or save the selected file.",
  empty: "No files selected.",
  noFiles: "Choose recovery exports before creating a transfer set.",
  selectFirst: "Choose a multi-part transfer file.",
  fileName: "File",
  memberKind: "Export type",
  recordCount: "Records",
  receiptMatches: "The receipt matches this opened set.",
  receiptDiffers: "The receipt does not match every detail of this set.",
  chooseReceipt: "Choose a separate counts-only receipt",
  compareReceipt: "Compare receipt",
  planning: "Transfer plan",
  planSummary: "The selected files will be kept in their chosen order and divided into numbered parts.",
  issues: {
    empty: "Choose at least one recovery export.",
    "part-count": "The selection does not require a multi-part set or exceeds the part limit.",
    "member-count": "The selection exceeds the total number of exports allowed.",
    "member-size": "An export exceeds its individual size limit.",
    "total-size": "The combined original files exceed the total size limit.",
    "part-size": "A numbered bundle part exceeds its size limit.",
    "set-size": "The complete transfer file exceeds its size limit.",
    read: "A file could not be read completely.",
    encoding: "The transfer file is not valid UTF-8.",
    envelope: "The transfer file has an invalid structure.",
    version: "This transfer-set version is not supported.",
    payload: "A part contains invalid encoded data.",
    digest: "A part does not match its recorded fingerprint.",
    identity: "The transfer-set fingerprint does not match its parts.",
    duplicate: "The same export appears more than once.",
    incomplete: "A numbered part is missing or out of order.",
    crypto: "The browser could not calculate a fingerprint.",
    "native-bundle": "A part is not a valid ordinary recovery bundle.",
    "invalid-candidate": "An export has invalid size or fingerprint details.",
    "duplicate-digest": "The same export appears more than once.",
    "record-count": "An export reports an invalid record count.",
  },
  receiptIssues: {
    size: "The receipt exceeds its size limit.",
    format: "The receipt format is invalid.",
    identity: "The receipt identity is invalid.",
    count: "The receipt counts are invalid.",
    digest: "A receipt fingerprint is invalid.",
    incomplete: "The receipt does not list every part.",
    mismatch: "The receipt does not match this transfer set.",
  },
};

const fr: MultipartCopy = {
  title: "Transfert de récupération en plusieurs parties",
  description: "Créez un seul fichier de transfert à partir de plusieurs lots de récupération ordinaires. Les fichiers exportés d’origine restent inchangés et peuvent être enregistrés séparément après le contrôle de l’ensemble.",
  caution: "État des données : UNKNOWN. Un ensemble est complet seulement si toutes les parties numérotées sont présentes et si leur contenu passe les contrôles. Une empreinte compare les octets; elle n’identifie pas l’expéditeur et ne confirme pas l’exactitude des dossiers. Conservez la mention « UNKNOWN » lorsque les renseignements manquent.",
  addFiles: "Préparer un transfert en plusieurs parties",
  chooseFiles: "Choisir au moins deux fichiers JSON de récupération",
  create: "Créer un transfert en plusieurs parties",
  open: "Ouvrir un transfert en plusieurs parties",
  clear: "Effacer la sélection en plusieurs parties",
  cancel: "Annuler",
  savePart: "Enregistrer une partie de lot ordinaire",
  saveMember: "Enregistrer le fichier exporté d’origine",
  saveReceipt: "Enregistrer le reçu avec les nombres seulement",
  parts: "Parties",
  members: "Fichiers exportés",
  bytes: "Octets d’origine",
  setId: "Empreinte de l’ensemble de transfert",
  receipt: "Reçu de transfert",
  opened: "Toutes les parties ont passé les contrôles. Les fichiers exportés individuels sont disponibles ci-dessous.",
  openedHeading: "Ensemble de transfert ouvert",
  created: "Le fichier de transfert en plusieurs parties est prêt à enregistrer.",
  checking: "Contrôle des fichiers sélectionnés…",
  saving: "Préparation de l’ensemble de transfert…",
  cleared: "Sélection effacée.",
  failed: "Le navigateur n’a pas pu lire ou enregistrer le fichier choisi.",
  empty: "Aucun fichier sélectionné.",
  noFiles: "Choisissez des fichiers de récupération avant de créer un ensemble de transfert.",
  selectFirst: "Choisissez un fichier de transfert en plusieurs parties.",
  fileName: "Fichier",
  memberKind: "Type d’exportation",
  recordCount: "Enregistrements",
  receiptMatches: "Le reçu correspond à cet ensemble ouvert.",
  receiptDiffers: "Le reçu ne correspond pas à tous les détails de cet ensemble.",
  chooseReceipt: "Choisir un reçu distinct avec les nombres seulement",
  compareReceipt: "Comparer le reçu",
  planning: "Plan de transfert",
  planSummary: "Les fichiers sélectionnés conservent leur ordre et sont répartis en parties numérotées.",
  issues: {
    empty: "Choisissez au moins un fichier de récupération.",
    "part-count": "La sélection ne nécessite pas plusieurs parties ou dépasse la limite permise.",
    "member-count": "La sélection dépasse le nombre total de fichiers permis.",
    "member-size": "Un fichier exporté dépasse sa limite de taille individuelle.",
    "total-size": "La taille totale des fichiers d’origine dépasse la limite permise.",
    "part-size": "Une partie numérotée dépasse sa limite de taille.",
    "set-size": "Le fichier de transfert complet dépasse sa limite de taille.",
    read: "Un fichier n’a pas pu être lu au complet.",
    encoding: "Le fichier de transfert n’est pas en UTF-8 valide.",
    envelope: "La structure du fichier de transfert est invalide.",
    version: "Cette version de l’ensemble de transfert n’est pas prise en charge.",
    payload: "Une partie contient des données encodées invalides.",
    digest: "Une partie ne correspond pas à son empreinte consignée.",
    identity: "L’empreinte de l’ensemble ne correspond pas à ses parties.",
    duplicate: "Le même fichier exporté apparaît plus d’une fois.",
    incomplete: "Une partie numérotée est absente ou dans le mauvais ordre.",
    crypto: "Le navigateur n’a pas pu calculer une empreinte.",
    "native-bundle": "Une partie ne constitue pas un lot de récupération ordinaire valide.",
    "invalid-candidate": "La taille ou les détails d’empreinte d’un fichier sont invalides.",
    "duplicate-digest": "Le même fichier exporté apparaît plus d’une fois.",
    "record-count": "Un fichier exporté indique un nombre d’enregistrements invalide.",
  },
  receiptIssues: {
    size: "Le reçu dépasse sa limite de taille.",
    format: "Le format du reçu est invalide.",
    identity: "L’identité du reçu est invalide.",
    count: "Les nombres du reçu sont invalides.",
    digest: "Une empreinte du reçu est invalide.",
    incomplete: "Le reçu ne répertorie pas toutes les parties.",
    mismatch: "Le reçu ne correspond pas à cet ensemble de transfert.",
  },
};

export function multipartCopy(locale: MultipartLocale): MultipartCopy {
  return locale === "fr" ? fr : en;
}

export function multipartNumber(locale: MultipartLocale, value: number): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA").format(value);
}

export function multipartFileName(index: number, digest: string): string {
  return `recovery-part-${index}-${digest.slice(0, 8)}.rxb`;
}

export function multipartMemberName(index: number, digest: string): string {
  return `recovery-export-${index}-${digest.slice(0, 8)}.json`;
}
