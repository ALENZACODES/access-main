import { useId } from "react";
import type { CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import { packIntegrityCopy } from "./packIntegrity";

export interface CorruptPackNoticeProps {
  readonly status: "corrupt" | "unknown";
  readonly locale: RecoveryLocale;
  /** Explicitly triggered by the user; caller handles loading and errors. */
  readonly onRedownload: () => void;
  readonly onDismiss: () => void;
  readonly busy?: boolean;
}

const buttonStyle: CSSProperties = {
  minHeight: 44,
  minWidth: 44,
  padding: "10px 16px",
  font: "inherit",
};

export function CorruptPackNotice({
  status, locale, onRedownload, onDismiss, busy = false,
}: CorruptPackNoticeProps): ReactElement {
  const titleId = useId();
  const bodyId = useId();
  const copy = packIntegrityCopy(locale, status);
  return (
    <section
      role="alert"
      lang={locale}
      aria-labelledby={titleId}
      aria-describedby={bodyId}
      aria-busy={busy}
      style={{ border: "2px solid currentColor", padding: 16, borderRadius: 8 }}
    >
      <h2 id={titleId}>{copy.title}</h2>
      <p id={bodyId}>{copy.explanation}</p>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 12 }}>
        <button type="button" style={buttonStyle} onClick={onRedownload} disabled={busy}>
          {copy.action}
        </button>
        <button type="button" style={buttonStyle} onClick={onDismiss}>
          {copy.dismiss}
        </button>
      </div>
    </section>
  );
}
