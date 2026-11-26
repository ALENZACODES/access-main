import { liveQuery } from "dexie";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { download } from "../../../../packages/contribute/src/export";
import { EventReviewError, exportEventSelection, groupEventDrafts, matchesReview } from "../../../../packages/contribute/src/eventReview";
import type { Change, Draft } from "../../../../packages/contribute/src/schema";
import { contributions } from "../../../../packages/contribute/src/store";
import { useDocumentTitle } from "../shell/useDocumentTitle";
import { copy } from "./catalog";
import { mappingDayCopy } from "./mappingDayCopy";

type Locale = keyof typeof mappingDayCopy;
type ExportStatus = "reading" | "complete" | "changed" | "photo" | "failed";
type ReviewLoad = { state: "ready"; groups: Map<string, Draft[]> } | { state: "loading" | "failed" };

function changeText(change: Change, locale: Locale): string {
  const t = mappingDayCopy[locale];
  if (change.value === "UNKNOWN") return t.unknown;
  if (change.value === "") return t.blank;
  const value = typeof change.value === "boolean" ? (change.value ? t.yes : t.no) : String(change.value);
  return change.unit ? `${value} ${change.unit}` : value;
}

function EventDrafts({ name, drafts, locale }: { name: string; drafts: Draft[]; locale: Locale }) {
  const t = mappingDayCopy[locale];
  const main = copy[locale];
  const [picked, setPicked] = useState(() => new Map<string, Draft>());
  const [status, setStatus] = useState<ExportStatus | null>(null);
  const selected = drafts.filter(draft => matchesReview(draft, picked.get(draft.id)));
  const exporting = status === "reading";
  const active = useRef(false);

  useEffect(() => {
    active.current = true;
    return () => { active.current = false; };
  }, []);

  function select(draft: Draft, checked: boolean) {
    setPicked(previous => {
      const next = new Map(previous);
      if (checked) next.set(draft.id, draft);
      else next.delete(draft.id);
      return next;
    });
    setStatus(null);
  }

  async function exportSelection() {
    setStatus("reading");
    try {
      const blob = await exportEventSelection(name, selected);
      if (!active.current) return;
      download(blob, "contributions.zip");
      setStatus("complete");
    } catch (error) {
      if (!active.current) return;
      const reason = error instanceof EventReviewError ? error.reason : "failed";
      if (reason === "changed") setPicked(new Map());
      setStatus(reason);
    }
  }

  return <section className="panel stack" aria-labelledby="event-review-heading">
    <h2 id="event-review-heading">{t.review} — {name}</h2>
    <div className="actions">
      <button type="button" disabled={exporting || selected.length === drafts.length} onClick={() => {
        setPicked(new Map(drafts.map(draft => [draft.id, draft])));
        setStatus(null);
      }}>{t.selectAll}</button>
      <button type="button" disabled={exporting || !selected.length} onClick={() => {
        setPicked(new Map());
        setStatus(null);
      }}>{t.clear}</button>
    </div>
    <ol>
      {drafts.map((draft, index) => {
        const kind = draft.kind === "new-place" ? main.newPlace : draft.kind === "audit" ? main.audit : main.correction;
        const label = main.draftItem.replace("{n}", String(index + 1));
        const place = draft.kind === "new-place" ? kind : draft.target;
        return <li key={draft.id}>
          <label style={{ display: "flex", alignItems: "center", minHeight: 44, gap: "0.5rem" }}>
            <input type="checkbox" disabled={exporting} checked={matchesReview(draft, picked.get(draft.id))}
              onChange={event => select(draft, event.currentTarget.checked)} />
            <span>{label} — {place} — <time dateTime={draft.observed}>{draft.observed}</time></span>
          </label>
          <details>
            <summary style={{ minHeight: 44 }}>{t.details} — {label}</summary>
            <p>{main.kind} — {kind}</p>
            <dl>{Object.entries(draft.changes).map(([key, change]) =>
              <div key={key}><dt>{key}</dt><dd>{changeText(change, locale)}</dd></div>
            )}</dl>
            {draft.note && <p>{draft.note}</p>}
            {draft.photos.length > 0 && <ul aria-label={main.photos}>
              {draft.photos.map((photo, index) => <li key={index}>{photo.name} — {photo.licence}</li>)}
            </ul>}
          </details>
        </li>;
      })}
    </ol>
    <p>{main.privacy}</p>
    <p role="status">{t.selected(selected.length, drafts.length)}{status && ` · ${t[status]}`}</p>
    <button type="button" disabled={exporting || !selected.length} onClick={() => void exportSelection()}>
      {main.exportEvent}
    </button>
  </section>;
}

export function MappingDayPage() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("fr") ? "fr" : "en";
  const t = mappingDayCopy[locale];
  const main = copy[locale];
  const [load, setLoad] = useState<ReviewLoad>({ state: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [eventName, setEventName] = useState("");
  useDocumentTitle(main.eventTitle);

  useEffect(() => {
    const subscription = liveQuery(() => contributions.drafts.toArray()).subscribe({
      next: rows => setLoad({ state: "ready", groups: groupEventDrafts(rows) }),
      error: () => setLoad({ state: "failed" }),
    });
    return () => subscription.unsubscribe();
  }, [attempt]);
  const names = useMemo(() => load.state === "ready"
    ? Array.from(load.groups.keys()).sort((a, b) => a.localeCompare(b, locale))
    : [], [load, locale]);
  const drafts = load.state === "ready" ? load.groups.get(eventName) : undefined;

  return <div className="stack" style={{ minWidth: 0, overflowWrap: "anywhere" }}>
    <h1>{main.eventTitle}</h1>
    <Link to="/contribute">{main.eventBack}</Link>
    {load.state === "loading" && <p role="status">{t.loading}</p>}
    {load.state === "failed" && <div className="panel stack">
      <p role="status">{t.unavailable}</p>
      <button type="button" onClick={() => {
        setLoad({ state: "loading" });
        setAttempt(n => n + 1);
      }}>{t.retry}</button>
    </div>}
    {load.state === "ready" && !names.length && <p>{t.empty}</p>}
    {names.length > 0 && <>
      <p>{t.intro}</p>
      <label>{main.eventName}
        <select style={{ display: "block", width: "100%", minHeight: 44 }} value={drafts ? eventName : ""}
          onChange={event => setEventName(event.currentTarget.value)}>
          <option value="">{t.choose}</option>
          {names.map(name => <option key={name} value={name}>{name === name.trim() ? name : `“${name}”`}</option>)}
        </select>
      </label>
    </>}
    {drafts && <EventDrafts key={eventName} name={eventName} drafts={drafts} locale={locale} />}
  </div>;
}
