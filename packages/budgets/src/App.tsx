import { useState } from "react";
import en from "../catalogs/en.json";
import fr from "../catalogs/fr.json";
import budget from "../budget.json";
import fixture from "../fixtures/demo-install.json";
import { checkInstall, type Dimension, type InstallAsset } from "./checker.ts";
import "./style.css";

type Locale = "en" | "fr";
const report = checkInstall(fixture.assets as InstallAsset[], budget);
const rows = [
  ["precache", report.totals.precacheBytes, budget.maxPrecacheBytes],
  ["largestJs", report.totals.largestJsEntryBytes, budget.maxLargestJsEntryBytes],
  ["totalJs", report.totals.totalJsBytes, budget.maxTotalJsBytes],
  ["totalCss", report.totals.totalCssBytes, budget.maxTotalCssBytes],
  ["asset", Math.max(0, ...fixture.assets.map((asset) => asset.bytes)), budget.maxAssetBytes],
] as const;

export function App(): React.JSX.Element {
  const [locale, setLocale] = useState<Locale>("en");
  const t = locale === "en" ? en : fr;
  const format = (value: number): string => new Intl.NumberFormat(locale === "en" ? "en-CA" : "fr-CA").format(value);
  const names: Record<Dimension, string> = {
    empty_manifest: t.empty_manifest, precache: t.precache,
    largest_js_entry: t.largest_js_entry, total_js: t.total_js,
    total_css: t.total_css, asset: t.asset,
  };
  return (
    <main lang={locale}>
      <h1>{t.title}</h1>
      <div className="language">
        <label htmlFor="locale">{t.language}</label>
        <select id="locale" value={locale} onChange={(event) => setLocale(event.target.value as Locale)}>
          <option value="en">{t.en}</option>
          <option value="fr">{t.fr}</option>
        </select>
      </div>
      <p>{t.fixture}</p>
      <h2 role="status">{report.status === "pass" ? t.pass : t.fail}</h2>
      <div className="table-scroll">
        <table>
          <thead><tr><th scope="col">{t.metric}</th><th scope="col">{t.actual}</th><th scope="col">{t.limit}</th></tr></thead>
          <tbody>{rows.map(([name, actual, limit]) => (
            <tr key={name}><th scope="row">{t[name]}</th><td>{format(actual)} {t.bytes}</td><td>{format(limit)} {t.bytes}</td></tr>
          ))}</tbody>
        </table>
      </div>
      <section aria-labelledby="breaches">
        <h2 id="breaches">{t.violations}</h2>
        {report.violations.length === 0 ? <p>{t.noViolations}</p> : (
          <ul>{report.violations.map((violation, index) => (
            <li key={`${violation.dimension}-${index}`}>
              <strong>{names[violation.dimension]}</strong> — {format(violation.actualBytes)} / {format(violation.limitBytes)} {t.bytes}
              {violation.paths.length > 0 && <><p>{t.paths}</p><ul>{violation.paths.map((path) => <li key={path}><code>{path}</code></li>)}</ul></>}
            </li>
          ))}</ul>
        )}
      </section>
      <p>{t.scope}</p>
      <p>{t.notice}</p>
      <p>{t.credit}</p>
    </main>
  );
}
