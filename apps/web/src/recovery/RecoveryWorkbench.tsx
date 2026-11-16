import { useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import {
  diagnoseInventory, diagnosticsCopy, type DiagnosticSummary,
} from "./recoveryDiagnostics";
import {
  actionsCopy, proposeRecoveryActions, reconcileRecoveryActions,
  transitionRecoveryAction, type ActionPlan, type RecoveryActionItem,
} from "./recoveryActions";
import {
  appendReviewEvent, clearReviewLog, compareInspections, comparisonCopy,
  emptyReviewLog, type LocalReviewLog,
} from "./recoveryComparison";

export interface RecoveryWorkbenchProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly previous: readonly LocalPackRecord[] | null;
  readonly inspected: boolean;
  /** Supplied by caller; no date is silently inferred by diagnostics. */
  readonly inspectionDate: string;
  readonly onInspect: () => void;
}

const panel: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  marginBlock: 16, overflowWrap: "anywhere",
};
const control: CSSProperties = {
  minHeight: 44, minWidth: 44, padding: "10px 16px", font: "inherit", cursor: "pointer",
};
const controls: CSSProperties = {
  display: "flex", gap: 12, flexWrap: "wrap", alignItems: "center",
};
const compact: CSSProperties = { marginBlock: 8 };

function emptyPlan(): ActionPlan {
  return { items: [], blocked: 0, pending: 0, unknown: 0 };
}

function format(value: number, locale: RecoveryLocale): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA").format(value);
}

function effectiveSummary(
  records: readonly LocalPackRecord[],
  inspectionDate: string,
  inspected: boolean,
): DiagnosticSummary | null {
  if (!inspected) return null;
  return diagnoseInventory(records, { today: inspectionDate });
}

/**
 * Live child of RecoveryCenter. Provides diagnostics, explicit checklist
 * review and a volatile history panel. Nothing here initiates a network
 * request, deletes a file or promotes UNKNOWN to ready.
 */
