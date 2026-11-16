import { useId, useMemo, useRef, useState } from "react";
import type { ChangeEvent, CSSProperties, ReactElement } from "react";
import type { RecoveryLocale } from "./index";
import type { RepairPolicyResult } from "./recoveryPolicy";
import { savePlanDiff, planDiffCopy } from "./recoveryPlanDiffExport";
import type { SaveRecoveryPlan } from "./recoveryPlanExport";
import { buildRecoverySteps, recoveryStepCopy } from "./recoveryPlanSteps";
import { inspectRecoveryPlan, planImportCopy, type ImportResult } from "./recoveryPlanImport";
import {
  compareRecoveryPlan, filterPlanDeltas, planComparisonCopy, summarizePlanChanges,
  type ComparisonFilter, type PlanComparison,
} from "./recoveryPlanCompare";

export interface RecoveryPlanReviewProps {
  readonly locale: RecoveryLocale;
  readonly current: RepairPolicyResult | null;
  readonly inspected: boolean;
  readonly onInspect: () => void;
  readonly saveFile?: SaveRecoveryPlan;
}
const frame: CSSProperties = {
  border: "1px solid currentColor", borderRadius: 8, padding: 16,
  marginBlock: 16, overflowWrap: "anywhere",
};
const button: CSSProperties = {
  minHeight: 44, minWidth: 44, font: "inherit", padding: "10px 16px", cursor: "pointer",
};
const actions: CSSProperties = {
  display: "flex", flexWrap: "wrap", gap: 12, alignItems: "center",
};
const field: CSSProperties = { font: "inherit", minHeight: 44, minWidth: 44, maxWidth: "100%" };
const MAX_FILE_BYTES = 512 * 1024;
function countsText(value: number, locale: RecoveryLocale): string {
  return new Intl.NumberFormat(locale === "fr" ? "fr-CA" : "en-CA").format(value);
}

