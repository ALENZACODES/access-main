import { useEffect, useId, useMemo, useState } from "react";
import type { CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { SaveTextFile } from "./recoveryExport";
import { planExportCopy, saveLocalPlanExport } from "./recoveryPlanExport";
import type { LocalPackRecord } from "./packInventory";
import { planPackRepairs, repairPolicyCopy } from "./recoveryPolicy";
import {
  calculateStorageBudget, countBatchStages, createRecoveryBatch, parseQuotaInput,
  reconcileRecoveryBatch, recoveryBatchCopy, updateRecoveryBatch,
  type BatchDecision, type BatchItem, type RecoveryBatch,
} from "./recoveryBatch";
import {
  appendLedgerEvent, emptyRecoveryLedger, recoveryLedgerCopy, summarizeLedger,
  type LedgerAction, type LedgerOutcome, type RecoveryLedger,
} from "./recoveryLedger";

export interface RecoveryQueuePanelProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly inspectionDate: string;
  readonly onInspect: () => void;
  readonly saveFile?: SaveTextFile;
}

const frame: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  marginBlock: 16, overflowWrap: "anywhere",
};
const button: CSSProperties = {
  minHeight: 44, minWidth: 44, padding: "10px 16px", font: "inherit",
  cursor: "pointer",
};
const controls: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
};
const field: CSSProperties = {
  minHeight: 44, minWidth: 180, maxWidth: "100%", font: "inherit",
  padding: "8px 12px",
};
const maximumDisplayed = 80;

function actionFor(stage: BatchItem["stage"]): readonly BatchDecision[] {
  switch (stage) {
    case "pending": return ["select"];
    case "selected": return ["unselect", "mark-waiting"];
    case "waiting": return ["mark-recheck", "reset"];
    case "recheck": return ["reset"];
    case "unknown": return ["select"];
    case "done": return [];
  }
}

function logAction(decision: BatchDecision): LedgerAction {
  switch (decision) {
    case "select": case "unselect": return "review";
    case "mark-waiting": return "request-download";
    case "mark-recheck": return "inspect";
    case "mark-done": return "inspect";
    case "reset": return "dismiss";
  }
}

function logOutcome(decision: BatchDecision): LedgerOutcome {
  switch (decision) {
    case "mark-waiting": return "pending";
    case "mark-done": return "complete";
    case "mark-recheck": return "unknown";
    case "reset": return "unknown";
    case "select": case "unselect": return "pending";
  }
}

function fmt(value: number, locale: RecoveryLocale): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA").format(value);
}

/**
 * Mounted by RecoveryCenter. A manual queue and local decision ledger that
 * never initiates network calls, writes files, or hides a bad pack.
 */
