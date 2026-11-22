import { useEffect, useId, useRef, useState } from "react";
import { saveTextFile } from "../../states/downloadFile";
import { cardCopy, type CardCopy } from "./copy";
import { CardDeckError, displayText, type CardDeck, type CardLanguage } from "./model";
import { applyDeckImport, encodeDeck, exportDeckText, MAX_BACKUP_BYTES, previewDeckImport, type DeckImportPreview } from "./transfer";

interface Props {
  deck: CardDeck;
  language: CardLanguage;
  draftPending: boolean;
  onReplace: (next: CardDeck) => void;
}

function importIssue(error: unknown, c: CardCopy): string {
  if (error instanceof CardDeckError) {
    switch (error.code) {
      case "unsupported-version": return c.version;
      case "backup-too-large": return c.tooBig;
      case "stale-preview": return c.stale;
      case "card-limit": return c.full;
      case "invalid-text": return c.invalidText;
      case "text-too-long": return c.tooLong;
    }
  }
  return c.invalid;
}

export function CardBackup({ deck, language, draftPending, onReplace }: Props) {
  const c = cardCopy[language];
  const id = useId();
  const [source, setSource] = useState("");
  const [preview, setPreview] = useState<DeckImportPreview | null>(null);
  const [undo, setUndo] = useState<{ previous: CardDeck; applied: CardDeck } | null>(null);
  const [status, setStatus] = useState("");
  const [reading, setReading] = useState(false);
  const revision = useRef(0);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const input = useRef<HTMLTextAreaElement>(null);
  useEffect(() => () => { revision.current++; }, []);
  useEffect(() => { if (preview) previewHeading.current?.focus(); }, [preview]);

  const clearPreview = (value: string) => {
    revision.current++;
    setReading(false);
    setSource(value);
    setStatus("");
    setPreview(null);
  };

  const readFile = async (file: File) => {
    const generation = ++revision.current;
    setPreview(null);
    setSource("");
    if (file.size > MAX_BACKUP_BYTES) {
      setReading(false);
      setStatus(c.tooBig);
      return;
    }
    setReading(true);
    setStatus(c.fileBusy);
    try {
      const data = await file.text();
      if (generation !== revision.current) return;
      setSource(data);
      setStatus("");
    } catch {
      if (generation === revision.current) setStatus(c.readError);
    } finally {
      if (generation === revision.current) setReading(false);
    }
  };

  const beginReview = () => {
    try {
      setPreview(previewDeckImport(source, deck));
      setStatus("");
    } catch (error) {
      setPreview(null);
      setStatus(importIssue(error, c));
    }
  };

  const restore = () => {
    if (!preview || draftPending) return;
    try {
      const next = applyDeckImport(preview, deck);
      onReplace(next);
      setUndo({ previous: deck, applied: next });
      setPreview(null);
      setSource("");
      setStatus(c.restored);
    } catch (error) {
      setPreview(null);
      setStatus(importIssue(error, c));
    }
    input.current?.focus();
  };

  const download = (format: "json" | "txt") => {
    try {
      const ok = saveTextFile({
        name: `communication-cards.${format}`,
        mime: format === "json" ? "application/json" : "text/plain;charset=utf-8",
        content: format === "json" ? encodeDeck(deck) : exportDeckText(deck, language),
      });
      setStatus(ok ? c.downloaded : c.downloadError);
    } catch {
      setStatus(c.downloadError);
    }
  };

  return <section className="panel stack" aria-labelledby={id}>
    <h3 id={id}>{c.transfer}</h3>
    <p>{c.backupHint}</p>
    <div className="button-row">
      <button type="button" onClick={() => download("json")}>{c.backup}</button>
      <button type="button" onClick={() => download("txt")}>{c.text}</button>
    </div>
    <label className="field">{c.file}
      <input type="file" accept=".json,application/json" onChange={(event) => {
        const file = event.currentTarget.files?.[0];
        event.currentTarget.value = "";
        if (file) void readFile(file);
      }} />
    </label>
    <label className="field">{c.input}
      <textarea ref={input} value={source} rows={4} onChange={(event) => clearPreview(event.currentTarget.value)} />
    </label>
    <div className="button-row">
      <button type="button" disabled={reading || !source.trim()} onClick={beginReview}>{c.preview}</button>
    </div>
    {preview && <section className="stack" aria-labelledby={id + "-review"}>
      <h4 ref={previewHeading} tabIndex={-1} id={id + "-review"}>{c.review}</h4>
      <dl className="communication-counts">
        <div><dt>{c.added}</dt><dd>{preview.added}</dd></div>
        <div><dt>{c.changed}</dt><dd>{preview.changed}</dd></div>
        <div><dt>{c.removed}</dt><dd>{preview.removed}</dd></div>
        <div><dt>{c.reorder}</dt><dd>{preview.reordered ? c.yes : c.no}</dd></div>
      </dl>
      {preview.deck.cards.length === 0 ? <p>{c.incomingEmpty}</p> :
        <ol>{preview.deck.cards.map((card) => <li key={card.id}>
          <span lang={card.en ? "en" : "und"} dir="auto">{displayText(card, "en")}</span>
          {" · "}
          <span lang={card.fr ? "fr" : "und"} dir="auto">{displayText(card, "fr")}</span>
        </li>)}</ol>}
      <p>{c.replaceHint}</p>
      {draftPending && <p>{c.saveDraft}</p>}
      <div className="button-row">
        <button type="button" onClick={() => { setPreview(null); input.current?.focus(); }}>{c.cancelImport}</button>
        <button type="button" disabled={draftPending} onClick={restore}>{c.replace}</button>
      </div>
    </section>}
    {undo && undo.applied === deck && <div>
      <button type="button" disabled={draftPending} onClick={() => {
        onReplace(undo.previous);
        clearPreview("");
        setUndo(null);
        setStatus(c.undone);
        input.current?.focus();
      }}>{c.undo}</button>
      {draftPending && <p>{c.saveDraft}</p>}
    </div>}
    <p role="status" aria-live="polite">{status}</p>
  </section>;
}
