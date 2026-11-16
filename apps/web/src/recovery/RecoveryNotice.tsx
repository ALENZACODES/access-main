import { useId } from "react";
import type { CSSProperties, ReactElement } from "react";
import {
  getRecoveryMessage,
  type RecoveryFailure,
  type RecoveryLocale,
} from "./index";

export interface RecoveryNoticeProps {
  readonly failure: RecoveryFailure;
  readonly locale: RecoveryLocale;
  readonly onRetry?: () => void;
  readonly onCheckInput?: () => void;
  readonly onDismiss: () => void;
}

const buttonStyle: CSSProperties = {
  minWidth: 44,
  minHeight: 44,
  padding: "10px 16px",
  font: "inherit",
  cursor: "pointer",
};

/** Status remains visible until explicitly dismissed; no focus is stolen. */
export function RecoveryNotice({
  failure,
  locale,
  onRetry,
  onCheckInput,
  onDismiss,
}: RecoveryNoticeProps): ReactElement {
  const titleId = useId();
  const descriptionId = useId();
  const message = getRecoveryMessage(failure, locale);
  const primaryHandler =
    message.action === "retry"
      ? onRetry
      : message.action === "check-input"
        ? onCheckInput
        : undefined;
  const source = failure.source;
  const hasSource =
    source !== undefined &&
    source.name.trim() !== "" &&
    source.licence.trim() !== "" &&
    source.date.trim() !== "";

  return (
    <section
      role="alert"
      lang={locale}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      style={{ border: "2px solid currentColor", borderRadius: 8, padding: 16, overflowWrap: "anywhere" }}
    >
      <h2 id={titleId}>{message.title}</h2>
      <p id={descriptionId}>{message.description}</p>
      {message.action === "free-space" && (
        <p>
          {locale === "fr"
            ? "Vérifiez l’espace libre dans les paramètres de l’appareil. Aucun fichier ne sera supprimé automatiquement."
            : "Check available space in device settings. No files will be deleted automatically."}
        </p>
      )}
      {hasSource && source !== undefined && (
        <p>
          {locale === "fr" ? "Source\u00a0: " : "Source: "}
          {source.name}
          {" · "}
          {locale === "fr" ? "Licence\u00a0: " : "Licence: "}
          {source.licence}
          {" · "}
          {locale === "fr" ? "Date\u00a0: " : "Date: "}
          {source.date}
        </p>
      )}
      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 }}>
        {primaryHandler !== undefined && (
          <button type="button" style={buttonStyle} onClick={primaryHandler}>
            {message.actionLabel}
          </button>
        )}
        <button type="button" style={buttonStyle} onClick={onDismiss}>
          {message.dismissLabel}
        </button>
      </div>
    </section>
  );
}
