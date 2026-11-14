import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { tierMessageKey, type OutboxItem, type PackManifest, type StoredPack } from "@access/shared";
import { Button } from "../design/Button.tsx";
import { ConfirmDialog } from "../design/ConfirmDialog.tsx";
import { downloadPack, fetchManifest, PackError, type PackErrorCode } from "../offline/download.ts";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";
import { useOnline } from "../shell/useOnline.ts";
import { deletePack, enqueueReport, getPack, listOutbox, savePack, StorageError } from "../storage/repository.ts";

const PACK_ID = "toronto";

function kb(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

/** Value for a datetime-local input, in the device's own clock. */
function localInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function OfflinePackPage() {
  const { t, i18n } = useTranslation();
  const online = useOnline();
  const language = i18n.language.startsWith("fr") ? "fr" : "en";
  const dateLocale = language === "fr" ? "fr-CA" : "en-CA";
  const formatDate = (iso: string) =>
    new Intl.DateTimeFormat(dateLocale, { dateStyle: "medium", timeStyle: "short", hourCycle: "h23" }).format(new Date(iso));
  useDocumentTitle(t("offline.title"));

  const [manifest, setManifest] = useState<PackManifest | null>(null);
  const [manifestState, setManifestState] = useState<"loading" | "ready" | "unavailable">("loading");
  const [pack, setPack] = useState<StoredPack | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [progress, setProgress] = useState<{ received: number; total: number } | null>(null);
  const [phase, setPhase] = useState<"idle" | "downloading" | "complete" | "deleted">("idle");
  const [error, setError] = useState<PackErrorCode | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [outbox, setOutbox] = useState<OutboxItem[]>([]);
  const [reportPlace, setReportPlace] = useState("");
  const [note, setNote] = useState("");
  const [observed, setObserved] = useState(() => localInputValue(new Date()));
  const [reportState, setReportState] = useState<"idle" | "queued" | "error">("idle");
  const completeRef = useRef<HTMLParagraphElement>(null);
  const deletedRef = useRef<HTMLParagraphElement>(null);
  const deleteRef = useRef<HTMLButtonElement>(null);
  const progressLabel = useId();
  const noteId = useId();
  const observedId = useId();
  const placeId = useId();

  const refresh = useCallback(async () => {
    const [stored, items] = await Promise.all([getPack(PACK_ID), listOutbox()]);
    setPack(stored);
    setOutbox(items);
    setLoaded(true);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!online) {
      setManifestState((current) => (current === "ready" ? current : "unavailable"));
      return;
    }
    let cancelled = false;
    setManifestState((current) => (current === "ready" ? current : "loading"));
    fetchManifest()
      .then((value) => {
        if (cancelled) return;
        setManifest(value);
        setManifestState("ready");
      })
      .catch(() => {
        if (!cancelled) setManifestState("unavailable");
      });
    return () => {
      cancelled = true;
    };
  }, [online]);

  useEffect(() => {
    if (phase === "complete") completeRef.current?.focus();
    if (phase === "deleted") deletedRef.current?.focus();
  }, [phase]);

  const shown = pack?.manifest ?? manifest;

  const onDownload = async () => {
    if (!manifest) return;
    setError(null);
    setPhase("downloading");
    setProgress({ received: 0, total: manifest.size_bytes });
    try {
      const next = await downloadPack(manifest, {
        nowIso: new Date().toISOString(),
        onProgress: (received, total) => setProgress({ received, total }),
      });
      await savePack(next);
      await refresh();
      setPhase("complete");
    } catch (caught) {
      setPhase("idle");
      setError(caught instanceof PackError ? caught.code : caught instanceof StorageError ? "content_invalid" : "network");
    }
  };

  const onDelete = async () => {
    await deletePack(PACK_ID);
    setConfirming(false);
    setProgress(null);
    await refresh();
    setPhase("deleted");
  };

  const onReport = async (event: FormEvent) => {
    event.preventDefault();
    const observedDate = new Date(observed);
    if (Number.isNaN(observedDate.getTime())) {
      setReportState("error");
      return;
    }
    try {
      await enqueueReport(note, reportPlace || null, new Date().toISOString(), {
        observedAt: observedDate.toISOString(),
        madeOffline: !online,
      });
      setNote("");
      setReportState("queued");
      setOutbox(await listOutbox());
    } catch {
      setReportState("error");
    }
  };

  const percent = progress && progress.total > 0 ? Math.round((progress.received / progress.total) * 100) : 0;
  const unknown = (value: string) => (value === "UNKNOWN" ? t("offline.unknown") : value);

  return (
    <div className="stack">
      <h1>{t("offline.title")}</h1>
      {!online ? (
        <p className="offline-banner" role="status">
          {t("offline.bannerOffline")}
        </p>
      ) : null}
      <p className="lead">{t("offline.lead")}</p>

      <section className="panel stack" aria-labelledby="pack-manifest">
        <h2 id="pack-manifest">{t("offline.manifestTitle")}</h2>
        {shown ? (
          <>
            <ul>
              <li>{t("offline.size", { size: kb(shown.size_bytes) })}</li>
              <li>{t("offline.built", { date: shown.built_at })}</li>
              <li>{t("offline.countPlaces", { count: shown.counts.places })}</li>
              <li>{t("offline.countHelp", { count: shown.counts.help_numbers })}</li>
              <li>{t("offline.countElevator", { count: shown.counts.elevator_status })}</li>
              <li>{t("offline.countJourneys", { count: shown.counts.journeys })}</li>
            </ul>
            <h3>{t("offline.sourcesTitle")}</h3>
            <ul>
              {shown.source_dates.map((item) => (
                <li key={item.source_name}>
                  {t("offline.sourceLine", { name: item.source_name, licence: unknown(item.licence), date: item.retrieved_at })}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p role="status">{manifestState === "loading" ? t("home.checking") : t("offline.manifestUnavailable")}</p>
        )}
        {!pack ? (
          <div className="stack">
            <div className="button-row">
              <Button onPress={() => void onDownload()} isDisabled={!online || !manifest || phase === "downloading"}>
                {t("offline.download")}
              </Button>
            </div>
            {!online ? <p>{t("offline.downloadOffline")}</p> : null}
          </div>
        ) : null}
        {progress && (phase === "downloading" || phase === "complete") ? (
          <div className="stack">
            <span id={progressLabel}>{t("offline.progressLabel")}</span>
            <progress aria-labelledby={progressLabel} max={progress.total} value={progress.received} />
            <p role="status">{t("offline.progress", { received: kb(progress.received), total: kb(progress.total), percent })}</p>
          </div>
        ) : null}
        {phase === "complete" && pack ? (
          <p role="status" tabIndex={-1} ref={completeRef} className="notice">
            {t("offline.complete", {
              places: pack.content.places.length,
              help: pack.content.help_numbers.length,
              elevator: pack.content.elevator_status.length,
              size: kb(pack.manifest.size_bytes),
            })}
          </p>
        ) : null}
        {error ? (
          <p role="alert" className="notice">
            {t(`offline.errors.${error}`)}
          </p>
        ) : null}
      </section>

      {loaded && !pack ? (
        <p role={phase === "deleted" ? "status" : undefined} tabIndex={-1} ref={deletedRef}>
          {phase === "deleted" ? `${t("offline.deleted")} ` : ""}
          {t("offline.empty")}
        </p>
      ) : null}

      {pack ? (
        <>
          <p>{t("offline.savedAt", { date: formatDate(pack.stored_at) })}</p>
          <section className="stack" aria-labelledby="pack-places">
            <h2 id="pack-places">{t("offline.placesTitle")}</h2>
            <ul className="record-list">
              {pack.content.places.map((place) => (
                <li key={place.id}>
                  <p>
                    <strong>{place.name}</strong>
                  </p>
                  <p>{t("offline.placeCategory", { value: unknown(place.category) })}</p>
                  <p>{t("offline.placeWheelchair", { value: unknown(place.wheelchair) })}</p>
                  <p>{t("offline.placeAddress", { value: unknown(place.address) })}</p>
                  <p>
                    {t("offline.placeSource", {
                      name: place.provenance.source_name,
                      licence: place.provenance.licence,
                      date: place.provenance.retrieved_at,
                      tier: String(place.provenance.tier),
                    })}{" "}
                    {t(tierMessageKey(place.provenance.tier))}
                  </p>
                </li>
              ))}
            </ul>
            <p>{t("offline.osmCredit")}</p>
          </section>

          <section className="stack" aria-labelledby="pack-journey">
            <h2 id="pack-journey">{t("offline.journeyTitle")}</h2>
            <p>{t("offline.journeyNone")}</p>
          </section>

          <section className="stack" aria-labelledby="pack-help">
            <h2 id="pack-help">{t("offline.helpTitle")}</h2>
            <ul className="record-list">
              {pack.content.help_numbers.map((item) => (
                <li key={item.id}>
                  <p>
                    <strong>{item.name[language]}</strong>{" "}
                    <a className="text-link" href={`tel:${item.contact.replace(/[^0-9]/g, "")}`}>
                      {item.contact}
                    </a>
                  </p>
                  <p>{item.how[language]}</p>
                  <p>
                    {t("offline.helpSource", { date: item.provenance.retrieved_at })} {t(tierMessageKey(item.provenance.tier))}
                  </p>
                </li>
              ))}
            </ul>
          </section>

          <section className="stack" aria-labelledby="pack-elevators">
            <h2 id="pack-elevators">{t("offline.elevatorTitle")}</h2>
            <p>{t("offline.elevatorLead")}</p>
            <ul className="record-list">
              {pack.content.elevator_status.map((item) => (
                <li key={item.id}>
                  <p>
                    <strong>{t("offline.elevatorItem", { station: unknown(item.station), date: formatDate(item.checked_at) })}</strong>
                  </p>
                  <p lang={item.operator_text_language}>{item.operator_text}</p>
                  <p>{t("offline.elevatorSource", { name: item.source_name, licence: item.licence, date: item.retrieved_at })}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel stack" aria-labelledby="pack-report">
            <h2 id="pack-report">{t("offline.reportTitle")}</h2>
            <form className="stack" onSubmit={(event) => void onReport(event)}>
              <div className="field">
                <label htmlFor={placeId}>{t("offline.reportPlace")}</label>
                <select id={placeId} value={reportPlace} onChange={(event) => setReportPlace(event.target.value)}>
                  <option value="">{t("offline.reportNoPlace")}</option>
                  {pack.content.places.map((place) => (
                    <option key={place.id} value={place.id}>
                      {place.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor={noteId}>{t("offline.reportNote")}</label>
                <textarea id={noteId} value={note} maxLength={500} rows={3} onChange={(event) => setNote(event.target.value)} />
              </div>
              <div className="field">
                <label htmlFor={observedId}>{t("offline.reportObserved")}</label>
                <input id={observedId} type="datetime-local" value={observed} onChange={(event) => setObserved(event.target.value)} />
              </div>
              <div className="button-row">
                <Button type="submit">{t("offline.reportSubmit")}</Button>
              </div>
              {reportState === "queued" ? <p role="status">{t("offline.reportQueued")}</p> : null}
              {reportState === "error" ? <p role="alert">{t("offline.reportError")}</p> : null}
            </form>
            <h3>{t("offline.reportList")}</h3>
            {outbox.length === 0 ? (
              <p>{t("offline.reportNone")}</p>
            ) : (
              <ul className="record-list">
                {outbox.map((item) => (
                  <li key={item.id}>
                    <p>{item.note}</p>
                    <p>
                      {t(item.made_offline ? "offline.reportItemOffline" : "offline.reportItem", {
                        date: formatDate(item.observed_at ?? item.created_at),
                      })}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <div className="button-row">
            <Button ref={deleteRef} variant="secondary" onPress={() => setConfirming(true)}>
              {t("offline.delete")}
            </Button>
          </div>
        </>
      ) : null}

      {confirming ? (
        <ConfirmDialog
          title={t("offline.deleteTitle")}
          body={t("offline.deleteBody")}
          confirmLabel={t("offline.deleteConfirm")}
          cancelLabel={t("offline.deleteCancel")}
          onCancel={() => {
            setConfirming(false);
            window.requestAnimationFrame(() => deleteRef.current?.focus());
          }}
          onConfirm={() => void onDelete()}
        />
      ) : null}
    </div>
  );
}
