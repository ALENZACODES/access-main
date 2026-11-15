import { useState, type CSSProperties } from "react";
import { strings, type Locale } from "./i18n";
import { ProposalStore } from "./store";
import type { UnverifiedDraft } from "./types";

export interface ReviewQueueProps {
  store: ProposalStore;
  locale: Locale;
}

const fieldStyle: CSSProperties = {
  display: "block",
  width: "100%",
  maxWidth: "32rem",
  boxSizing: "border-box",
  font: "inherit",
  padding: "0.65rem",
  marginBlock: "0.4rem 1rem",
};

const buttonStyle: CSSProperties = {
  padding: "0.7rem 1rem",
  minHeight: "44px",
  font: "inherit",
};

function targetName(draft: UnverifiedDraft): string {
  return draft.target.kind === "existing"
    ? draft.target.id
    : draft.target.name;
}

function evidenceText(
  draft: UnverifiedDraft,
  t: ReturnType<typeof strings>,
): string[] {
  return draft.evidence.map((item) =>
    item.kind === "photo"
      ? `${t.photo}: ${item.photoId}`
      : `${t.note}: ${item.text}`,
  );
}

export function ReviewQueue({
  store,
  locale,
}: ReviewQueueProps) {
  const t = strings(locale);
  const [pending, setPending] = useState<UnverifiedDraft[]>(() =>
    store.listPending(),
  );
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");

  function refresh(): void {
    setPending(store.listPending());
  }

  function review(
    id: string,
    action: "accept" | "reject",
  ): void {
    const note = notes[id]?.trim() ?? "";

    if (!note) {
      setMessage(t.reviewRequired);
      return;
    }

    try {
      if (action === "accept") {
        store.accept(id, note);
      } else {
        store.reject(id, note);
      }

      refresh();
      setNotes((previous) => {
        const next = { ...previous };
        delete next[id];
        return next;
      });
      setMessage(action === "accept" ? t.accepted : t.rejected);
    } catch {
      setMessage(t.error);
    }
  }

  function exportVerified(): void {
    try {
      const contributions = store.listExportable();
      if (contributions.length === 0) {
        setMessage(t.exportEmpty);
        return;
      }

      const blob = new Blob(
        [JSON.stringify(contributions, null, 2)],
        { type: "application/json" },
      );
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "verified-contributions.json";
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage(t.exportHelp);
    } catch {
      setMessage(t.error);
    }
  }

  return (
    <section
      aria-labelledby="proposal-queue-heading"
      lang={locale}
      style={{
        maxWidth: "70rem",
        width: "100%",
        boxSizing: "border-box",
        overflowWrap: "anywhere",
      }}
    >
      <h2 id="proposal-queue-heading">{t.heading}</h2>

      <p role="status" aria-live="polite">
        {message}
      </p>

      {pending.length === 0 && <p>{t.empty}</p>}

      <ul style={{ listStyle: "none", padding: 0 }}>
        {pending.map((draft) => {
          const inputId = `proposal-note-${draft.id}`;
          const evidence = evidenceText(draft, t);

          return (
            <li
              key={draft.id}
              style={{
                border: "1px solid currentColor",
                borderRadius: "0.35rem",
                marginBlock: "1rem",
                padding: "1rem",
              }}
            >
              <h3>{targetName(draft)}</h3>

              <dl>
                <dt>{t.field}</dt>
                <dd>{draft.field}</dd>
                <dt>{t.value}</dt>
                <dd>
                  {draft.suggestedValue === "UNKNOWN"
                    ? t.unknown
                    : String(draft.suggestedValue)}
                </dd>
                <dt>{t.tier}</dt>
                <dd>0</dd>
                {draft.source && (
                  <>
                    <dt>{t.source}</dt>
                    <dd>{draft.source.source_id}</dd>
                    <dt>{t.licence}</dt>
                    <dd>{draft.source.licence}</dd>
                    <dt>{t.retrieved}</dt>
                    <dd>{draft.source.retrieved_at}</dd>
                  </>
                )}
              </dl>

              {evidence.length > 0 && (
                <div>
                  <h4>{t.evidence}</h4>
                  <ul>
                    {evidence.map((item, index) => (
                      <li key={`${draft.id}-${index}`}>{item}</li>
                    ))}
                  </ul>
                </div>
              )}

              {draft.source?.licence === "ODbL" && (
                <p>{t.osmCredit}</p>
              )}

              <label htmlFor={inputId}>{t.verificationNote} / {t.rejectionReason}</label>
              <textarea
                id={inputId}
                rows={3}
                style={fieldStyle}
                value={notes[draft.id] ?? ""}
                onChange={(event) =>
                  setNotes((previous) => ({
                    ...previous,
                    [draft.id]: event.target.value,
                  }))
                }
              />

              <div
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "0.75rem",
                }}
              >
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => review(draft.id, "accept")}
                >
                  {t.accept}
                </button>
                <button
                  type="button"
                  style={buttonStyle}
                  onClick={() => review(draft.id, "reject")}
                >
                  {t.reject}
                </button>
              </div>
            </li>
          );
        })}
      </ul>

      <p>{t.exportHelp}</p>
      <button
        type="button"
        style={buttonStyle}
        onClick={exportVerified}
      >
        {t.export}
      </button>
    </section>
  );
}
