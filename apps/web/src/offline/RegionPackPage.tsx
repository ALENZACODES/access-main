import { useEffect, useId, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { createPackSource, PackClientError, type PackManifest, type RegionStatus } from "../../../../packages/data-client/src/index.ts";
import { offlineCatalog } from "./catalog.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";

const source = createPackSource({ baseUrl: `${import.meta.env.BASE_URL}data/` });
const formatBytes = (bytes: number, language: string) => new Intl.NumberFormat(language, { maximumFractionDigits: 1 }).format(bytes / 1024) + " KiB";

export function OfflineRegionPage() {
  const { i18n } = useTranslation();
  const language = i18n.language.startsWith("fr") ? "fr" : "en";
  const c = offlineCatalog[language];
  const online = useOnline();
  useDocumentTitle(c.title);
  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [regions, setRegions] = useState<RegionStatus[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const keepRef = useRef<HTMLButtonElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const dialogTitle = useId();
  const progressTitle = useId();
  useEffect(() => { if (confirmation) keepRef.current?.focus(); }, [confirmation]);
  useEffect(() => {
    let active = true;
    source.manifest().then(async (value) => {
      const statuses = await source.regions();
      if (active) { setManifest(value); setRegions(statuses); }
    }).catch(() => { if (active) setError(c.unavailable); });
    return () => { active = false; };
  }, [c.unavailable]);
  async function refresh() { setRegions(await source.regions()); }
  async function download(id: string) {
    setBusy(id); setError(""); setMessage(""); setProgress(null);
    try {
      await source.downloadRegion(id, (done, total) => setProgress({ done, total }));
      await refresh(); setMessage(c.complete);
    } catch (cause) {
      setError(cause instanceof PackClientError ? `${cause.code === "quota" ? c.storage : c.error}: ${cause.message}` : c.error);
    } finally { setBusy(null); }
  }
  async function remove() {
    const id = confirmation;
    if (!id) return;
    setConfirmation(null); setBusy(id);
    try { await source.deleteRegion(id); await refresh(); setMessage(c.deleted); setProgress(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : c.error); }
    finally { setBusy(null); requestAnimationFrame(() => deleteRef.current?.focus()); }
  }
  return <main className="stack">
    <h1>{c.title}</h1>
    <p>{c.intro}</p>
    {!online && <p role="status" className="offline-banner">{c.offline}</p>}
    {error && <p role="alert">{error}</p>}
    {message && <p role="status" tabIndex={-1}>{message}</p>}
    {manifest && <>
      <p>{c.built}: <time dateTime={manifest.builtAt}>{manifest.builtAt.slice(0, 10)}</time>. {c.counts}: {manifest.counts.records.toLocaleString(language)}.</p>
      <section className="panel stack" aria-labelledby="offline-sources"><h2 id="offline-sources">{c.sources}</h2>
        <ul>{manifest.sources.filter((entry) => entry.inWebPack).map((entry) => <li key={entry.sourceId}>{entry.name} — {entry.licence} — {c.retrieved}: {entry.retrieved}</li>)}</ul>
        {manifest.sources.some((entry) => entry.sourceId.includes("osm") && entry.inWebPack) && <p>{c.credit}</p>}
      </section>
      <ul className="record-list">{regions.map((region) => <li key={region.id} className="panel stack">
        <h2>{region.label[language]}</h2>
        <p>{c.size}: {formatBytes(region.bytes, language)}. {c.counts}: {region.count.toLocaleString(language)}.</p>
        <p>{region.downloaded ? c.downloaded : c.notDownloaded}</p>
        <div className="button-row">
          {!region.downloaded && <button type="button" style={{ minHeight: 44, minWidth: 44 }} disabled={!online || !!busy} onClick={() => void download(region.id)}>{c.download}</button>}
          {region.downloaded && <><button type="button" style={{ minHeight: 44, minWidth: 44 }} disabled={!!busy} onClick={() => void refresh().then(() => setMessage(c.downloaded))}>{c.verify}</button>
          <button ref={deleteRef} type="button" style={{ minHeight: 44, minWidth: 44 }} disabled={!!busy} onClick={() => setConfirmation(region.id)}>{c.delete}</button></>}
        </div>
        {busy === region.id && progress && <div className="stack"><label id={progressTitle}>{c.progress}: {Math.round(progress.total ? 100 * progress.done / progress.total : 100)}%</label><progress aria-labelledby={progressTitle} value={progress.done} max={progress.total || 1}/></div>}
      </li>)}</ul>
    </>}
    {confirmation && <dialog open aria-labelledby={dialogTitle} className="panel stack" onKeyDown={(event) => {
      if (event.key === "Escape") setConfirmation(null);
      if (event.key === "Tab") { const buttons = [keepRef.current, deleteRef.current].filter(Boolean); if (event.shiftKey && document.activeElement === buttons[0]) { event.preventDefault(); buttons[1]?.focus(); } else if (!event.shiftKey && document.activeElement === buttons[1]) { event.preventDefault(); buttons[0]?.focus(); } }
    }}>
      <h2 id={dialogTitle}>{c.confirm}</h2><div className="button-row">
        <button ref={keepRef} type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={() => setConfirmation(null)}>{c.keep}</button>
        <button ref={deleteRef} type="button" style={{ minHeight: 44, minWidth: 44 }} onClick={() => void remove()}>{c.delete}</button>
      </div>
    </dialog>}
  </main>;
}
