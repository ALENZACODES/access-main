import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DEMO_AS_OF, DEMO_OBSERVATIONS } from "../demo.ts";
import { LANGS, isLang, t, type Lang, type MessageKey } from "../i18n/index.ts";
import { buildEvidencePack, packFilename, serialisePack } from "../pack.ts";
import type { Cell, PublishedCell, SuppressedCell, UnknownCell } from "../types.ts";
import "./styles.css";

export interface AppProps {
  observations?: readonly unknown[];
  asOf?: string;
  initialLang?: Lang;
  /** Receives the pack JSON and a file name. The default saves a file from the browser. */
  onExport?: (json: string, filename: string) => void;
}

function saveJson(json: string, filename: string): void {
  const url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function langFromLocation(): Lang {
  const value = new URLSearchParams(window.location.search).get("lang");
  return isLang(value) ? value : "en";
}

type Translate = (key: MessageKey, vars?: Record<string, string | number>) => string;

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CellIdentity({ cell, tr }: { cell: Cell; tr: Translate }) {
  const area = cell.geography.id === "UNKNOWN" ? tr("area.unknown") : cell.geography.id;
  const period = cell.period === "UNKNOWN" ? tr("period.unknown") : cell.period;
  return (
    <>
      <Field label={tr("field.category")}>{tr(`category.${cell.category}`)}</Field>
      <Field label={tr("field.area")}>{area}</Field>
      <Field label={tr("field.period")}>{period}</Field>
    </>
  );
}

function dataStatus(cell: PublishedCell | UnknownCell, tr: Translate): string {
  const tiers = cell.provenance.tiers.map((tier) => tr(`tier.${tier}`));
  const labels = cell.provenance.prototype_labels.map((label) => tr(`label.${label}`));
  return [...tiers, ...labels].join(", ");
}

function PublishedItem({ cell, tr }: { cell: PublishedCell; tr: Translate }) {
  const headline = cell.headline_eligible
    ? tr("headline.yes")
    : tr("headline.no", { reasons: cell.headline_exclusions.map((code) => tr(`exclusion.${code}`)).join(", ") });
  return (
    <li className="cell">
      <dl>
        <CellIdentity cell={cell} tr={tr} />
        <Field label={tr("field.count")}>{cell.count}</Field>
        <Field label={tr("field.dataStatus")}>{dataStatus(cell, tr)}</Field>
        <Field label={tr("field.headline")}>{headline}</Field>
      </dl>
    </li>
  );
}

function SuppressedItem({ cell, tr }: { cell: SuppressedCell; tr: Translate }) {
  return (
    <li className="cell">
      <dl>
        <CellIdentity cell={cell} tr={tr} />
        <Field label={tr("field.status")}>{tr("suppressed.item")}</Field>
      </dl>
    </li>
  );
}

function UnknownItem({ cell, tr }: { cell: UnknownCell; tr: Translate }) {
  return (
    <li className="cell">
      <dl>
        <CellIdentity cell={cell} tr={tr} />
        <Field label={tr("field.status")}>{tr("unknown.item")}</Field>
        <Field label={tr("field.dataStatus")}>{dataStatus(cell, tr)}</Field>
      </dl>
    </li>
  );
}

export function App({ observations = DEMO_OBSERVATIONS, asOf = DEMO_AS_OF, initialLang, onExport = saveJson }: AppProps) {
  const [lang, setLang] = useState<Lang>(initialLang ?? langFromLocation());
  const [exportedAs, setExportedAs] = useState<string | null>(null);
  const { pack } = useMemo(() => buildEvidencePack(observations, { asOf }), [observations, asOf]);
  const tr: Translate = (key, vars) => t(lang, key, vars);

  useEffect(() => {
    document.documentElement.lang = lang;
    document.title = t(lang, "app.title");
  }, [lang]);

  const published = pack.cells.filter((c): c is PublishedCell => c.state === "published");
  const suppressed = pack.cells.filter((c): c is SuppressedCell => c.state === "suppressed");
  const unknown = pack.cells.filter((c): c is UnknownCell => c.state === "unknown");

  const exportPack = () => {
    const filename = packFilename(pack);
    onExport(serialisePack(pack), filename);
    setExportedAs(filename);
  };

  return (
    <>
      <header className="page-header">
        <h1>{tr("app.title")}</h1>
        <p>{tr("app.subtitle")}</p>
        <div role="group" aria-label={tr("lang.label")} className="lang-switch">
          {LANGS.map((code) => (
            <button key={code} type="button" lang={code} aria-pressed={lang === code} onClick={() => setLang(code)}>
              {t(code, `lang.${code}`)}
            </button>
          ))}
        </div>
      </header>
      <main>
        {pack.demonstration && <p className="banner">{tr("demo.banner")}</p>}
        <p>{tr("meta.asOf", { date: pack.as_of })}</p>
        <p>{tr("meta.threshold", { k: pack.suppression.k })}</p>

        <section aria-labelledby="summary-heading">
          <h2 id="summary-heading">{tr("summary.heading")}</h2>
          <ul>
            <li>{tr("summary.published", { n: pack.counts.published })}</li>
            <li>{tr("summary.suppressed", { n: pack.counts.suppressed })}</li>
            <li>{tr("summary.unknown", { n: pack.counts.unknown })}</li>
          </ul>
          <button type="button" className="primary" onClick={exportPack}>
            {tr("export.button")}
          </button>
          <p role="status">{exportedAs ? tr("export.done", { file: exportedAs }) : ""}</p>
        </section>

        <section aria-labelledby="published-heading">
          <h2 id="published-heading">{tr("published.heading")}</h2>
          {published.length === 0 ? (
            <p>{tr("published.empty")}</p>
          ) : (
            <ul className="cells">
              {published.map((cell) => (
                <PublishedItem key={`${cell.category}|${cell.geography.id}|${cell.period}`} cell={cell} tr={tr} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="suppressed-heading" data-testid="suppressed-section">
          <h2 id="suppressed-heading">{tr("suppressed.heading")}</h2>
          <p>{tr("suppressed.intro")}</p>
          {suppressed.length === 0 ? (
            <p>{tr("suppressed.empty")}</p>
          ) : (
            <ul className="cells">
              {suppressed.map((cell) => (
                <SuppressedItem key={`${cell.category}|${cell.geography.id}|${cell.period}`} cell={cell} tr={tr} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="unknown-heading">
          <h2 id="unknown-heading">{tr("unknown.heading")}</h2>
          <p>{tr("unknown.intro")}</p>
          {unknown.length === 0 ? (
            <p>{tr("unknown.empty")}</p>
          ) : (
            <ul className="cells">
              {unknown.map((cell) => (
                <UnknownItem key={`${cell.category}|${cell.geography.id}|${cell.period}`} cell={cell} tr={tr} />
              ))}
            </ul>
          )}
        </section>

        <section aria-labelledby="method-heading">
          <h2 id="method-heading">{tr("method.heading")}</h2>
          <ul>
            {pack.methodology[lang].map((line) => (
              <li key={line}>{line}</li>
            ))}
            <li>{pack.counting.note[lang]}</li>
          </ul>
          <h3>{tr("rules.heading")}</h3>
          <ul>
            {pack.suppression.rules.map((rule) => (
              <li key={rule.id}>{rule[lang]}</li>
            ))}
          </ul>
        </section>
      </main>
      <footer className="page-footer">
        <p>{tr("footer.note")}</p>
      </footer>
    </>
  );
}
