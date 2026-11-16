import { useEffect, useState, type CSSProperties, type ChangeEvent } from "react";
import { useTranslation } from "react-i18next";
import { copy } from "./catalog";
import { contextualName } from "../input/index.ts";
import { contributions, deleteDraft } from "../../../../packages/contribute/src/store";
import { assertDraft, licences, makeDraft, validateDraft, type Draft, type Licence } from "../../../../packages/contribute/src/schema";
import { sanitisePhoto } from "../../../../packages/contribute/src/photos";
import { download, exportZip, parseImport, toGeoJSON } from "../../../../packages/contribute/src/export";

const focusStyle: CSSProperties = { minHeight: 44, padding: "0.6rem", fontSize: "1rem" };
const inputStyle: CSSProperties = { ...focusStyle, width: "100%", maxWidth: 600, boxSizing: "border-box" };
const sectionStyle: CSSProperties = { display: "grid", gap: "0.75rem", marginBlock: "1.5rem" };
const lineStyle: CSSProperties = { display: "grid", gap: "0.3rem", maxWidth: 650 };
function saveText(value: unknown, filename: string, type = "application/json"): void {
  download(new Blob([JSON.stringify(value, null, 2)], { type }), filename);
}
function safeError(error: unknown): string { return error instanceof Error ? error.message : String(error); }

