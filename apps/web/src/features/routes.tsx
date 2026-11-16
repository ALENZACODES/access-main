import { lazy, Suspense, useEffect, useState, type ComponentType, type ReactNode } from "react";
import { Link, type RouteObject } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { registerFeatureTranslations } from "./i18n.ts";
import { loadFeaturePackage, type FeaturePackage } from "./packages.ts";
import { consentGranted, consentStatus, type ConsentCheck } from "./consent.ts";
import { classifyRecoveryError, RecoveryNotice, type RecoveryFailure } from "../recovery/index.ts";

registerFeatureTranslations();

const entries = ["controls", "consent", "caregiver", "sync", "advocacy", "sources"] as const;
type Entry = (typeof entries)[number];

function Message({ name }: { name: "pending" | "unavailable" }): ReactNode {
  const { t } = useTranslation();
  return <p role="status">{t(`features.${name}`)}</p>;
}

function SettingsIndex(): ReactNode {
  const { t } = useTranslation();
  return <><h1>{t("features.title")}</h1><p>{t("features.description")}</p>
    <nav aria-label={t("features.title")}><ul>
      <li>
        <Link style={{ display: "inline-block", minHeight: 44, padding: 8 }} to="/profile">
          {t("features.profile")}
        </Link><p>{t("features.profileDesc")}</p>
      </li>
      {entries.map((entry) => <li key={entry}>
      <Link style={{ display: "inline-block", minHeight: 44, padding: 8 }} to={`/settings/${entry}`}>
        {t(`features.${entry}`)}
      </Link><p>{t(`features.${entry}Desc`)}</p>
    </li>)}</ul></nav>
  </>;
}

function PackageView({ moduleName, exportName, props = {} }: {
  moduleName: FeaturePackage; exportName: string; props?: Record<string, unknown>;
}): ReactNode {
  const [result, setResult] = useState<{ module: Record<string, unknown> | null; error: boolean } | null>(null);
  useEffect(() => {
    let active = true;
    setResult(null);
    void loadFeaturePackage(moduleName).then((module) => {
      if (active) setResult({ module, error: false });
    }).catch(() => { if (active) setResult({ module: null, error: true }); });
    return () => { active = false; };
  }, [moduleName]);
  if (!result) return <Message name="pending" />;
  if (result.error) return <Message name="unavailable" />;
  if (!result.module) return <Message name="pending" />;
  const Component = result.module[exportName] as ComponentType<Record<string, unknown>> | undefined;
  if (typeof Component !== "function" && typeof Component !== "object") return <Message name="pending" />;
  return <Component {...props} />;
}

function ControlsScreen(): ReactNode {
  const { i18n } = useTranslation();
  // Embedded: the shell keeps its own <main>, h1, title and document language.
  return <PackageView moduleName="controls" exportName="App" props={{ embedded: true, initialLang: i18n.language.startsWith("fr") ? "fr" : "en" }} />;
}