export function RecoveryQueuePanel({
  locale, records, inspected, inspectionDate, onInspect, saveFile,
}: RecoveryQueuePanelProps): ReactElement {
  const heading = useId();
  const queueHeading = useId();
  const budgetHeading = useId();
  const ledgerHeading = useId();
  const saveHeading = useId();
  const quotaId = useId();
  const quotaHelpId = useId();
  const policy = useMemo(
    () => inspected ? planPackRepairs(records, { date: inspectionDate }) : null,
    [records, inspected, inspectionDate],
  );
  const [batch, setBatch] = useState<RecoveryBatch>(() => createRecoveryBatch([]));
  const [ledger, setLedger] = useState<RecoveryLedger>(emptyRecoveryLedger);
  const [quota, setQuota] = useState("");
  const [filter, setFilter] = useState<"all" | "blocked" | "review">("all");
  const [message, setMessage] = useState("");
  const pc = repairPolicyCopy(locale);
  const bc = recoveryBatchCopy(locale);
  const lc = recoveryLedgerCopy(locale);
  const ec = planExportCopy(locale);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "unsafe" | "too-large" | "save-failed">("idle");
  const parsedQuota = parseQuotaInput(quota);
  const budget = calculateStorageBudget(batch, parsedQuota === "invalid" ? null : parsedQuota);
  const counts = countBatchStages(batch);
  const ledgerSummary = summarizeLedger(ledger);

  useEffect(() => {
    if (policy === null) {
      setBatch(createRecoveryBatch([]));
      return;
    }
    setBatch((old) => reconcileRecoveryBatch(old, policy.recommendations));
    setMessage("");
  }, [policy]);

  function change(item: BatchItem, decision: BatchDecision): void {
    const result = updateRecoveryBatch(batch, { id: item.id, decision, userInitiated: true });
    if (!result.ok) {
      setMessage(locale === "fr" ? "Cette modification n’est pas disponible." : "This change is unavailable.");
      return;
    }
    setBatch(result.batch);
    const recommendation = policy?.recommendations.find((entry) => entry.id === item.id);
    const state = recommendation?.state ?? "unknown";
    const event = appendLedgerEvent(ledger, {
      packId: item.id, action: logAction(decision), outcome: logOutcome(decision),
      day: inspectionDate, prior: state, after: state,
    });
    if (event.ok) setLedger(event.ledger);
    setMessage(locale === "fr" ? "File mise à jour." : "Queue updated.");
  }

  async function savePlan(): Promise<void> {
    if (policy === null || saveFile === undefined || saveState === "saving") return;
    setSaveState("saving");
    const result = await saveLocalPlanExport(policy, batch, ledger, saveFile);
    setSaveState(result.ok ? "saved" : result.reason);
  }

  const visible = policy?.recommendations.filter(
    (item) => filter === "all" || item.priority === filter,
  ).slice(0, maximumDisplayed) ?? [];
  return (
    <div lang={locale}>
      <section aria-labelledby={heading} style={frame}>
        <h2 id={heading}>{pc.heading}</h2>
        <p>{pc.intro}</p>
        {!inspected || policy === null ? <p>{pc.notInspected}</p> : (
          <>
            <p role="status" aria-live="polite">
              {pc.categories.blocked}{locale === "fr" ? "\u00a0: " : ": "}{fmt(policy.totals.blocked, locale)}{" · "}
              {pc.categories.review}{locale === "fr" ? "\u00a0: " : ": "}{fmt(policy.totals.review, locale)}{" · "}
              {pc.categories.none}{locale === "fr" ? "\u00a0: " : ": "}{fmt(policy.totals.none, locale)}
            </p>
            {policy.overflow > 0 && <p>{pc.overflow} ({fmt(policy.overflow, locale)})</p>}
            {policy.recommendations.length === 0 && <p>{pc.noItems}</p>}
            <fieldset style={{ border: 0, padding: 0, marginBlock: 12 }}>
              <legend>{locale === "fr" ? "Filtrer les priorités" : "Filter priorities"}</legend>
              <div style={controls}>
                {(["all", "blocked", "review"] as const).map((option) => (
                  <label key={option} style={{ display: "inline-flex", gap: 8, minHeight: 44, alignItems: "center" }}>
                    <input type="radio" name={`recovery-priority-${heading}`} value={option}
                      checked={filter === option} onChange={() => setFilter(option)} />
                    {option === "all" ? (locale === "fr" ? "Toutes" : "All") : pc.categories[option]}
                  </label>
                ))}
              </div>
            </fieldset>
            <ul>
              {visible.map((item) => (
                <li key={item.id} style={{ marginBlock: 16 }}>
                  <strong>{item.id}</strong>{" — "}{pc.categories[item.priority]}
                  <p>{pc.kinds[item.kind]}</p>
                  {item.flags.length > 0 && <ul>
                    {item.flags.map((flag) => <li key={flag}>{pc.flags[flag]}</li>)}
                  </ul>}
                  {item.source !== undefined && <dl>
                    <dt>{pc.source}</dt><dd>{item.source.name}</dd>
                    <dt>{pc.licence}</dt><dd>{item.source.licence}</dd>
                    <dt>{pc.date}</dt><dd>{item.source.date}</dd>
                  </dl>}
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
      <section aria-labelledby={queueHeading} style={frame}>
        <h2 id={queueHeading}>{bc.heading}</h2>
        <p>{bc.explanation}</p>
        <p>{bc.caution}</p>
        <p role="status" aria-live="polite" aria-atomic="true">{message}</p>
        <p>{bc.selection}{locale === "fr" ? "\u00a0: " : ": "}{fmt(counts.selected + counts.waiting, locale)}</p>
        {batch.items.length === 0 && <p>{bc.none}</p>}
        <ul>
          {batch.items.slice(0, maximumDisplayed).map((item) => (
            <li key={item.id} style={{ marginBlock: 16 }}>
              <strong>{item.id}</strong>{" — "}{bc.stages[item.stage]}
              <div style={{ ...controls, marginBlock: 8 }}>
                {actionFor(item.stage).map((decision) => (
                  <button key={decision} type="button" style={button}
                    onClick={() => change(item, decision)}>{bc.decisions[decision]}</button>
                ))}
              </div>
            </li>
          ))}
        </ul>
        <button type="button" style={button} onClick={onInspect}>
          {locale === "fr" ? "Contrôler à nouveau les fichiers" : "Check saved files again"}
        </button>
      </section>
      <section aria-labelledby={budgetHeading} style={frame}>
        <h2 id={budgetHeading}>{locale === "fr" ? "Estimation de l’espace" : "Storage estimate"}</h2>
        <label htmlFor={quotaId}>{bc.quotaLabel}</label>
        <p id={quotaHelpId}>{bc.quotaHelp}</p>
        <input id={quotaId} type="text" inputMode="numeric" value={quota}
          onChange={(event) => setQuota(event.target.value)}
          aria-describedby={quotaHelpId} aria-invalid={parsedQuota === "invalid"}
          style={field} />
        {parsedQuota === "invalid" && <p role="alert">{bc.numberError}</p>}
        <p>{bc.amount}{locale === "fr" ? "\u00a0: " : ": "}{fmt(budget.selectedBytes, locale)}</p>
        <p>{bc.unknownSize}{locale === "fr" ? "\u00a0: " : ": "}{fmt(budget.unknownSizeCount, locale)}</p>
        <p role="status" aria-live="polite">{bc.storage[budget.enough]}</p>
      </section>
      {saveFile !== undefined && <section aria-labelledby={saveHeading} style={frame}>
        <h2 id={saveHeading}>{ec.heading}</h2>
        <p>{ec.description}</p>
        <button type="button" style={button} disabled={!inspected || policy === null || saveState === "saving"}
          onClick={() => { void savePlan(); }}>{ec.action}</button>
        <p role="status" aria-live="polite">{!inspected ? ec.unavailable :
          saveState === "saved" ? ec.success : saveState === "unsafe" ? ec.unsafe :
            saveState === "too-large" ? ec.tooLarge : saveState === "save-failed" ? ec.failed : ""}</p>
      </section>}
      <section aria-labelledby={ledgerHeading} style={frame}>
        <h2 id={ledgerHeading}>{lc.heading}</h2>
        <p>{lc.explanation}</p>
        <p>{lc.totals}{locale === "fr" ? "\u00a0: " : ": "}{fmt(ledgerSummary.eventCount, locale)}{" · "}
          {lc.unknown}{locale === "fr" ? "\u00a0: " : ": "}{fmt(ledgerSummary.unknownCount, locale)}{" · "}
          {lc.requested}{locale === "fr" ? "\u00a0: " : ": "}{fmt(ledgerSummary.requestedCount, locale)}{" · "}
          {lc.failed}{locale === "fr" ? "\u00a0: " : ": "}{fmt(ledgerSummary.failedCount, locale)}
        </p>
        {ledger.events.length === 0 && <p>{lc.empty}</p>}
        {ledger.discarded > 0 && <p>{lc.discarded}{locale === "fr" ? "\u00a0: " : ": "}{fmt(ledger.discarded, locale)}</p>}
        <ol>
          {ledger.events.slice(-20).map((event) => (
            <li key={event.number} style={{ marginBlock: 8 }}>
              {event.day}{" · "}{event.packId}{" · "}{lc.actions[event.action]}{" · "}{lc.outcomes[event.outcome]}
            </li>
          ))}
        </ol>
        <p>{lc.clearDescription}</p>
        <button type="button" style={button} onClick={() => setLedger(emptyRecoveryLedger())}>{lc.clear}</button>
      </section>
    </div>
  );
}