export function RecoveryWorkbench({
  locale, records, previous, inspected, inspectionDate, onInspect,
}: RecoveryWorkbenchProps): ReactElement {
  const diagnosticsHeading = useId();
  const actionsHeading = useId();
  const comparisonHeading = useId();
  const historyHeading = useId();
  const summary = useMemo(
    () => effectiveSummary(records, inspectionDate, inspected),
    [records, inspectionDate, inspected],
  );
  const comparison = useMemo(
    () => inspected && previous !== null ? compareInspections(previous, records) : null,
    [previous, records, inspected],
  );
  const [plan, setPlan] = useState<ActionPlan>(emptyPlan);
  const [log, setLog] = useState<LocalReviewLog>(emptyReviewLog);
  const checks = diagnosticsCopy(locale);
  const actionText = actionsCopy(locale);
  const differenceText = comparisonCopy(locale);

  useEffect(() => {
    if (summary === null) {
      setPlan(emptyPlan());
      return;
    }
    // Reconcile completed download actions with the freshly inspected bytes.
    // An unchecked or damaged pack cannot retain a completed download flag.
    const updated = proposeRecoveryActions(summary);
    setPlan((old) => {
      const current = new Map(old.items.map((item) => [item.id, item]));
      const carried = updated.items.map((item) => {
        const status = current.get(item.id)?.status;
        return status === undefined ? item : { ...item, status };
      });
      const reconciled = reconcileRecoveryActions({ ...updated, items: carried }, records);
      return reconciled;
    });
  }, [summary, records]);

  function transition(item: RecoveryActionItem, status: "in-progress" | "complete" | "skipped" | "pending"): void {
    const next = transitionRecoveryAction(plan, {
      actionId: item.id,
      next: status,
      userInitiated: true,
    });
    if (next === plan) return;
    setPlan(next);
    setLog((before) => appendReviewEvent(before, {
      action: "review", outcome: status === "complete" ? "complete" : "unknown",
      packId: item.packId, date: inspectionDate,
    }));
  }

  const hasFindings = summary !== null && summary.findings.length > 0;
  return (
    <div lang={locale}>
      <section style={panel} aria-labelledby={diagnosticsHeading}>
        <h2 id={diagnosticsHeading}>{checks.heading}</h2>
        <p>{checks.explanation}</p>
        {summary === null ? (
          <p role="status">{locale === "fr" ? "Contrôle local nécessaire" : "Local inspection needed"}</p>
        ) : (
          <>
            <p role="status" aria-live="polite"><strong>{checks.states[summary.status]}</strong></p>
            <dl>
              <dt>{checks.labels.count}</dt><dd>{format(summary.packCount, locale)}</dd>
              <dt>{checks.labels.bytes}</dt><dd>{format(summary.totalKnownBytes, locale)}</dd>
            </dl>
            {hasFindings ? (
              <ul>
                {summary.findings.map((finding, index) => (
                  <li key={`${finding.packId ?? "inventory"}-${finding.code}-${index}`} style={compact}>
                    <strong>{finding.packId ?? checks.labels.global}</strong>
                    {" — "}{checks.problems[finding.code]}
                  </li>
                ))}
              </ul>
            ) : <p>{checks.labels.noFindings}</p>}
            <p>{checks.labels.sourceNote}</p>
          </>
        )}
      </section>
      <section style={panel} aria-labelledby={actionsHeading}>
        <h2 id={actionsHeading}>{actionText.heading}</h2>
        <p>{actionText.explanation}</p>
        {plan.items.length === 0 ? <p>{actionText.empty}</p> : (
          <ol>
            {plan.items.map((item) => (
              <li key={item.id} style={{ marginBlock: 16 }}>
                <h3 style={compact}>{actionText.action[item.kind]}</h3>
                <p style={compact}>
                  {item.packId === null ? checks.labels.global : `${actionText.packPrefix}${locale === "fr" ? "\u00a0" : ""}: ${item.packId}`}
                  {" — "}{actionText.priority[item.priority]}
                </p>
                <p>{actionText.details[item.kind]}</p>
                <p aria-live="polite">{actionText.status[item.status]}</p>
                <div style={controls}>
                  {(item.status === "pending" || item.status === "unknown") && (
                    <button type="button" style={control} onClick={() => transition(item, "in-progress")}>
                      {actionText.begin}
                    </button>
                  )}
                  {item.status === "in-progress" && (
                    <button type="button" style={control} onClick={() => transition(item, "complete")}>
                      {actionText.acknowledge}
                    </button>
                  )}
                  {item.status === "pending" && (
                    <button type="button" style={control} onClick={() => transition(item, "skipped")}>
                      {actionText.skip}
                    </button>
                  )}
                  {(item.status === "skipped" || item.status === "complete") && (
                    <button type="button" style={control} onClick={() => transition(item, "pending")}>
                      {actionText.retry}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ol>
        )}
        <p>{actionText.caution}</p>
        <button type="button" style={control} onClick={onInspect}>
          {locale === "fr" ? "Contrôler de nouveau les fichiers" : "Inspect files again"}
        </button>
      </section>
      <section style={panel} aria-labelledby={comparisonHeading}>
        <h2 id={comparisonHeading}>{differenceText.heading}</h2>
        <p>{differenceText.explanation}</p>
        {comparison === null ? <p>{differenceText.first}</p>
          : comparison.changes.length === 0 ? <p>{differenceText.empty}</p>
            : (
              <ul>
                {comparison.changes.map((change) => (
                  <li key={change.id} style={compact}>
                    <strong>{change.id}</strong>{" — "}{differenceText.changes[change.kind]}
                  </li>
                ))}
              </ul>
            )}
      </section>
      <section style={panel} aria-labelledby={historyHeading}>
        <h2 id={historyHeading}>{differenceText.logHeading}</h2>
        <p>{differenceText.sessionOnly}</p>
        {log.entries.length === 0 ? <p>{differenceText.logEmpty}</p> : (
          <ol>
            {log.entries.map((event) => (
              <li key={event.sequence}>
                {differenceText.events[event.action]}{" — "}{differenceText.outcomes[event.outcome]}
                {event.packId === null ? "" : ` — ${event.packId}`}
              </li>
            ))}
          </ol>
        )}
        <button type="button" style={control} onClick={() => setLog(clearReviewLog())}>
          {differenceText.clearLog}
        </button>
      </section>
    </div>
  );
}
