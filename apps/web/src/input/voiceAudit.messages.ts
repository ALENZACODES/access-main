// EN + FR strings for the voice-control audit. FR typography: ’ apostrophe,
// U+00A0 before ":", U+202F before ; ! ? and inside « ».

export type Locale = "en" | "fr";

export type IssueKind =
  | "label-not-in-name"
  | "target-too-small"
  | "target-size-unknown";

const NBSP = "\u00a0";
const NNBSP = "\u202f";

function quote(locale: Locale, text: string): string {
  return locale === "fr" ? `«${NNBSP}${text}${NNBSP}»` : `\u201c${text}\u201d`;
}

export function formatIssue(
  locale: Locale,
  kind: IssueKind,
  label: string,
): string {
  const q = quote(locale, label);
  if (locale === "fr") {
    switch (kind) {
      case "label-not-in-name":
        return `Commande vocale${NBSP}: le nom accessible de ${q} doit contenir l’étiquette visible.`;
      case "target-too-small":
        return `La cible tactile de ${q} est inférieure à 44${NBSP}px.`;
      case "target-size-unknown":
        return `La taille de la cible tactile de ${q} est inconnue${NBSP}: à vérifier.`;
    }
  }
  switch (kind) {
    case "label-not-in-name":
      return `Voice control: the accessible name of ${q} must contain the visible label.`;
    case "target-too-small":
      return `The touch target of ${q} is smaller than 44 px.`;
    case "target-size-unknown":
      return `The touch target size of ${q} is unknown: needs checking.`;
  }
}
