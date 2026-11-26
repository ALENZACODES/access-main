import { useEffect, useRef, useState, type CSSProperties, type ChangeEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { entryForField, fieldCopy, recordField, type FieldResult } from "./observedField";
import { copy } from "./catalog";
import { ConfirmDialog } from "../design/ConfirmDialog.tsx";
import { conflictMessage, deletionMessage, draftHasEdits, transitionPrompt, type EditorAction } from "./editorTransitions";
import { contextualName } from "../input/index.ts";
import { contributions, deleteDraft } from "../../../../packages/contribute/src/store";
import { assertDraft, licences, makeDraft, validateDraft, type Draft, type Licence } from "../../../../packages/contribute/src/schema";
import { DraftConflictError } from "../../../../packages/contribute/src/draftComparison";
import { importDraftsWithPhotos } from "../../../../packages/contribute/src/draftPhotos";
import { photoCopy, useDraftPhotos } from "./useDraftPhotos";
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
  const navigate = useNavigate();
  const { i18n } = useTranslation();
  const locale = i18n.resolvedLanguage?.startsWith("fr") ? "fr" : "en";
  const t = copy[locale];
  const [draft, setDraft] = useState<Draft>(() => makeDraft());
  const [baseline, setBaseline] = useState(draft);
  const [persisted, setPersisted] = useState(false);
  const [pendingAction, setPendingAction] = useState<{ action: EditorAction; dirty: boolean } | null>(null);
  const [writing, setWriting] = useState(false);
  const [importing, setImporting] = useState(false);
  const [nextFocus, setNextFocus] = useState<"kind" | "list" | "import" | null>(null);
  const importControl = useRef<HTMLInputElement>(null);
  const kindControl = useRef<HTMLSelectElement>(null);
  const listHeading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (!nextFocus || importing) return;
    const control = { kind: kindControl, list: listHeading, import: importControl }[nextFocus];
    control.current?.focus();
    setNextFocus(null);
  }, [nextFocus, importing]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [field, setField] = useState("");
  const [value, setValue] = useState("");
  const [unit, setUnit] = useState("");
  const [unknown, setUnknown] = useState(false);
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<Extract<FieldResult, { ok: false }> | null>(null);
  const fieldControl = useRef<HTMLInputElement>(null);
  const valueControl = useRef<HTMLInputElement>(null);
  const unitControl = useRef<HTMLInputElement>(null);
  const labels = fieldCopy[locale];
  const fieldPending = Boolean(field || value || unit || unknown || editingKey !== null);
  const [licence, setLicence] = useState<Licence>("CC BY 4.0");
  const [status, setStatus] = useState("");
  const photoSession = useDraftPhotos(draft, setDraft, locale, setStatus);
  const refresh = async () => {
    const rows = await contributions.drafts.toArray();
    setDrafts(rows);
    return rows;
  };
  useEffect(() => { void refresh().catch((e: unknown) => setStatus(safeError(e))); }, []);
  const update = (changes: Partial<Draft>) => setDraft((previous) => ({ ...previous, ...changes }));
  const run = async (operation: () => Promise<void>, success?: string) => {
    try { await operation(); if (success) setStatus(success); }
    catch (error) { setStatus(`${t.error}: ${safeError(error)}`); }
  };
  const resetFieldEntry = () => {
    setEditingKey(null);
    setField("");
    setValue("");
    setUnit("");
    setUnknown(false);
    setFieldError(null);
  };
  const addField = () => {
    const result = recordField(draft.changes, { field, value, unit, unknown }, editingKey);
    if (!result.ok) {
      setFieldError(result);
      const control = { field: fieldControl, value: valueControl, unit: unitControl }[result.control];
      control.current?.focus();
      return;
    }
    update({ changes: result.changes });
    resetFieldEntry();
    setStatus(contextualName(locale, labels.recorded, [result.key]));
    fieldControl.current?.focus();
  };
  const editField = (key: string) => {
    const change = draft.changes[key];
    if (!change) return;
    const entry = entryForField(key, change);
    setEditingKey(key);
    setField(entry.field);
    setValue(entry.value);
    setUnit(entry.unit);
    setUnknown(entry.unknown);
    setFieldError(null);
    setStatus("");
    fieldControl.current?.focus();
  };
  const removeField = (key: string) => {
    const changes = { ...draft.changes };
    delete changes[key];
    update({ changes });
    if (editingKey === key) resetFieldEntry();
    setStatus(contextualName(locale, labels.removed, [key]));
    fieldControl.current?.focus();
  };
  const errorAttributes = (control: "field" | "value" | "unit") => fieldError?.control === control
    ? { "aria-invalid": true as const, "aria-describedby": "observed-field-error" }
    : {};
  const dirty = draftHasEdits(baseline, draft) || fieldPending || photoSession.processing;
  const prompt = pendingAction && transitionPrompt(pendingAction.action, draft.id, pendingAction.dirty, locale);
  const replaceEditor = (next: Draft, exists: boolean) => {
    photoSession.reset();
    resetFieldEntry();
    setLicence("CC BY 4.0");
    setDraft(next);
    setBaseline(next);
    setPersisted(exists);
    setStatus("");
    setNextFocus("kind");
  };
  const perform = (action: EditorAction) => {
    setPendingAction(null);
    if (action.type === "import") {
      setImporting(true);
      void run(async () => {
        const saved = await importDraftsWithPhotos(action.items);
        const active = saved.find(item => item.id === draft.id);
        if (active) replaceEditor(active, true);
        else setNextFocus("import");
        await refresh();
      }, t.statusImported).finally(() => setImporting(false));
      return;
    }
    if (action.type === "mapping") {
      photoSession.reset();
      void navigate("/contribute/event");
      return;
    }
    if (action.type === "new" || action.type === "edit") {
      replaceEditor(action.type === "new" ? makeDraft() : action.item, action.type === "edit");
      return;
    }

    setWriting(true);
    void run(async () => {
      try {
        await deleteDraft(action.item.id, action.item);
      } catch (error) {
        if (!(error instanceof DraftConflictError)) throw error;
        await refresh();
        setStatus(locale === "fr"
          ? "La liste des brouillons a changé. Vérifiez sa version à jour avant de supprimer un brouillon."
          : "Local drafts changed. Review the updated list before deleting a draft.");
        setNextFocus("list");
        return;
      }
      if (action.item.id === draft.id) replaceEditor(makeDraft(), false);
      else setNextFocus("list");
      await refresh();
      setStatus(deletionMessage(locale));
    }).finally(() => setWriting(false));
  };
  const request = (action: EditorAction) => {
    if (writing || importing) return;
    if (transitionPrompt(action, draft.id, dirty, locale)) setPendingAction({ action, dirty });
    else perform(action);
  };
  const save = () => {
    setWriting(true);
    return run(async () => {
      try {
        await photoSession.save(draft, persisted ? baseline : null);
      } catch (error) {
        if (!(error instanceof DraftConflictError)) throw error;
        const rows = await refresh();
        setStatus(conflictMessage(locale, rows.some(item => item.id === draft.id)));
        return;
      }
      setBaseline(draft);
      setPersisted(true);
      await refresh();
      setStatus(t.statusSaved);
    }).finally(() => setWriting(false));
  };
  const onPhotos = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.value = "";
    void photoSession.add(selected, licence);
  };
  const exportDraft = () => run(async () => {
    assertDraft(draft);
    const blob = await exportZip([draft], photoSession.read);
    download(blob, "contributions.zip");
  });
  const importFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file || writing || importing) return;
    setImporting(true);
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error(t.validation);
      const items = parseImport(JSON.parse(await file.text()) as unknown);
      setImporting(false);
      request({ type: "import", items });
    } catch (error) {
      setImporting(false);
      setStatus(`${t.error}: ${safeError(error)}`);
      setNextFocus("import");
    }
  };
  return <div style={{ maxWidth: 840, minWidth: 0, margin: "auto", padding: "1rem", overflowWrap: "anywhere" }}>
    <h1>{t.heading}</h1><p>{t.intro}</p><p>{t.privacy}</p><p>{t.localOnly}</p>
    <fieldset disabled={importing} style={{ margin: 0, padding: 0, border: 0, minWidth: 0 }}>
      <legend>{locale === "fr" ? "Brouillon en cours" : "Current draft"}</legend>
    <section style={sectionStyle} aria-label={t.kind}>
      <label style={lineStyle}>{t.kind}<select ref={kindControl} style={inputStyle} value={draft.kind} onChange={(e) => update({ kind: e.target.value as Draft["kind"], target: e.target.value === "new-place" ? "new place" : "" })}>
        <option value="new-place">{t.newPlace}</option><option value="correction">{t.correction}</option><option value="audit">{t.audit}</option>
      </select></label>
      {draft.kind !== "new-place" && <label style={lineStyle}>{t.target}<input style={inputStyle} value={draft.target} onChange={(e) => update({ target: e.target.value })} /></label>}
      <label style={lineStyle}>{t.date}<input style={inputStyle} type="date" max={new Date().toISOString().slice(0, 10)} value={draft.observed} onChange={(e) => update({ observed: e.target.value })} /></label>
      <label style={lineStyle}>{t.event}<input style={inputStyle} value={draft.event ?? ""} onChange={(e) => update({ event: e.target.value || undefined })} /></label>
    </section>
    <section style={sectionStyle} aria-label={t.changes}>
      <h2>{t.changes}</h2>
      {editingKey !== null && <p>{contextualName(locale, labels.editing, [editingKey])}</p>}
      <label style={lineStyle}>{t.field}
        <input ref={fieldControl} style={inputStyle} value={field} placeholder="entrance_width_cm"
          {...errorAttributes("field")} onChange={(e) => { setField(e.target.value); setFieldError(null); }} />
      </label>
      <label style={lineStyle}>{t.value}
        <input ref={valueControl} style={inputStyle} disabled={unknown} value={value}
          {...errorAttributes("value")} onChange={(e) => { setValue(e.target.value); setFieldError(null); }} />
      </label>
      <label style={lineStyle}><input type="checkbox" checked={unknown}
        onChange={(e) => { setUnknown(e.target.checked); setFieldError(null); }} />{t.unknown}</label>
      <label style={lineStyle}>{t.unit}
        <input ref={unitControl} style={inputStyle} value={unit}
          {...errorAttributes("unit")} onChange={(e) => { setUnit(e.target.value); setFieldError(null); }} />
      </label>
      {fieldError && <p id="observed-field-error" aria-live="polite">{labels[fieldError.issue]}</p>}
      {fieldPending && <p>{labels.pending}</p>}
      <button style={focusStyle} type="button" onClick={addField}>{editingKey === null ? t.addField : labels.apply}</button>
      {fieldPending && <button style={focusStyle} type="button" onClick={() => {
        resetFieldEntry(); fieldControl.current?.focus();
      }}>{labels.cancel}</button>}
      <ul>{Object.entries(draft.changes).map(([key, change]) => <li key={key}>
        {key}: {String(change.value)} {change.unit ?? ""}{" "}
        <button style={focusStyle} type="button" disabled={fieldPending} onClick={() => editField(key)}>
          {t.edit} {key}
        </button>{" "}
        <button style={focusStyle} type="button" onClick={() => removeField(key)}>{t.remove} {key}</button>
      </li>)}</ul>
    </section>
    <label style={lineStyle}>{t.note}<textarea style={inputStyle} rows={4} value={draft.note} onChange={(e) => update({ note: e.target.value })} /></label>
    <section style={sectionStyle} aria-label={t.photos}>
      <h2>{t.photos}</h2><p>{t.privacy}</p><p>{t.fileLimit}</p>
      <label style={lineStyle}>{t.licence}<select style={inputStyle} value={licence} onChange={(e) => setLicence(e.target.value as Licence)}>
        {licences.map((item) => <option key={item} value={item}>{item}</option>)}
      </select></label>
      <label style={lineStyle}>{t.addPhotos}<input style={inputStyle} type="file" accept="image/*" multiple disabled={photoSession.processing} onChange={onPhotos} /></label>
      <p>{photoCopy[locale].count}: {draft.photos.length}</p>
      <ul>{draft.photos.map((photo) => <li key={photo.id}>{photo.name} — {photo.licence} <button style={focusStyle} type="button" onClick={() => photoSession.remove(photo.id)} aria-label={contextualName(locale, t.remove, [t.photoItem, photo.name])}>{t.remove}</button></li>)}</ul>
    </section>
    <p>{t.tier}</p>
    <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
      <button style={focusStyle} type="button" disabled={writing || photoSession.processing || fieldPending || !validateDraft(draft)} onClick={() => void save()}>{t.save}</button>
      <button style={focusStyle} type="button" disabled={writing} onClick={() => request({ type: "new" })}>{t.newDraft}</button>
      <button style={focusStyle} type="button" disabled={photoSession.processing || fieldPending || !validateDraft(draft)} onClick={() => void exportDraft()}>{t.download}</button>
      <button style={focusStyle} type="button" disabled={photoSession.processing || fieldPending || !validateDraft(draft)} onClick={() => saveText(draft, "contribution.json")}>{t.exportJson}</button>
      <button style={focusStyle} type="button" disabled={photoSession.processing || fieldPending || !validateDraft(draft)} onClick={() => saveText(toGeoJSON([draft]), "contribution.geojson", "application/geo+json")}>{t.exportGeo}</button>
      <button style={focusStyle} type="button" disabled={photoSession.processing || fieldPending || !validateDraft(draft)} onClick={() => void run(async () => navigator.clipboard.writeText(JSON.stringify(draft, null, 2)), t.statusCopied)}>{t.copy}</button>
    </div>
    <p role="status" aria-live="polite">{status}</p>
    <section style={sectionStyle} aria-label={t.draftList}>
      <h2 ref={listHeading} tabIndex={-1}>{t.draftList}</h2>
      <label style={lineStyle}>{t.import}<input ref={importControl} disabled={writing} style={inputStyle} type="file" accept=".json,.geojson,application/json,application/geo+json" onChange={(e) => void importFile(e)} /></label>
      <p>{t.replace}</p>
      {drafts.length === 0 && <p>{t.empty}</p>}
      {/* Numbered, and each Edit and Delete is named for its row, so screen-reader and voice users can tell the rows apart. */}
      <ol>{drafts.map((item, index) => {
        const row = [t.draftItem.replace("{n}", String(index + 1)), item.target, item.observed, item.event];
        return <li key={item.id}>
        {item.target} — {item.observed}{item.event ? ` — ${item.event}` : ""}
        <button style={focusStyle} type="button" aria-label={contextualName(locale, t.edit, row)} disabled={writing} onClick={() => request({ type: "edit", item })}>{t.edit}</button>
        <button style={focusStyle} type="button" aria-label={contextualName(locale, t.remove, row)} disabled={writing} onClick={() => request({ type: "delete", item })}>{t.remove}</button>
      </li>;
      })}</ol>
    </section>
    </fieldset>
    {prompt && pendingAction && <ConfirmDialog
      title={prompt.title}
      body={prompt.body}
      cancelLabel={prompt.cancel}
      confirmLabel={prompt.confirm}
      onCancel={() => {
        if (pendingAction.action.type === "import") setNextFocus("import");
        setPendingAction(null);
      }}
      onConfirm={() => perform(pendingAction.action)}
    />}
    <Link to="/contribute/event" style={focusStyle} onClick={(event) => {
      if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      request({ type: "mapping" });
    }}>{t.eventTitle}</Link>
  </div>;
}
