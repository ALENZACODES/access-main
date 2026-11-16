import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { DISPLAY_TIERS, tierMessageKey, type CacheEntry } from "@access/shared";
import {
  DEFAULT_STALE_AFTER_DAYS,
  auditRegistry,
  buildAgeDistribution,
  buildCacheRecords,
  buildChecksumFile,
  buildExportFiles,
  buildMarkdownFile,
  buildSourceList,
  buildWorkload,
  cachedSourceInputs,
  cleanValue,
  dataBadge,
  describeVerify,
  extraLabel,
  explainStatus,
  formatRate,
  groupCachedSources,
  mountDataStatusPanel,
  parseRetrieved,
  renderAgeBandsHtml,
  renderSourceListHtml,
  renderWorkloadHtml,
  t as dsT,
  type DataBadge,
  type ExportFile,
  type MountedPanel,
} from "../data-status/index.ts";
import { Button } from "../design/Button.tsx";
import { ConfirmDialog } from "../design/ConfirmDialog.tsx";
import { ErrorActions } from "../shell/ErrorActions.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { clearCachedRecords, listCacheEntries, summarizeStorage, type StorageSummary } from "../storage/repository.ts";

/** Saves text as a file on this device. Nothing is sent anywhere. */
function saveTextFile(text: string, filename: string, mime: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: mime }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function DataStatusPage() {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const [summary, setSummary] = useState<StorageSummary | null>(null);
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [worker, setWorker] = useState<"unknown" | "active" | "inactive" | "unsupported">("unknown");
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [checksumsFailed, setChecksumsFailed] = useState(false);
  const clearRef = useRef<HTMLButtonElement>(null);
  const clearedRef = useRef<HTMLParagraphElement>(null);
  const panelHostRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<MountedPanel | null>(null);
  const panelKey = useRef("");
  const panelInputs = useRef({ records: buildCacheRecords([], "en"), locale: "en" as "en" | "fr" });
  useDocumentTitle(t("data.title"));

  useEffect(() => {
    if (cleared) clearedRef.current?.focus();
  }, [cleared]);

  const closeClear = () => {
    setConfirming(false);
    window.requestAnimationFrame(() => clearRef.current?.focus());
  };

  const load = () => {
    void summarizeStorage().then(setSummary);
    void listCacheEntries().then((list) => {
      setEntries(list);
      setLoaded(true);
    });
  };

  useEffect(() => {
    load();
    if (!("serviceWorker" in navigator)) {
      setWorker("unsupported");
      return;
    }
    setWorker(navigator.serviceWorker.controller ? "active" : "inactive");
  }, []);

  const dateLocale = i18n.language.startsWith("fr") ? "fr-CA" : "en-CA";
  const locale = i18n.language.startsWith("fr") ? "fr" : "en";
  const now = new Date();
  // One badge per cached record: its age, a provenance line with Unknown for gaps, and its licence kind.
  const badges = new Map<string, DataBadge>(entries.map((entry) => [entry.id, dataBadge({
    source: entry.provenance.source_name,
    licence: entry.provenance.licence,
    retrievedAt: entry.provenance.retrieved_at,
  }, locale, now)]));
  // With no cached records the share is UNKNOWN, never 0.
  const unknownDates = entries.filter((entry) => badges.get(entry.id)?.ageDays === null).length;
  const unknownDateRate = formatRate(entries.length > 0 ? (unknownDates / entries.length) * 100 : null, locale);
  // One row per source and licence. The date is the oldest retrieval, and Unknown when any record has no
  // usable date, so a row never looks better than its worst record (see data-status/cacheSources.ts).
  const sources = groupCachedSources(entries, now);
  const sourceRows = buildSourceList(cachedSourceInputs(sources), locale, now);
  const sourceListHtml = renderSourceListHtml(sourceRows, locale);
  // Every status says why: the retrieved date, the age and the limit, or the reason it is Unknown.
  const basisFor = (entry: CacheEntry): string => {
    const badge = badges.get(entry.id);
    if (!badge) return "";
    return explainStatus(
      {
        state: badge.state,
        ageDays: badge.ageDays,
        retrievedIso: parseRetrieved(entry.provenance.retrieved_at)?.day ?? null,
        limitDays: DEFAULT_STALE_AFTER_DAYS,
        issues: badge.issues,
      },
      locale,
    ).text;
  };
  // The panel and the export files read the same records: one dataset per cache kind, one source per cached record.
  const panelRecords = useMemo(() => buildCacheRecords(entries, locale), [entries, locale]);
  panelInputs.current = { records: panelRecords, locale };
  // The panel has its own source-list (CSV) button, which respects its filters, so the file list here leaves CSV out.
  const exportFiles: ExportFile[] = buildExportFiles(panelRecords, locale, now);
  const markdownFile = buildMarkdownFile(panelRecords, locale, now);
  // Planning views read the same audit as the panel and the files, so the numbers always agree.
  const audit = auditRegistry(panelRecords, now);
  const workloadHtml = renderWorkloadHtml(buildWorkload(audit, now), locale);
  const ageBandsHtml = renderAgeBandsHtml(buildAgeDistribution(audit, now), locale);
  const saveChecksums = async (): Promise<void> => {
    const file = await buildChecksumFile(exportFiles, locale);
    if (file === null) {
      setChecksumsFailed(true);
      return;
    }
    setChecksumsFailed(false);
    saveTextFile(file.text, file.filename, file.mime);
  };

  // The panel mounts once the saved records have been read, so it never shows an empty
  // inventory for a moment while records are still loading.
  useEffect(() => {
    const host = panelHostRef.current;
    if (!loaded || !host) return;
    const mounted = mountDataStatusPanel(host, {
      getRecords: () => panelInputs.current.records,
      getLocale: () => panelInputs.current.locale,
      onExport: (csv, filename) => saveTextFile(csv, filename, "text/csv;charset=utf-8"),
      plainTables: true,
    });
    panelRef.current = mounted;
    panelKey.current = JSON.stringify([panelInputs.current.locale, panelInputs.current.records]);
    return () => {
      mounted.destroy();
      panelRef.current = null;
    };
  }, [loaded]);

  // Redraw only when the records or the language really changed, so a reload that finds the same data leaves the panel alone.
  useEffect(() => {
    const key = JSON.stringify([locale, panelRecords]);
    if (key === panelKey.current) return;
    panelKey.current = key;
    panelRef.current?.refresh();
  }, [panelRecords, locale]);

  return (
    <div className="stack">
      <h1>{t("data.title")}</h1>
      <p className="lead">{t("data.lead")}</p>
      <section className="panel" aria-labelledby="connection-title">
        <h2 id="connection-title">{t("data.connection")}</h2>
        <p role="status">{online ? t("footer.online") : t("footer.offline")}</p>
      </section>
      <section className="stack" aria-labelledby="live-title">
        <h2 id="live-title">{t("data.liveTitle")}</h2>
        <p>{t("data.liveBody")}</p>
      </section>
      <section className="stack" aria-labelledby="sw-title">
        <h2 id="sw-title">{t("data.swTitle")}</h2>
        <p>
          {worker === "active" ? t("data.swActive") : null}
          {worker === "inactive" || worker === "unknown" ? t("data.swInactive") : null}
          {worker === "unsupported" ? t("data.swUnsupported") : null}
        </p>
      </section>
      <section className="stack" aria-labelledby="profile-status-title">
        <h2 id="profile-status-title">{t("data.profileTitle")}</h2>
        {summary?.health === "unavailable" ? (
          <div className="stack">
            <p role="status">{t("data.storageUnavailable")}</p>
            <p>{t("data.storageNext")}</p>
            <ErrorActions state="storageUnavailable" onRetry={load} />
          </div>
        ) : null}
        {summary && !summary.profile ? <p>{t("data.profileMissing")}</p> : null}
        {summary?.profile ? (
          <p>
            {t("data.profileStored", {
              date: new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short" }).format(
                new Date(summary.profile.updated_at),
              ),
            })}
          </p>
        ) : null}
        <p>{t("data.profileLocal")}</p>
        {summary?.profile ? (
          <>
            <p>
              {t("data.wifi", {
                value: summary.profile.offline_pack_preferences.wifi_only ? t("data.wifiOn") : t("data.wifiOff"),
              })}
            </p>
            <p>
              {t("data.limit", {
                value:
                  summary.profile.offline_pack_preferences.storage_limit_mb === null
                    ? t("data.limitNone")
                    : String(summary.profile.offline_pack_preferences.storage_limit_mb),
              })}
            </p>
          </>
        ) : null}
      </section>
      <section className="stack" aria-labelledby="cache-title">
        <h2 id="cache-title">{t("data.cacheTitle")}</h2>
        <p>{summary ? t("storage.cacheCount", { count: summary.cacheCount }) : t("home.checking")}</p>
        <p>{summary?.newestStoredAt ? t("data.asOf", { date: summary.newestStoredAt }) : t("data.noAsOf")}</p>
        {summary && summary.cacheCount === 0 ? <p>{t("data.cacheEmpty")}</p> : null}
        <dl className="review-list">
          <div>
            <dt>{t("data.qualityRate")}</dt>
            <dd data-testid="unknown-date-rate" aria-label={unknownDateRate.ariaLabel}>{unknownDateRate.text}</dd>
          </div>
        </dl>
        <p>{t("data.qualityRule", { days: DEFAULT_STALE_AFTER_DAYS })}</p>
        {entries.length > 0 ? (
          <ul className="record-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <p>
                  <strong>{entry.title}</strong> · {entry.kind}
                </p>
                <p>{badges.get(entry.id)?.provenanceLine}</p>
                <p className={`freshness freshness-${badges.get(entry.id)?.state ?? "unknown"}`}>{badges.get(entry.id)?.label}</p>
                <p data-testid="status-basis">{basisFor(entry)}</p>
                {badges.get(entry.id)?.licence === "terms" ? <p>{t("data.licenceTerms")}</p> : null}
                {badges.get(entry.id)?.licence === "unrecognised" ? <p>{t("data.licenceUnrecognised")}</p> : null}
                {badges.get(entry.id)?.licence === "unknown" ? <p>{t("data.licenceUnknown")}</p> : null}
                <p>
                  {String(entry.provenance.tier)}
                  {entry.provenance.prototype_label ? ` · ${entry.provenance.prototype_label}` : ""}
                </p>
                <p>{t(tierMessageKey(entry.provenance.tier))}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <p>{summary ? t("storage.outboxCount", { count: summary.outboxCount }) : null}</p>
        <p>{summary && summary.outboxCount > 0 ? t("data.outboxSome") : t("data.outboxNone")}</p>
        <Button
          ref={clearRef}
          variant="secondary"
          onPress={() => {
            setCleared(false);
            setConfirming(true);
          }}
          isDisabled={!summary || (summary.cacheCount === 0 && summary.outboxCount === 0)}
        >
          {t("data.clear")}
        </Button>
        {cleared ? (
          <p role="status" tabIndex={-1} ref={clearedRef}>{t("data.cleared")}</p>
        ) : null}
      </section>
      {sourceRows.length > 0 ? (
        <section className="stack" aria-labelledby="source-list-title">
          <h2 id="source-list-title">{dsT(locale, "src.title")}</h2>
          <div dangerouslySetInnerHTML={{ __html: sourceListHtml }} />
          <ul data-testid="source-basis">
            {sources
              .filter((s) => s.basis === "unknown-record" || s.recordCount > 1)
              .map((s) => (
                <li key={s.id}>
                  <strong>{cleanValue(s.name) ?? dsT(locale, "unknownName")}</strong>
                  {locale === "fr" ? "\u00A0:" : ":"}{" "}
                  {s.basis === "unknown-record"
                    ? dsT(locale, "src.basisUnknown", { n: s.unknownDateCount, total: s.recordCount })
                    : dsT(locale, "src.basisOldest", { total: s.recordCount })}
                </li>
              ))}
          </ul>
        </section>
      ) : null}
      <section className="stack">
        {loaded ? <div ref={panelHostRef} /> : null}
      </section>
      {loaded && entries.length > 0 ? (
        <div className="stack" data-testid="planning-views">
          <div dangerouslySetInnerHTML={{ __html: workloadHtml }} />
          <div dangerouslySetInnerHTML={{ __html: ageBandsHtml }} />
        </div>
      ) : null}
      <section className="stack" aria-labelledby="export-title">
        <h2 id="export-title">{dsT(locale, "dl.title")}</h2>
        <p>{dsT(locale, "dl.intro")}</p>
        <div className="button-row">
          {exportFiles.filter((file) => file.id !== "csv").map((file) => (
            <Button
              key={file.id}
              variant="secondary"
              isDisabled={entries.length === 0}
              onPress={() => saveTextFile(file.text, file.filename, file.mime)}
            >
              {file.label}
            </Button>
          ))}
          <Button
            variant="secondary"
            isDisabled={entries.length === 0}
            onPress={() => saveTextFile(markdownFile.text, markdownFile.filename, markdownFile.mime)}
          >
            {extraLabel("markdown", locale)}
          </Button>
          <Button variant="secondary" isDisabled={entries.length === 0} onPress={() => void saveChecksums()}>
            {extraLabel("checksums", locale)}
          </Button>
        </div>
        {checksumsFailed ? <p role="status">{describeVerify(null, locale)[0]}</p> : null}
      </section>
      <section className="stack" aria-labelledby="legend-title">
        <h2 id="legend-title">{t("data.legendTitle")}</h2>
        <dl className="review-list">
          {DISPLAY_TIERS.map((tier) => (
            <div key={String(tier)}>
              <dt>{String(tier)}</dt>
              <dd>{t(tierMessageKey(tier))}</dd>
            </div>
          ))}
        </dl>
        <p>{t("data.refusedTiers")}</p>
      </section>
      <section className="stack" aria-labelledby="map-title">
        <h2 id="map-title">{t("data.mapTitle")}</h2>
        <p>{t("data.mapBody")}</p>
      </section>
      {confirming ? (
        <ConfirmDialog
          title={t("data.clearTitle")}
          body={t("data.clearBody")}
          confirmLabel={t("data.clearConfirm")}
          cancelLabel={t("data.clearCancel")}
          onCancel={closeClear}
          onConfirm={() => {
            void clearCachedRecords().then(() => {
              setConfirming(false);
              setCleared(true);
              load();
            });
          }}
        />
      ) : null}
    </div>
  );
}