/** Explicit, local-only plan review. The file is never uploaded or applied. */
export function RecoveryPlanReview({ locale, current, inspected, onInspect, saveFile }: RecoveryPlanReviewProps): ReactElement {
  const titleId = useId();
  const fileId = useId();
  const fileHintId = useId();
  const comparisonId = useId();
  const filterName = useId();
  const fileRef = useRef<HTMLInputElement | null>(null);
  const readSequence = useRef(0);
  const [reviewed, setReviewed] = useState<ImportResult | null>(null);
  const [pendingText, setPendingText] = useState<string | null>(null);
  const [fileState, setFileState] = useState<"idle" | "reading" | "ready" | "too-large" | "error">("idle");
  const [filter, setFilter] = useState<ComparisonFilter>("all");
  const [expanded, setExpanded] = useState<readonly string[]>([]);
  const [diffSave, setDiffSave] = useState<"idle" | "saving" | "saved" | "unsafe" | "too-large" | "not-inspected" | "save-failed">("idle");
  const copy = planImportCopy(locale);
  const labels = planComparisonCopy(locale);
  const comparison = useMemo<PlanComparison | null>(() => {
    if (reviewed?.ok !== true || current === null) return null;
    return compareRecoveryPlan(reviewed.document, current, { currentInspected: inspected });
  }, [reviewed, current, inspected]);
  const visible = comparison === null ? [] : filterPlanDeltas(comparison, filter);
  const summary = comparison === null ? null : summarizePlanChanges(comparison);
  const steps = comparison === null ? null : buildRecoverySteps(comparison);
  const stepCopy = recoveryStepCopy(locale);
  const diffCopy = planDiffCopy(locale);

  function reset(): void {
    readSequence.current += 1;
    if (fileRef.current !== null) fileRef.current.value = "";
    setReviewed(null);
    setPendingText(null);
    setFileState("idle");
    setFilter("all");
    setExpanded([]);
    setDiffSave("idle");
  }

  async function readFile(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const sequence = ++readSequence.current;
    const selected = event.currentTarget.files?.item(0);
    setReviewed(null);
    setPendingText(null);
    setExpanded([]);
    setDiffSave("idle");
    if (selected === null || selected === undefined) {
      setFileState("idle"); return;
    }
    if (selected.size > MAX_FILE_BYTES) {
      setFileState("too-large"); return;
    }
    setFileState("reading");
    try {
      const text = await selected.text();
      if (sequence !== readSequence.current) return;
      if (new TextEncoder().encode(text).byteLength > MAX_FILE_BYTES) {
        setFileState("too-large"); return;
      }
      setPendingText(text);
      setFileState("ready");
    } catch {
      if (sequence !== readSequence.current) return;
      setFileState("error");
    }
  }

  function review(): void {
    if (pendingText === null) return;
    // Local date only provides an upper bound for a past document; it cannot
    // promote a pack state. Existing inspections remain authoritative.
    const reference = new Date().toISOString().slice(0, 10);
    const result = inspectRecoveryPlan(pendingText, { referenceDate: reference });
    setReviewed(result);
    setExpanded([]);
  }

  async function exportDifferences(): Promise<void> {
    if (comparison === null || saveFile === undefined || diffSave === "saving") return;
    setDiffSave("saving");
    const result = await savePlanDiff(comparison, saveFile);
    setDiffSave(result.ok ? "saved" : result.reason);
  }

  function toggle(id: string): void {
    setExpanded((old) => old.includes(id) ? old.filter((entry) => entry !== id) : [...old, id]);
  }

  return (
    <section lang={locale} aria-labelledby={titleId} style={frame}>
      <h2 id={titleId}>{copy.title}</h2>
      <p>{copy.intro}</p>
      <div style={actions}>
        <label htmlFor={fileId}>{copy.select}</label>
        <input ref={fileRef} id={fileId} type="file" accept=".json,application/json" style={field}
          aria-describedby={fileHintId} onChange={(event: ChangeEvent<HTMLInputElement>) => { void readFile(event); }} />
        <button type="button" style={button} disabled={fileState !== "ready" || pendingText === null}
          onClick={review}>{copy.review}</button>
        <button type="button" style={button} onClick={reset}>{copy.clear}</button>
      </div>
      <p id={fileHintId}>{locale === "fr"
        ? "Seuls les fichiers JSON locaux de 512 Ko au plus sont acceptés. Rien n’est transmis."
        : "Only local JSON files up to 512 KB are accepted. Nothing is transmitted."}</p>
      <p role="status" aria-live="polite" aria-atomic="true">
        {fileState === "too-large" ? copy.fileLimit :
          fileState === "error" ? (locale === "fr" ? "Lecture du fichier impossible." : "Could not read the file.") :
            fileState === "reading" ? (locale === "fr" ? "Lecture du fichier…" : "Reading file…") :
              reviewed === null ? "" : reviewed.ok ? copy.accepted : copy.rejected}
      </p>
      {reviewed !== null && !reviewed.ok && (
        <div role="group" aria-label={locale === "fr" ? "Problèmes du plan" : "Plan issues"}>
          <ul>
            {reviewed.findings.map((finding, index) => (
              <li key={`${finding.path}-${index}`}>
                <strong>{copy.issue[finding.code]}</strong> ({finding.path})
              </li>
            ))}
          </ul>
        </div>
      )}
      {reviewed?.ok === true && (
        <section aria-labelledby={comparisonId}>
          <h3 id={comparisonId}>{labels.title}</h3>
          <p>{labels.intro}</p>
          <div style={actions}>
            <button type="button" style={button} onClick={onInspect}>
              {locale === "fr" ? "Contrôler les fichiers locaux" : "Check local files"}
            </button>
          </div>
          {comparison === null || !inspected ? <p role="status">{labels.noInspection}</p> : (
            <>
              {(!comparison.usable || comparison.partial) && <p role="status">{labels.partial}</p>}
              {summary !== null && (
                <dl>
                  <dt>{locale === "fr" ? "États modifiés" : "Changed file states"}</dt>
                  <dd>{countsText(summary.changed, locale)}</dd>
                  <dt>{locale === "fr" ? "Nouveaux ensembles" : "New packs"}</dt>
                  <dd>{countsText(summary.newPacks, locale)}</dd>
                  <dt>{locale === "fr" ? "Ensembles manquants" : "Missing packs"}</dt>
                  <dd>{countsText(summary.missingPacks, locale)}</dd>
                  <dt>{locale === "fr" ? "État INCONNU" : "UNKNOWN state"}</dt>
                  <dd>{countsText(summary.unknown, locale)}</dd>
                  <dt>{locale === "fr" ? "Sources différentes" : "Source differences"}</dt>
                  <dd>{countsText(summary.sourceDifferences, locale)}</dd>
                </dl>
              )}
              <fieldset style={{ marginBlock: 12, border: 0, padding: 0 }}>
                <legend>{labels.filter}</legend>
                <div style={actions}>
                  {(["all", "blocked", "review", "unknown", "unchanged"] as const).map((value) => (
                    <label key={value} style={{ minHeight: 44, display: "inline-flex", alignItems: "center", gap: 8 }}>
                      <input type="radio" name={filterName} value={value}
                        checked={filter === value} onChange={() => setFilter(value)} />
                      {labels.categories[value]}
                    </label>
                  ))}
                </div>
              </fieldset>
              {saveFile !== undefined && (
                <section aria-label={diffCopy.title} style={{ marginBlock: 16 }}>
                  <h4>{diffCopy.title}</h4>
                  <p>{diffCopy.description}</p>
                  <button type="button" style={button}
                    disabled={!comparison.usable || diffSave === "saving"}
                    onClick={() => { void exportDifferences(); }}>{diffCopy.save}</button>
                  <p role="status" aria-live="polite">
                    {diffSave === "saved" ? diffCopy.saved :
                      diffSave === "unsafe" ? diffCopy.unsafe :
                        diffSave === "too-large" ? diffCopy.tooLarge :
                          diffSave === "not-inspected" ? diffCopy.blocked :
                            diffSave === "save-failed" ? diffCopy.failed : ""}
                  </p>
                </section>
              )}
              {steps !== null && (
                <section aria-label={stepCopy.title} style={{ marginBlock: 16 }}>
                  <h4>{stepCopy.title}</h4>
                  <p>{stepCopy.description}</p>
                  {steps.incomplete && <p role="status">{stepCopy.incomplete}</p>}
                  {steps.steps.length === 0 && <p>{stepCopy.empty}</p>}
                  <ol>
                    {steps.steps.map((step) => (
                      <li key={step.id} style={{ marginBlock: 12 }}>
                        <strong>{stepCopy.priority[step.priority]}</strong>{" — "}
                        {step.packId !== null && <span>{step.packId}{" — "}</span>}
                        {stepCopy.kinds[step.kind]}
                        {step.requiresConnection === true && <span>{" · "}{stepCopy.connection}</span>}
                      </li>
                    ))}
                  </ol>
                  <p>{stepCopy.actions}</p>
                </section>
              )}
              {visible.length === 0 && <p>{labels.noChanges}</p>}
              <ul style={{ paddingInlineStart: 24 }}>
                {visible.map((item) => (
                  <li key={item.id} style={{ marginBlock: 12 }}>
                    <button type="button" style={{ ...button, textAlign: "start", width: "100%" }}
                      aria-expanded={expanded.includes(item.id)}
                      onClick={() => toggle(item.id)}>
                      <strong>{item.id}</strong> — {labels.status[item.result]}
                    </button>
                    {expanded.includes(item.id) && (
                      <div style={{ padding: 12, border: "1px solid currentColor" }}>
                        <dl>
                          <dt>{labels.previous}</dt><dd>{item.previous ?? labels.unknown}</dd>
                          <dt>{labels.current}</dt><dd>{item.current ?? labels.unknown}</dd>
                          <dt>{labels.queue}</dt><dd>{item.queueNote ?? labels.unknown}</dd>
                          <dt>{labels.source}</dt><dd>{item.currentSource?.name ?? labels.unknown}</dd>
                          <dt>{labels.licence}</dt><dd>{item.currentSource?.licence ?? labels.unknown}</dd>
                          <dt>{labels.date}</dt><dd>{item.currentSource?.date ?? labels.unknown}</dd>
                        </dl>
                        <ul>{item.changes.map((change) => <li key={change}>{labels.changes[change]}</li>)}</ul>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      )}
    </section>
  );
}
