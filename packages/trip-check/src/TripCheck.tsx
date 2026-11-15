import { useCallback, useEffect, useId, useState } from "react";
import { PROMPTS } from "./catalog";
import { newDraft } from "./draft";
import { downloadBlob, exportDrafts } from "./export";
import { STRINGS, answerLabel } from "./strings";
import type { Answer, Lang, Prompt, Storage, TripDraft } from "./types";

export interface TripCheckProps {
  storage: Storage;
  lang: Lang;
  place_ref?: string;
}

const ANSWERS: Answer[] = ["yes", "no", "UNKNOWN"];

const btn = (pressed: boolean) => ({
  minHeight: 44,
  minWidth: 44,
  padding: "8px 14px",
  font: "inherit",
  border: "2px solid #1a1a1a",
  borderRadius: 6,
  background: pressed ? "#1a1a1a" : "#ffffff",
  color: pressed ? "#ffffff" : "#1a1a1a",
  cursor: "pointer",
});

/**
 * One-tap prompts. Answers are saved as tier 0 local drafts and are labelled
 * "unverified draft"; they are never shown as a fact about the place.
 */
export function TripCheck({ storage, lang, place_ref }: TripCheckProps) {
  const s = STRINGS[lang];
  const titleId = useId();
  const [latest, setLatest] = useState<Record<string, TripDraft>>({});
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState("");

  const refresh = useCallback(async () => {
    const local = (await storage.list()).filter((d) => d.state === "local");
    const by: Record<string, TripDraft> = {};
    for (const d of local.sort((a, b) => a.retrieved_at.localeCompare(b.retrieved_at))) by[d.prompt_id] = d;
    setLatest(by);
    setCount(local.length);
  }, [storage]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const answer = async (p: Prompt, v: Answer) => {
    await storage.put(newDraft(p, v, { place_ref }));
    await refresh();
    setStatus(s.saved);
  };

  const doExport = async () => {
    const res = await exportDrafts(storage);
    if (!res) {
      setStatus(s.nothingToExport);
      return;
    }
    downloadBlob(res.blob, res.filename);
    await refresh();
    setStatus(s.exportDone);
  };

  return (
    <section aria-labelledby={titleId} lang={lang} style={{ maxWidth: 640, padding: 8, color: "#1a1a1a" }}>
      <h2 id={titleId}>{s.title}</h2>
      <p>{s.intro}</p>
      {PROMPTS.map((p) => {
        const d = latest[p.id];
        const labelId = `${titleId}-${p.id}`;
        return (
          <div key={p.id} role="group" aria-labelledby={labelId} style={{ margin: "16px 0" }}>
            <p id={labelId} style={{ fontWeight: 700, margin: "0 0 8px" }}>
              {p.text[lang]}
            </p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {ANSWERS.map((a) => (
                <button key={a} type="button" aria-pressed={d?.value === a} style={btn(d?.value === a)} onClick={() => void answer(p, a)}>
                  {answerLabel(lang, a)}
                </button>
              ))}
            </div>
            <p style={{ margin: "6px 0 0", fontSize: 14 }}>
              {d ? `${s.draftLabel}: ${answerLabel(lang, d.value)} (${d.retrieved_at.slice(0, 10)})` : s.notChecked}
            </p>
          </div>
        );
      })}
      <p>{s.localCount.replace("{n}", String(count))}</p>
      <button type="button" style={btn(false)} onClick={() => void doExport()}>
        {s.exportButton}
      </button>
      <p role="status" aria-live="polite">
        {status}
      </p>
    </section>
  );
}
