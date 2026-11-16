import { useMemo, useState } from "react";
import { t, type Lang, type MessageKey } from "../i18n/index.ts";
import { INDICATORS, computeIndicators, logicModel, type KpiRecords, type KpiResult } from "../reports/kpi.ts";
import {
  buildReportEvidencePack,
  periodLabel,
  regionLabel,
  topicLabel,
  type PackFile,
  type ReportPackInput,
  type ReportPackOptions,
} from "../reports/pack.ts";
import { UNKNOWN, type ProtectedTable, type ReportEvidencePack } from "../reports/types.ts";

export interface ReportsPanelProps {
  lang: Lang;
  input: ReportPackInput;
  options: ReportPackOptions;
  /** Logged deliveries, citations and reviews. The pack built here is added to them. */
  logs: Omit<KpiRecords, "packs">;
  /** Receives the files of the pack. The default saves them from the browser. */
  onExportFiles?: (files: PackFile[]) => void;
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function saveFiles(files: PackFile[]): void {
  for (const file of files) {
    const url = URL.createObjectURL(new Blob([file.content], { type: file.mime }));
    const link = document.createElement("a");
    link.href = url;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }
}

function TableView({ table, lang, tr, k }: { table: ProtectedTable; lang: Lang; tr: Translate; k: number }) {
  const caption = tr("rp.table.caption", { kind: tr(`rp.kind.${table.kind}`), period: periodLabel(lang, table.period) });
  const captionId = `rp-table-${table.id.replace(/[^a-z0-9]/gi, "-")}`;
  if (table.state === "withheld") {
    return (
      <div className="report-table">
        <h4 id={captionId}>{caption}</h4>
        <p>{tr("rp.table.withheld", { k })}</p>
      </div>
    );
  }
  return (
    <div className="report-table">
      {/* The scrolling box takes focus so a keyboard user can scroll a wide table. */}
      <div className="table-scroll" role="group" aria-labelledby={captionId} tabIndex={0}>
        <table>
          <caption id={captionId}>{caption}</caption>
          <thead>
            <tr>
              <th scope="col">{tr("rp.table.region")}</th>
              {table.topics.map((topic) => (
                <th key={topic} scope="col">
                  {topicLabel(lang, topic)}
                </th>
              ))}
              <th scope="col">{tr("rp.table.total")}</th>
            </tr>
          </thead>
          <tbody>
            {table.rows.map((row) => (
              <tr key={row.region_code}>
                <th scope="row">{regionLabel(lang, row.region_code)}</th>
                {row.cells.map((cell, c) => (
                  <td key={table.topics[c]} className={cell.state === "suppressed" ? "is-suppressed" : undefined}>
                    {cell.state === "published" ? cell.count : tr("rp.table.suppressed")}
                  </td>
                ))}
                <td>{row.total}</td>
              </tr>
            ))}
            <tr>
              <th scope="row">{tr("rp.table.total")}</th>
              {table.column_totals.map((total, c) => (
                <td key={table.topics[c]}>{total}</td>
              ))}
              <td>{table.total}</td>
            </tr>
          </tbody>
        </table>
      </div>
      {table.rolled_up_rows.length > 0 && (
        <p>{tr("rp.table.rolledUp", { rows: table.rolled_up_rows.map((code) => regionLabel(lang, code)).join(", ") })}</p>
      )}
      {table.combined_topics.length > 0 && (
        <p>{tr("rp.table.combined", { topics: table.combined_topics.map((topic) => topicLabel(lang, topic)).join(", ") })}</p>
      )}
    </div>
  );
}

function Provenance({ pack, tr }: { pack: ReportEvidencePack; tr: Translate }) {
  return (
    <ul className="cells">
      {pack.provenance.map((p) => (
        <li key={p.set_id} className="cell">
          <dl>
            {(
              [
                ["rp.prov.set", p.set_id],
                ["rp.prov.source", p.source_name],
                ["rp.prov.link", p.source_url ?? tr("rp.prov.none")],
                ["rp.prov.licence", p.licence],
                ["rp.prov.date", p.source_date === UNKNOWN ? tr("rp.unknown") : p.source_date],
                ["rp.prov.tier", tr(`rp.tier.${p.tier}`)],
                ["rp.prov.label", p.label === null ? tr("rp.prov.none") : tr(`rp.label.${p.label}`)],
                ["rp.prov.example", tr(p.example ? "rp.yes" : "rp.no")],
              ] as Array<[MessageKey, string]>
            ).map(([key, value]) => (
              <div key={key} className="field">
                <dt>{tr(key)}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </li>
      ))}
    </ul>
  );
}

function indicatorLabel(result: KpiResult, tr: Translate): string {
  const known = INDICATORS.some((definition) => definition.id === result.id);
  return known ? tr(`kpi.ind.${result.id}` as MessageKey) : result.id;
}

function Indicators({ results, tr }: { results: KpiResult[]; tr: Translate }) {
  return (
    <section aria-labelledby="kpi-heading">
      <h2 id="kpi-heading">{tr("kpi.heading")}</h2>
      <p>{tr("kpi.intro")}</p>
      {logicModel(results).map((group) => (
        <div key={group.stage} className="report-table table-scroll" role="group" aria-labelledby={`kpi-stage-${group.stage}`} tabIndex={0}>
          <table>
            <caption id={`kpi-stage-${group.stage}`}>{tr(`kpi.stage.${group.stage}`)}</caption>
            <thead>
              <tr>
                <th scope="col">{tr("kpi.col.indicator")}</th>
                <th scope="col">{tr("kpi.col.value")}</th>
                <th scope="col">{tr("kpi.col.basis")}</th>
              </tr>
            </thead>
            <tbody>
              {group.indicators.map((result) => (
                <tr key={result.id}>
                  <th scope="row">{indicatorLabel(result, tr)}</th>
                  <td>
                    {result.state === "value"
                      ? `${result.value}${result.from_example_records ? ` (${tr("kpi.example")})` : ""}`
                      : tr("kpi.noData")}
                  </td>
                  <td>{result.state === "value" ? result.records_used : 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
    </section>
  );
}

export function ReportsPanel({ lang, input, options, logs, onExportFiles = saveFiles }: ReportsPanelProps) {
  const [exported, setExported] = useState<number | null>(null);
  const result = useMemo(() => buildReportEvidencePack(input, options), [input, options]);
  const tr: Translate = (key, vars) => t(lang, key, vars);
  const indicators = useMemo(
    () => computeIndicators(INDICATORS, { ...logs, packs: result.ok ? [result.pack] : [] }),
    [logs, result],
  );

  return (
    <>
      <section aria-labelledby="reports-heading" data-testid="reports-section">
        <h2 id="reports-heading">{tr("rp.ui.heading")}</h2>
        <p>{tr("rp.ui.intro")}</p>
        {!result.ok ? (
          <>
            <h3>{tr("rp.refusal.heading")}</h3>
            <ul>
              {result.refusal.map((reason) => (
                <li key={reason.code}>{tr(`rp.refusal.${reason.code}`, { n: reason.count })}</li>
              ))}
            </ul>
          </>
        ) : (
          <>
            {result.pack.demonstration && <p className="banner">{tr("rp.demo")}</p>}
            <h3>{tr("rp.heading.limits")}</h3>
            <ul>
              {result.pack.limits[lang].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
            <button
              type="button"
              className="primary"
              onClick={() => {
                onExportFiles(result.files);
                setExported(result.files.length);
              }}
            >
              {tr("rp.ui.export")}
            </button>
            <p aria-live="polite" data-testid="reports-export-status">
              {exported === null ? "" : tr("rp.ui.exported", { n: exported })}
            </p>
            <h3>{tr("rp.heading.tables")}</h3>
            {result.pack.tables.map((table) => (
              <TableView key={table.id} table={table} lang={lang} tr={tr} k={result.pack.suppression.minimum_cell_size} />
            ))}
            <h3>{tr("rp.heading.counts")}</h3>
            <ul>
              <li>{tr("rp.count.tablesPublished", { n: result.pack.suppression.counts.tables_published })}</li>
              <li>{tr("rp.count.tablesWithheld", { n: result.pack.suppression.counts.tables_withheld })}</li>
              <li>{tr("rp.count.cellsPublished", { n: result.pack.suppression.counts.cells_published })}</li>
              <li>{tr("rp.count.cellsSuppressed", { n: result.pack.suppression.counts.cells_suppressed })}</li>
              <li>{tr("rp.count.rowsRolledUp", { n: result.pack.suppression.counts.rows_rolled_up })}</li>
              <li>{tr("rp.count.topicsCombined", { n: result.pack.suppression.counts.topics_combined })}</li>
            </ul>
            <h3>{tr("rp.heading.rules")}</h3>
            <ul>
              {result.pack.suppression.rules.map((rule) => (
                <li key={rule.id}>{rule[lang]}</li>
              ))}
            </ul>
            <h3>{tr("rp.heading.method")}</h3>
            <ul>
              {result.pack.methodology[lang].map((line) => (
                <li key={line}>{line}</li>
              ))}
              <li>
                {tr("rp.consent.line", {
                  purpose: result.pack.consent.required_purpose.purpose_id,
                  version: result.pack.consent.required_purpose.purpose_version,
                })}
              </li>
            </ul>
            <h3>{tr("rp.heading.provenance")}</h3>
            <Provenance pack={result.pack} tr={tr} />
          </>
        )}
      </section>
      <Indicators results={indicators} tr={tr} />
    </>
  );
}