function ConsentScreen(): ReactNode {
  const { i18n } = useTranslation();
  const [engine, setEngine] = useState<unknown>(null);
  const [state, setState] = useState<"pending" | "loaded" | "error">("pending");
  useEffect(() => {
    let active = true;
    void loadFeaturePackage("consent").then((pkg) => {
      if (!active) return;
      if (!pkg || typeof pkg.createConsentEngine !== "function" || typeof pkg.createLocalStorageStore !== "function") return;
      const store = (pkg.createLocalStorageStore as (...args: unknown[]) => unknown)();
      setEngine((pkg.createConsentEngine as (options: unknown) => unknown)({ store }));
      setState("loaded");
    }).catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);
  if (state === "error") return <Message name="unavailable" />;
  if (state !== "loaded") return <Message name="pending" />;
  return <PackageView moduleName="consent" exportName="ConsentPanel" props={{ engine, locale: i18n.language.startsWith("fr") ? "fr" : "en" }} />;
}

function Guarded({ purpose, children }: { purpose: string; children: ReactNode }): ReactNode {
  const { t } = useTranslation();
  const [status, setStatus] = useState<"checking" | ConsentCheck>("checking");
  useEffect(() => {
    let active = true;
    setStatus("checking");
    void consentStatus(purpose).then((value) => {
      if (active) setStatus(value);
    });
    return () => { active = false; };
  }, [purpose]);
  return <section aria-live="polite">
    {status === "checking" ? <p>{t("features.loading")}</p> : status === "granted" ? children : <>
      <p>{t(status === "unavailable" ? "features.consentUnavailable" : "features.permission")}</p>
      <Link to="/settings/consent">{t("features.consentLink")}</Link>
    </>}
  </section>;
}

function CaregiverScreen(): ReactNode {
  return <Guarded purpose="caregiver-sharing"><PackageView moduleName="caregiver" exportName="App" /></Guarded>;
}

function SyncScreen(): ReactNode {
  const { t } = useTranslation();
  const [left, setLeft] = useState("");
  const [right, setRight] = useState("");
  const [output, setOutput] = useState("");
  const [status, setStatus] = useState<"none" | "invalid" | "pending">("none");
  async function compare(): Promise<void> {
    setOutput("");
    if (!left.trim() || !right.trim()) { setStatus("none"); return; }
    let a: unknown; let b: unknown;
    try { a = JSON.parse(left); b = JSON.parse(right); }
    catch { setStatus("invalid"); return; }
    try {
      const pkg = await loadFeaturePackage("sync");
      if (!pkg || typeof pkg.reconcile !== "function" || typeof pkg.assertSnapshot !== "function") { setStatus("pending"); return; }
      (pkg.assertSnapshot as (input: unknown) => void)(a);
      (pkg.assertSnapshot as (input: unknown) => void)(b);
      const report = (pkg.reconcile as (a: unknown, b: unknown) => unknown)(a, b);
      setOutput(JSON.stringify(report, null, 2));
      setStatus("none");
    } catch { setStatus("invalid"); }
  }
  return <section><div><label htmlFor="snapshot-a">{t("features.left")}</label>
    <textarea id="snapshot-a" rows={8} value={left} onChange={(e) => setLeft(e.target.value)} /></div>
    <div><label htmlFor="snapshot-b">{t("features.right")}</label>
    <textarea id="snapshot-b" rows={8} value={right} onChange={(e) => setRight(e.target.value)} /></div>
    <button type="button" style={{ minHeight: 44 }} onClick={() => { void compare(); }}>{t("features.compare")}</button>
    {status !== "none" && <p role="status">{t(`features.${status === "invalid" ? "invalidJson" : "pending"}`)}</p>}
    {output && <section><h2>{t("features.result")}</h2><pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{output}</pre></section>}
  </section>;
}

function AdvocacyScreen(): ReactNode {
  const { t, i18n } = useTranslation();
  const [observations, setObservations] = useState("");
  const [error, setError] = useState("");
  const [failure, setFailure] = useState<RecoveryFailure | null>(null);
  const language = i18n.language.startsWith("fr") ? "fr" : "en";
  const invalid = () => Object.assign(new Error("invalid"), { name: "DataError" });
  async function exportPack(): Promise<void> {
    setError(""); setFailure(null);
    if (!(await consentGranted("advocacy-export"))) { setError(t("features.exportBlocked")); return; }
    try {
      const pkg = await loadFeaturePackage("advocacy");
      if (!pkg || typeof pkg.buildEvidencePack !== "function" || typeof pkg.serialisePack !== "function") { setError(t("features.pending")); return; }
      const input: unknown = JSON.parse(observations);
      if (!Array.isArray(input)) throw invalid();
      const result = (pkg.buildEvidencePack as (input: unknown) => unknown)(input) as Record<string, unknown>;
      const validPack = result.pack;
      if (!validPack || (typeof pkg.validatePack === "function" &&
        !(pkg.validatePack as (value: unknown) => { valid: boolean })(validPack).valid)) throw invalid();
      const content = (pkg.serialisePack as (pack: unknown) => string)(validPack);
      const blob = new Blob([content], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "evidence-pack.json";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setFailure(classifyRecoveryError("export", cause)); }
  }
  return <section><p>{t("features.advocacyDesc")}</p>
    <label htmlFor="advocacy-observations">{t("features.exportInput")}</label>
    <textarea id="advocacy-observations" rows={8} value={observations} onChange={(e) => setObservations(e.target.value)} />
    <p><button type="button" style={{ minHeight: 44 }} onClick={() => { void exportPack(); }}>
      {t("features.export")}</button></p>
    {error && <p role="alert">{error}</p>}
    {failure && <RecoveryNotice failure={failure} locale={language} onRetry={() => { void exportPack(); }}
      onCheckInput={() => document.getElementById("advocacy-observations")?.focus()} onDismiss={() => setFailure(null)} />}
  </section>;
}

type SourceRow = { sourceId: string; name: string; licence: string; licenceUrl?: string; attribution?: string;
  retrieved?: string; inWebPack: boolean; heldReason?: string | null };
type Manifest = { sources?: SourceRow[]; counts?: { records?: number; byTranche?: Record<string, number>;
  bySource?: Record<string, number> } };

function Counts({ title, counts }: { title: string; counts: Record<string, number> }): ReactNode {
  const { t } = useTranslation();
  return <section><h2>{title}</h2>{Object.keys(counts).length === 0 ? <p>{t("features.none")}</p> :
    <table><thead><tr><th scope="col">{t("features.sourceName")}</th><th scope="col">{t("features.count")}</th></tr></thead>
      <tbody>{Object.entries(counts).map(([name, count]) => <tr key={name}><th scope="row">{name}</th><td>{count.toLocaleString()}</td></tr>)}</tbody>
    </table>}</section>;
}

function SourcesScreen(): ReactNode {
  const { t } = useTranslation();
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [state, setState] = useState<"loading" | "pending" | "error" | "ready">("loading");
  useEffect(() => {
    let active = true;
    void (async () => {
      const pkg = await loadFeaturePackage("data-client");
      if (!pkg || typeof pkg.createPackSource !== "function") { if (active) setState("pending"); return; }
      const client = (pkg.createPackSource as (options: { baseUrl: string }) => { manifest(): Promise<Manifest> })({
        baseUrl: `${import.meta.env.BASE_URL}data/`,
      });
      const value = await client.manifest();
      if (active) { setManifest(value); setState("ready"); }
    })().catch(() => { if (active) setState("error"); });
    return () => { active = false; };
  }, []);
  if (state === "pending") return <Message name="pending" />;
  if (state === "loading") return <p role="status">{t("features.loading")}</p>;
  if (state === "error" || !manifest) return <p role="alert">{t("features.noManifest")}</p>;
  return <section><p>{t("features.recordsCount", { count: typeof manifest.counts?.records === "number" ? manifest.counts.records.toLocaleString() : t("features.unknown") })}</p>
    <Counts title={t("features.tranche")} counts={manifest.counts?.byTranche ?? {}} />
    <Counts title={t("features.sourceCounts")} counts={manifest.counts?.bySource ?? {}} />
    <h2>{t("features.sources")}</h2>
    {(manifest.sources?.length ?? 0) === 0 ? <p>{t("features.none")}</p> :
      <div style={{ overflowX: "auto" }}><table><thead><tr>
        {["sourceName", "licence", "retrieved", "included", "reason", "attribution"].map((key) => <th key={key} scope="col">{t(`features.${key}`)}</th>)}
      </tr></thead><tbody>{manifest.sources?.map((source) => <tr key={source.sourceId}>
        <th scope="row">{source.name} ({source.sourceId})</th>
        <td>{source.licenceUrl ? <a href={source.licenceUrl}>{source.licence}</a> : source.licence}</td>
        <td>{source.retrieved ?? t("features.unknown")}</td>
        <td>{t(`features.${source.inWebPack ? "yes" : "no"}`)}</td>
        <td>{source.heldReason ?? "—"}</td><td>{source.attribution ?? "—"}</td>
      </tr>)}</tbody></table></div>}
  </section>;
}

function FeaturePage({ entry, children }: { entry: Entry; children: ReactNode }): ReactNode {
  const { t } = useTranslation();
  return <><h1>{t(`features.${entry}`)}</h1><p>{t(`features.${entry}Desc`)}</p>
    {children}<p><Link className="text-link" to="/settings">{t("features.back")}</Link></p></>;
}

function ControlsPage(): ReactNode { return <FeaturePage entry="controls"><ControlsScreen /></FeaturePage>; }
function ConsentPage(): ReactNode { return <FeaturePage entry="consent"><ConsentScreen /></FeaturePage>; }
function CaregiverPage(): ReactNode { return <FeaturePage entry="caregiver"><CaregiverScreen /></FeaturePage>; }
function SyncPage(): ReactNode { return <FeaturePage entry="sync"><SyncScreen /></FeaturePage>; }
function AdvocacyPage(): ReactNode { return <FeaturePage entry="advocacy"><AdvocacyScreen /></FeaturePage>; }
function SourcesPage(): ReactNode { return <FeaturePage entry="sources"><SourcesScreen /></FeaturePage>; }

const pages = {
  controls: lazy(async () => ({ default: ControlsPage })),
  consent: lazy(async () => ({ default: ConsentPage })),
  caregiver: lazy(async () => ({ default: CaregiverPage })),
  sync: lazy(async () => ({ default: SyncPage })),
  advocacy: lazy(async () => ({ default: AdvocacyPage })),
  sources: lazy(async () => ({ default: SourcesPage })),
};

export const featureRoutes: RouteObject[] = [
  { index: true, element: <SettingsIndex /> },
  ...entries.map((entry) => {
    const Page = pages[entry];
    return { path: entry, element: <Suspense fallback={<Message name="pending" />}><Page /></Suspense> };
  }),
];
