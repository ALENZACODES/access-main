import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { tierMessageKey, type CacheEntry, type VerificationTier } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { ConfirmDialog } from "../design/ConfirmDialog.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { clearCachedRecords, listCacheEntries, summarizeStorage, type StorageSummary } from "../storage/repository.ts";

const TIER_ORDER: VerificationTier[] = [
  "UNKNOWN",
  "TIER_0",
  "TIER_1",
  "TIER_2",
  "TIER_3",
  "TIER_4",
  "PROTOTYPE-UNVERIFIED",
  "SEEDED-OPEN-DATA",
  "COMMUNITY-REPORTED",
  "VERIFIED",
];

export function DataStatusPage() {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const [summary, setSummary] = useState<StorageSummary | null>(null);
  const [entries, setEntries] = useState<CacheEntry[]>([]);
  const [worker, setWorker] = useState<"unknown" | "active" | "inactive" | "unsupported">("unknown");
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);
  useDocumentTitle(t("data.title"));

  const load = () => {
    void summarizeStorage().then(setSummary);
    void listCacheEntries().then(setEntries);
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
        {summary?.health === "unavailable" ? <p role="status">{t("data.storageUnavailable")}</p> : null}
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
        {entries.length > 0 ? (
          <ul className="record-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <p>
                  <strong>{entry.title}</strong> · {entry.kind}
                </p>
                <p>
                  {entry.provenance.source_name} · {entry.provenance.licence} · {entry.provenance.source_date} ·{" "}
                  {entry.provenance.verification_tier}
                </p>
                <p>{t(tierMessageKey(entry.provenance.verification_tier))}</p>
              </li>
            ))}
          </ul>
        ) : null}
        <p>{summary ? t("storage.outboxCount", { count: summary.outboxCount }) : null}</p>
        <p>{summary && summary.outboxCount > 0 ? t("data.outboxSome") : t("data.outboxNone")}</p>
        <Button variant="secondary" onPress={() => setConfirming(true)} isDisabled={!summary || (summary.cacheCount === 0 && summary.outboxCount === 0)}>
          {t("data.clear")}
        </Button>
        {cleared ? <p role="status">{t("data.cleared")}</p> : null}
      </section>
      <section className="stack" aria-labelledby="legend-title">
        <h2 id="legend-title">{t("data.legendTitle")}</h2>
        <dl className="review-list">
          {TIER_ORDER.map((tier) => (
            <div key={tier}>
              <dt>{tier}</dt>
              <dd>{t(tierMessageKey(tier))}</dd>
            </div>
          ))}
        </dl>
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
          onCancel={() => setConfirming(false)}
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
