import { useEffect, useId, useRef, useState, type ChangeEvent } from "react";
import { saveTextFile } from "../../states/downloadFile";
import type { PackingList } from "./model";
import type { PackingLanguage } from "./packingCopy";
import { packingBackupFile, packingChecklistFile, readPackingBackup } from "./transfer";
import { transferCopy } from "./transferCopy";

interface TransferProps {
  readonly list: PackingList;
  readonly language: PackingLanguage;
  readonly onRestore: (list: PackingList) => void;
}

interface ReadState {
  base: PackingList;
  result?: Awaited<ReturnType<typeof readPackingBackup>>;
}

type Notice = "saved" | "saveFailed" | "restored" | "cancelled";

const targetSize = { minWidth: 44, minHeight: 44 };
const labelStyle = { ...targetSize, display: "flex", alignItems: "center", gap: "0.5em" };

export function PackingTransfer({ list, language, onRestore }: TransferProps) {
  const w = transferCopy[language];
  const sectionId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const request = useRef(0);
  const [includeNotes, setIncludeNotes] = useState(false);
  const [read, setRead] = useState<ReadState | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  useEffect(() => () => { request.current += 1; }, []);

  async function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    const token = ++request.current;
    setNotice(null);
    setRead({ base: list });
    const result = await readPackingBackup(file);
    if (request.current === token) setRead({ base: list, result });
  }

  function download(format: "json" | "text") {
    try {
      const file = format === "json"
        ? packingBackupFile(list)
        : packingChecklistFile(list, language, includeNotes);
      setNotice(saveTextFile(file) ? "saved" : "saveFailed");
    } catch {
      setNotice("saveFailed");
    }
  }

  function finishRestore(message: "restored" | "cancelled") {
    ++request.current;
    setRead(null);
    setNotice(message);
    inputRef.current?.focus();
  }

  const outdated = read !== null && read.base !== list;
  const result = read?.result;
  const preview = !outdated && result?.ok ? result.list : null;
  const items = preview?.bags.flatMap(bag => bag.items) ?? [];

  let reviewStatus = "";
  if (outdated) reviewStatus = w.changed;
  else if (read && !result) reviewStatus = w.reading;
  else if (result && !result.ok) reviewStatus = w[result.problem];
  else if (preview) reviewStatus = w.review;

  return (
    <section className="panel stack" aria-labelledby={sectionId}>
      <h3 id={sectionId}>{w.title}</h3>
      <p>{w.backupDetails}</p>
      <button type="button" style={targetSize} onClick={() => download("json")}>
        {w.backup}
      </button>
      <label style={labelStyle}>
        <input
          type="checkbox"
          style={targetSize}
          checked={includeNotes}
          onChange={event => setIncludeNotes(event.target.checked)}
        />
        {w.include}
      </label>
      <button type="button" style={targetSize} onClick={() => download("text")}>
        {w.checklist}
      </button>
      <label htmlFor={sectionId + "-file"} style={labelStyle}>{w.file}</label>
      <input
        type="file"
        accept=".json,application/json"
        id={sectionId + "-file"}
        ref={inputRef}
        style={targetSize}
        onChange={event => void selectFile(event)}
      />
      <p role="status">{[reviewStatus, notice ? w[notice] : ""].filter(Boolean).join(" ")}</p>
      {preview && (
        <div className="stack">
          <dl>
            <dt>{w.name}</dt><dd dir="auto">{preview.title}</dd>
            <dt>{w.bags}</dt><dd>{preview.bags.length}</dd>
            <dt>{w.items}</dt><dd>{items.length}</dd>
            <dt>{w.units}</dt><dd>{items.reduce((sum, item) => sum + item.quantity, 0)}</dd>
          </dl>
          <p>{w.replaces}</p>
          <div className="button-row">
            <button type="button" style={targetSize} onClick={() => finishRestore("cancelled")}>
              {w.cancel}
            </button>
            <button
              type="button"
              style={targetSize}
              onClick={() => {
                onRestore(preview);
                setIncludeNotes(false);
                finishRestore("restored");
              }}
            >
              {w.apply}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
