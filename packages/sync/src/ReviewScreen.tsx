import { useState } from "react";
import type { Provenance } from "@access/shared";
import { catalogs, type Locale } from "./catalogs.ts";
import { applyResolutions } from "./reconcile.ts";
import type { ReconcileReport, ResolutionChoice, SourcedValue } from "./types.ts";

const styles = {
  main: { fontFamily: "system-ui, sans-serif", color: "#182a34", background: "#fff", padding: "1rem", maxWidth: 960, margin: "auto" },
  section: { border: "1px solid #607583", padding: "1rem", borderRadius: 8, marginTop: "1rem", overflowWrap: "anywhere" as const },
  button: { minHeight: 44, minWidth: 44, padding: "0.5rem 1rem", cursor: "pointer" },
  control: { minHeight: 44, display: "flex", alignItems: "center", gap: 8 },
} as const;

function Fact({ fact, locale }: { fact: SourcedValue; locale: Locale }) {
  const t = catalogs[locale];
  const p: Provenance = fact.provenance;
  return (
    <div>
      <p><strong>{JSON.stringify(fact.value)}</strong></p>
      <dl>
        <dt>{t.source}</dt><dd>{p.source_name}{p.source_url ? <> — <a href={p.source_url}>{p.source_url}</a></> : null}</dd>
        <dt>{t.licence}</dt><dd>{p.licence}{p.licence_url ? <> — <a href={p.licence_url}>{p.licence_url}</a></> : null}</dd>
        <dt>{t.date}</dt><dd>{p.source_date}</dd>
        <dt>{t.tier}</dt><dd>{String(p.tier)}{p.prototype_label ? ` · ${p.prototype_label}` : ""}</dd>
      </dl>
    </div>
  );
}

/** Host can persist the returned report to its own on-device cache. No backend is used. */
export function ReviewScreen({ report, locale, onResolved }: {
  report: ReconcileReport | null;
  locale: Locale;
  onResolved?: (next: ReconcileReport) => void;
}) {
  const t = catalogs[locale];
  const [choices, setChoices] = useState<Record<string, ResolutionChoice>>({});
  const [notice, setNotice] = useState("");
  const keyFor = (id: string, field: string) => JSON.stringify([id, field]);
  const unresolved = report?.conflicts ?? [];
  const complete = unresolved.every((c) => choices[keyFor(c.record_id, c.field)] !== undefined);
  const submit = () => {
    if (!report || !complete) { setNotice(t.selectionRequired); return; }
    const next = applyResolutions(report, unresolved.map((c) => ({
      record_id: c.record_id, field: c.field, choice: choices[keyFor(c.record_id, c.field)]!,
    })));
    setNotice("");
    onResolved?.(next);
  };
  return (
    <main lang={locale} style={styles.main}>
      <h1>{t.heading}</h1>
      <p>{t.subtitle}</p>
      {!report ? <p role="status">{t.empty}</p> : <>
        <section aria-labelledby="summary-heading" style={styles.section}>
          <h2 id="summary-heading">{t.summary}</h2>
          <p>{t.labels}: {report.left_label} / {report.right_label}</p>
          <ul>
            <li>{t.records}: {report.merged.records.length}</li>
            <li>{t.conflicts}: {report.conflicts.length}</li>
            <li>{t.unknowns}: {report.unknown_observations.length}</li>
            <li>{t.timestamps}: {report.metadata_lww.length}</li>
            <li>{t.queue}: {report.merged.outbox.length}</li>
          </ul>
        </section>
        <section aria-labelledby="conflicts-heading" style={styles.section}>
          <h2 id="conflicts-heading">{t.conflictHeading}</h2>
          {unresolved.length === 0 ? <p role="status">{t.noConflicts}</p> : <>
            {unresolved.map((conflict) => {
              const key = keyFor(conflict.record_id, conflict.field);
              return <fieldset key={key} style={styles.section}>
                <legend>{t.record}: {conflict.record_id} — {t.field}: {conflict.field}</legend>
                <p>{t.unresolved}</p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 230px), 1fr))", gap: "1rem" }}>
                  <div><h3>{t.left}</h3><Fact fact={conflict.left} locale={locale} /></div>
                  <div><h3>{t.right}</h3><Fact fact={conflict.right} locale={locale} /></div>
                </div>
                <div aria-label={t.chosen}>
                  {(["left", "right", "unknown"] as const).map((choice) => <label key={choice} style={styles.control}>
                    <input type="radio" name={key} value={choice} checked={choices[key] === choice}
                      onChange={() => setChoices((previous) => ({ ...previous, [key]: choice }))} />
                    {choice === "left" ? t.chooseLeft : choice === "right" ? t.chooseRight : t.keepUnknown}
                  </label>)}
                </div>
              </fieldset>;
            })}
            <button type="button" onClick={submit} disabled={!complete} style={styles.button}>{t.apply}</button>
            {notice ? <p role="alert">{notice}</p> : null}
          </>}
        </section>
      </>}
    </main>
  );
}