export function ContributePage() {
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("fr") ? "fr" : "en";
  const t = copy[locale];
  const [draft, setDraft] = useState<Draft>(() => makeDraft());
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [licence, setLicence] = useState<Licence>("CC BY 4.0");
  const [status, setStatus] = useState("");
  const [eventName, setEventName] = useState("");
  const isEvent = typeof window !== "undefined" && /\/contribute\/event\/?$/.test(window.location.pathname);
  const refresh = async () => setDrafts(await contributions.drafts.toArray());
  useEffect(() => { void refresh().catch((e: unknown) => setStatus(safeError(e))); }, []);
  const update = (changes: Partial<Draft>) => setDraft((previous) => ({ ...previous, ...changes }));
  const run = async (operation: () => Promise<void>, success?: string) => {
    try { await operation(); if (success) setStatus(success); }
    catch (error) { setStatus(`${t.error}: ${safeError(error)}`); }
  };
  const addField = () => {
    const key = field.trim().toLowerCase();
    if (!/^[a-z][a-z0-9_]{0,79}$/.test(key)) { setStatus(t.validation); return; }
    const parsed = !unknown && value.trim() !== "" && Number.isFinite(Number(value)) ? Number(value) : value.trim();
    update({ changes: { ...draft.changes, [key]: { value: unknown ? "UNKNOWN" : parsed, ...(unit.trim() ? { unit: unit.trim() } : {}) } } });
    setField(""); setValue(""); setUnit(""); setUnknown(false); setStatus("");
  };
  const save = () => run(async () => {
    assertDraft(draft);
    await contributions.drafts.put(draft);
    await refresh();
  }, t.statusSaved);
  const onPhotos = (event: ChangeEvent<HTMLInputElement>) => run(async () => {
    const selected = Array.from(event.target.files ?? []);
    if (draft.photos.length + selected.length > 20) throw new Error(t.fileLimit);
    const prepared: Array<{ id: string; name: string; data: Blob }> = [];
    for (const file of selected) prepared.push({ id: crypto.randomUUID(), name: file.name, data: await sanitisePhoto(file) });
    const next = { ...draft, photos: [...draft.photos, ...prepared.map((p) => ({ id: p.id, name: p.name.slice(0, 200), licence, mime: "image/jpeg" as const }))] };
    // Commit the sanitized bytes and draft atomically, so exports never use raw photos.
    await contributions.transaction("rw", contributions.photos, contributions.drafts, async () => {
      for (const photo of prepared) await contributions.photos.put({ id: photo.id, draftId: draft.id, data: photo.data });
      if (validateDraft(next)) await contributions.drafts.put(next);
    });
    setDraft(next);
    await refresh();
    event.target.value = "";
  }, t.statusSaved);
  const selectedDrafts = isEvent ? drafts.filter((d) => d.event === eventName.trim()) : [draft];
  const exportSelected = () => run(async () => {
    if (!selectedDrafts.length) throw new Error(t.empty);
    selectedDrafts.forEach(assertDraft);
    const blob = await exportZip(selectedDrafts, async (id) => (await contributions.photos.get(id))?.data);
    download(blob, "contributions.zip");
  });
  const importFile = (event: ChangeEvent<HTMLInputElement>) => run(async () => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) throw new Error(t.validation);
    const imported = parseImport(JSON.parse(await file.text()) as unknown);
    // Imported references cannot acquire unseen photo bytes. Discard references to absent files.
    const fixed: Draft[] = [];
    for (const item of imported) {
      const photos = [];
      for (const photo of item.photos) {
        if (await contributions.photos.get(photo.id)) photos.push(photo);
      }
      fixed.push({ ...item, photos });
    }
    await contributions.drafts.bulkPut(fixed);
    await refresh();
    event.target.value = "";
  }, t.statusImported);
  if (isEvent) return <div style={{ maxWidth: 840, margin: "auto", padding: "1rem" }}>
    <h1>{t.eventTitle}</h1><a href="../contribute" style={focusStyle}>{t.eventBack}</a>
    <p>{t.intro}</p>
    <label style={lineStyle}>{t.eventName}<input style={inputStyle} value={eventName} onChange={(e) => setEventName(e.target.value)} /></label>
    <p aria-live="polite">{t.ready}: {drafts.filter((d) => d.event === eventName.trim() && validateDraft(d)).length}</p>
    <button style={focusStyle} type="button" disabled={!eventName.trim() || selectedDrafts.length === 0} onClick={() => void exportSelected()}>{t.exportEvent}</button>
    <p role="status">{status}</p>
  </div>;
  return <div style={{ maxWidth: 840, margin: "auto", padding: "1rem" }}>
    <h1>{t.heading}</h1><p>{t.intro}</p><p>{t.privacy}</p><p>{t.localOnly}</p>
    <section style={sectionStyle} aria-label={t.kind}>
      <label style={lineStyle}>{t.kind}<select style={inputStyle} value={draft.kind} onChange={(e) => update({ kind: e.target.value as Draft["kind"], target: e.target.value === "new-place" ? "new place" : "" })}>
        <option value="new-place">{t.newPlace}</option><option value="correction">{t.correction}</option><option value="audit">{t.audit}</option>
      </select></label>
      {draft.kind !== "new-place" && <label style={lineStyle}>{t.target}<input style={inputStyle} value={draft.target} onChange={(e) => update({ target: e.target.value })} /></label>}
      <label style={lineStyle}>{t.date}<input style={inputStyle} type="date" max={new Date().toISOString().slice(0, 10)} value={draft.observed} onChange={(e) => update({ observed: e.target.value })} /></label>
      <label style={lineStyle}>{t.event}<input style={inputStyle} value={draft.event ?? ""} onChange={(e) => update({ event: e.target.value || undefined })} /></label>
    </section>
    <section style={sectionStyle} aria-label={t.changes}>
      <h2>{t.changes}</h2>
      <label style={lineStyle}>{t.field}<input style={inputStyle} value={field} onChange={(e) => setField(e.target.value)} placeholder="entrance_width_cm" /></label>
      <label style={lineStyle}>{t.value}<input style={inputStyle} disabled={unknown} value={value} onChange={(e) => setValue(e.target.value)} /></label>
      <label style={lineStyle}><input type="checkbox" checked={unknown} onChange={(e) => setUnknown(e.target.checked)} />{t.unknown}</label>
      <label style={lineStyle}>{t.unit}<input style={inputStyle} value={unit} onChange={(e) => setUnit(e.target.value)} /></label>
      <button style={focusStyle} type="button" onClick={addField}>{t.addField}</button>
      <ul>{Object.entries(draft.changes).map(([key, change]) => <li key={key}>
        {key}: {String(change.value)} {change.unit ?? ""} <button style={focusStyle} type="button" onClick={() => {
          const changes = { ...draft.changes }; delete changes[key]; update({ changes });
        }}>{t.remove} {key}</button>
      </li>)}</ul>
    </section>
    <label style={lineStyle}>{t.note}<textarea style={inputStyle} rows={4} value={draft.note} onChange={(e) => update({ note: e.target.value })} /></label>
    <section style={sectionStyle} aria-label={t.photos}>
      <h2>{t.photos}</h2><p>{t.privacy}</p><p>{t.fileLimit}</p>
      <label style={lineStyle}>{t.licence}<select style={inputStyle} value={licence} onChange={(e) => setLicence(e.target.value as Licence)}>
        {licences.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <label style={lineStyle}>{t.addPhotos}<input style={inputStyle} type="file" accept="image/*" multiple onChange={(e) => void onPhotos(e)} /></label>
      <p>{t.photoCount}: {draft.photos.length}</p>
      <ul>{draft.photos.map((photo) => <li key={photo.id}>{photo.name} — {photo.licence} <button style={focusStyle} type="button" onClick={() => void run(async () => {
        await contributions.photos.delete(photo.id);
        const next = { ...draft, photos: draft.photos.filter((p) => p.id !== photo.id) };
        update(next); if (validateDraft(next)) await contributions.drafts.put(next);
      })} aria-label={contextualName(locale, t.remove, [t.photoItem, photo.name])}>{t.remove}</button></li>)}</ul>
    </section>
    <p>{t.tier}</p>
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <button style={focusStyle} type="button" disabled={!validateDraft(draft)} onClick={() => void save()}>{t.save}</button>
      <button style={focusStyle} type="button" onClick={() => { setDraft(makeDraft()); setStatus(""); }}>{t.newDraft}</button>
      <button style={focusStyle} type="button" disabled={!validateDraft(draft)} onClick={() => void exportSelected()}>{t.download}</button>
      <button style={focusStyle} type="button" disabled={!validateDraft(draft)} onClick={() => saveText(draft, "contribution.json")}>{t.exportJson}</button>
      <button style={focusStyle} type="button" disabled={!validateDraft(draft)} onClick={() => saveText(toGeoJSON([draft]), "contribution.geojson", "application/geo+json")}>{t.exportGeo}</button>
      <button style={focusStyle} type="button" disabled={!validateDraft(draft)} onClick={() => void run(async () => navigator.clipboard.writeText(JSON.stringify(draft, null, 2)), t.statusCopied)}>{t.copy}</button>
    </div>
    <p role="status" aria-live="polite">{status}</p>
    <section style={sectionStyle} aria-label={t.draftList}>
      <h2>{t.draftList}</h2>
      <label style={lineStyle}>{t.import}<input style={inputStyle} type="file" accept=".json,.geojson,application/json,application/geo+json" onChange={(e) => void importFile(e)} /></label>
      <p>{t.replace}</p>
      {drafts.length === 0 && <p>{t.empty}</p>}
      {/* Numbered, and each Edit and Delete is named for its row, so screen-reader and voice users can tell the rows apart. */}
      <ol>{drafts.map((item, index) => {
        const row = [t.draftItem.replace("{n}", String(index + 1)), item.target, item.observed, item.event];
        return <li key={item.id}>
        {item.target} — {item.observed}{item.event ? ` — ${item.event}` : ""}
        <button style={focusStyle} type="button" aria-label={contextualName(locale, t.edit, row)} onClick={() => setDraft(item)}>{t.edit}</button>
        <button style={focusStyle} type="button" aria-label={contextualName(locale, t.remove, row)} onClick={() => { if (window.confirm(t.removeConfirm)) void run(async () => { await deleteDraft(item.id); await refresh(); }); }}>{t.remove}</button>
      </li>;
      })}</ol>
    </section>
    <a href="contribute/event" style={focusStyle}>{t.eventTitle}</a>
  </div>;
}
