import { useId, useMemo, useState } from "react";
import type { CSSProperties, ReactElement, ChangeEvent } from "react";
import type { RecoveryLocale } from "./index";
import type { LocalPackRecord } from "./packInventory";
import type { SaveTextFile } from "./recoveryExport";
import { calculateRecoveryDryRun, exportRecoveryDryRun, type ManualPriority, type DryRunTier } from "./recoveryDryRun";
import { recoveryDryRunCopy } from "./recoveryDryRunCopy";

export interface RecoveryDryRunPanelProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly inspected: boolean;
  readonly inspectionDate: string;
  readonly saveFile?: SaveTextFile;
}

const control: CSSProperties = { minHeight: 44, minWidth: 44, padding: "10px 12px", font: "inherit" };
const section: CSSProperties = { padding: 16, marginBlock: 16, border: "1px solid currentColor", borderRadius: 8 };
const row: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: 12 };

function safeNumber(value: string): number | null {
  if (!/^\d{1,15}$/.test(value)) return null;
  const amount = Number(value);
  return Number.isSafeInteger(amount) ? amount : null;
}

/**
 * A what-if workspace. It has no access to fetch, filesystem APIs or the pack
 * store, and cannot mutate the underlying downloaded records.
 */
export function RecoveryDryRunPanel({ locale, records, inspected, inspectionDate, saveFile }: RecoveryDryRunPanelProps): ReactElement {
  const copy = recoveryDryRunCopy(locale);
  const headingId = useId();
  const freeId = useId();
  const reserveId = useId();
  const [available, setAvailable] = useState("100000000");
  const [reserve, setReserve] = useState("10000000");
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(() => new Set());
  const [priorities, setPriorities] = useState<Readonly<Record<string, ManualPriority>>>({});
  const [tiers, setTiers] = useState<Readonly<Record<string, DryRunTier>>>({});
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");

  const selectedIds = useMemo(() => records.filter((record) => !excluded.has(record.id)).map((record) => record.id), [records, excluded]);
  const plan = useMemo(() => inspected ? calculateRecoveryDryRun({
    records,
    availableBytes: safeNumber(available),
    reserveBytes: safeNumber(reserve) ?? -1,
    inspectionDate,
    selectedIds,
    priorities,
    tiers,
  }) : null, [records, inspected, available, reserve, inspectionDate, selectedIds, priorities, tiers]);

  function toggle(id: string, checked: boolean): void {
    setExcluded((previous) => {
      const next = new Set(previous);
      if (checked) next.delete(id);
      else next.add(id);
      return next;
    });
    setSaveStatus("idle");
  }

  async function save(): Promise<void> {
    if (!plan || saveFile === undefined || saveStatus === "saving") return;
    const date = new Date().toISOString();
    const text = exportRecoveryDryRun(plan, locale, date);
    if (text === null) { setSaveStatus("failed"); return; }
    setSaveStatus("saving");
    try {
      await saveFile(`recovery-rehearsal-${date.slice(0, 10)}.json`, text);
      setSaveStatus("saved");
    } catch {
      setSaveStatus("failed");
    }
  }

  return (
    <section lang={locale} aria-labelledby={headingId} style={section}>
      <h2 id={headingId}>{copy.heading}</h2>
      <p>{copy.description}</p>
      {!inspected ? <p role="status">{copy.notInspected}</p> : (
        <>
          <div style={row}>
            <label htmlFor={freeId}>{copy.space}</label>
            <input id={freeId} style={control} type="text" inputMode="numeric" value={available}
              onChange={(event: ChangeEvent<HTMLInputElement>) => { setAvailable(event.currentTarget.value); setSaveStatus("idle"); }} />
            <label htmlFor={reserveId}>{copy.reserve}</label>
            <input id={reserveId} style={control} type="text" inputMode="numeric" value={reserve}
              onChange={(event: ChangeEvent<HTMLInputElement>) => { setReserve(event.currentTarget.value); setSaveStatus("idle"); }} />
          </div>
          {records.length === 0 ? <p>{copy.none}</p> : (
            <ul>
              {records.map((record) => {
                const selected = !excluded.has(record.id);
                const value = priorities[record.id] ?? "normal";
                return <li key={record.id} style={{ marginBlock: 12 }}>
                  <div style={row}>
                    <strong>{record.id}</strong>
                    <label>
                      <input type="checkbox" checked={selected} onChange={(event: ChangeEvent<HTMLInputElement>) => toggle(record.id, event.currentTarget.checked)}
                        style={{ minHeight: 44, minWidth: 44 }} />
                      {copy.select}
                    </label>
                    <label>
                      {copy.priority}{" "}
                      <select style={control} value={value} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                        const next = event.currentTarget.value;
                        if (next !== "high" && next !== "normal" && next !== "low") return;
                        setPriorities((old) => ({ ...old, [record.id]: next }));
                        setSaveStatus("idle");
                      }}>
                        <option value="high">{copy.high}</option>
                        <option value="normal">{copy.normal}</option>
                        <option value="low">{copy.low}</option>
                      </select>
                    </label>
                    <label>
                      {copy.tier}{" "}
                      <select style={control} value={tiers[record.id] ?? "UNKNOWN"} onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                        const next = event.currentTarget.value;
                        if (next !== "UNKNOWN" && next !== "source-document" && next !== "user-note") return;
                        setTiers((old) => ({ ...old, [record.id]: next }));
                        setSaveStatus("idle");
                      }}>
                        <option value="UNKNOWN">{copy.tierUnknown}</option>
                        <option value="source-document">{copy.tierDocument}</option>
                        <option value="user-note">{copy.tierNote}</option>
                      </select>
                    </label>
                  </div>
                </li>;
              })}
            </ul>
          )}
          {plan && (
            <section aria-label={copy.plan}>
              <h3>{copy.plan}</h3>
              {plan.status === "unknown" && <p role="status">{copy.unavailable}</p>}
              <p>{copy.estimate}{locale === "fr" ? "\u00a0: " : ": "}{new Intl.NumberFormat(locale).format(plan.allocatedBytes)}</p>
              <ul>
                {plan.entries.map((entry, i) => (
                  <li key={`${entry.id}-${i}`}>
                    <strong>{entry.id}</strong>{" — "}{copy.status[entry.disposition]}.
                    {" "}{copy.reasons[entry.reason]}. {copy.tier}{locale === "fr" ? "\u00a0: " : ": "}{entry.tier === "UNKNOWN" ? copy.tierUnknown : entry.tier === "source-document" ? copy.tierDocument : copy.tierNote}.
                    {entry.source && <span> {entry.source.name} · {entry.source.licence} · {entry.source.date}</span>}
                  </li>
                ))}
              </ul>
              {saveFile && <button type="button" style={control} onClick={() => { void save(); }} disabled={saveStatus === "saving"}>
                {copy.export}
              </button>}
              <p role="status" aria-live="polite">{saveStatus === "saved" ? copy.saved : saveStatus === "failed" ? copy.failed : ""}</p>
            </section>
          )}
        </>
      )}
    </section>
  );
}
