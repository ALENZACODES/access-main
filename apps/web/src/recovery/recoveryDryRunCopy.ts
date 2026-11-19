import type { RecoveryLocale } from "./index";
import type { DryRunDisposition, DryRunReason } from "./recoveryDryRun";

export interface DryRunCopy {
  readonly heading: string;
  readonly description: string;
  readonly refresh: string;
  readonly space: string;
  readonly reserve: string;
  readonly plan: string;
  readonly export: string;
  readonly saved: string;
  readonly failed: string;
  readonly unavailable: string;
  readonly notInspected: string;
  readonly estimate: string;
  readonly included: string;
  readonly select: string;
  readonly priority: string;
  readonly high: string;
  readonly normal: string;
  readonly low: string;
  readonly tier: string;
  readonly tierUnknown: string;
  readonly tierDocument: string;
  readonly tierNote: string;
  readonly none: string;
  readonly status: Readonly<Record<DryRunDisposition, string>>;
  readonly reasons: Readonly<Record<DryRunReason, string>>;
}

const EN: DryRunCopy = {
  heading: "Offline repair rehearsal",
  description: "Explore a local storage plan. This calculation never downloads, deletes or changes saved packs. UNKNOWN is not a usable pack state.",
  refresh: "Recalculate", space: "Available storage in bytes", reserve: "Keep free in bytes",
  plan: "Local estimate", export: "Save plan as JSON", saved: "Plan saved locally",
  failed: "The plan could not be saved", unavailable: "Storage figures or pack details are UNKNOWN.",
  notInspected: "Inspect local packs before using this calculator.", estimate: "Allocated bytes",
  included: "Candidate packs", select: "Include in estimate", priority: "Manual priority",
  high: "High", normal: "Normal", low: "Low", tier: "Evidence tier", tierUnknown: "UNKNOWN", tierDocument: "Source document (user selected)", tierNote: "User note", none: "No packs listed",
  status: {
    "already-present": "Already listed on this device",
    candidate: "Fits in the entered budget",
    deferred: "Not selected",
    unknown: "UNKNOWN",
    "source-review": "Source details need review",
    "insufficient-space": "Does not fit in the entered budget",
  },
  reasons: {
    present: "Stored status is not a new content check",
    "not-selected": "Excluded from this estimate",
    "unknown-state": "Pack state UNKNOWN",
    "unknown-bytes": "Required size UNKNOWN",
    "unknown-source": "Source : UNKNOWN",
    "closed-licence": "Open licence not established",
    "invalid-source-date": "Source date UNKNOWN",
    "future-source-date": "Source date is after the inspection date",
    "invalid-pack-id": "Pack identifier unsupported",
    "duplicate-pack": "Duplicate pack identifier",
    capacity: "Not enough information or storage",
    candidate: "Candidate for manual review only",
  },
};
const FR: DryRunCopy = {
  heading: "Simulation de récupération hors ligne",
  description: "Explorez un plan local de stockage. Ce calcul ne télécharge, ne supprime et ne modifie aucun ensemble. UNKNOWN ne signifie pas utilisable.",
  refresh: "Recalculer", space: "Stockage disponible en octets", reserve: "Espace à conserver en octets",
  plan: "Estimation locale", export: "Enregistrer le plan en JSON", saved: "Plan enregistré localement",
  failed: "Le plan n’a pas pu être enregistré", unavailable: "L’état des données sur l’espace ou les ensembles est UNKNOWN.",
  notInspected: "Examinez les ensembles locaux avant ce calcul.", estimate: "Octets attribués",
  included: "Ensembles candidats", select: "Inclure dans l’estimation", priority: "Priorité manuelle",
  high: "Élevée", normal: "Normale", low: "Faible", tier: "Niveau de preuve", tierUnknown: "UNKNOWN", tierDocument: "Document source (choisi par l’utilisateur)", tierNote: "Note personnelle", none: "Aucun ensemble répertorié",
  status: {
    "already-present": "Déjà répertorié sur cet appareil",
    candidate: "Entre dans l’espace indiqué",
    deferred: "Non sélectionné",
    unknown: "UNKNOWN",
    "source-review": "Source à examiner",
    "insufficient-space": "N’entre pas dans l’espace indiqué",
  },
  reasons: {
    present: "Le statut enregistré n’est pas un nouveau contrôle du contenu",
    "not-selected": "Exclu de cette estimation",
    "unknown-state": "État de l’ensemble : UNKNOWN",
    "unknown-bytes": "Taille nécessaire : UNKNOWN",
    "unknown-source": "Source : UNKNOWN",
    "closed-licence": "Licence ouverte non établie",
    "invalid-source-date": "Date de la source : UNKNOWN",
    "future-source-date": "Date de la source postérieure au contrôle",
    "invalid-pack-id": "Identifiant non pris en charge",
    "duplicate-pack": "Identifiant en double",
    capacity: "Renseignements ou espace insuffisants",
    candidate: "Candidat à un examen manuel seulement",
  },
};
export function recoveryDryRunCopy(locale: RecoveryLocale): DryRunCopy { return locale === "fr" ? FR : EN; }
