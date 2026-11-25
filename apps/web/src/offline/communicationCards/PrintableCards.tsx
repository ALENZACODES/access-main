import { useState } from "react";
import { saveTextFile } from "../../states/downloadFile";
import { displayText, type CardDeck, type CardLanguage, type CommunicationCard } from "./model";
import { cardPosition, pointSize, printableCardsFile, printCopy, printLanguages, type PrintFaces, type PrintSize } from "./printCards";

const target = { minHeight: 44, minWidth: 44 };

export function PrintableCards({ deck, language }: { deck: CardDeck; language: CardLanguage }) {
  const [faces, setFaces] = useState<PrintFaces>("both");
  const [size, setSize] = useState<PrintSize>("large");
  // A replacement card can reuse an ID. Only the exact message the person selected may be printed.
  const [marked, setMarked] = useState(() => new WeakSet<CommunicationCard>());
  const [result, setResult] = useState<"saved" | "failed" | null>(null);
  const c = printCopy[language];
  const selected = deck.cards.filter(card => marked.has(card));
  const first = selected[0];

  function select(cards: readonly CommunicationCard[]) {
    setMarked(new WeakSet(cards));
    setResult(null);
  }

  function save() {
    if (!selected.length) return;
    try {
      const file = printableCardsFile(selected, { language, faces, size }, document);
      setResult(saveTextFile(file) ? "saved" : "failed");
    } catch {
      setResult("failed");
    }
  }

  return <details className="panel">
    <summary style={{ ...target, cursor: "pointer", alignContent: "center" }}>{c.summary}</summary>
    <div className="stack">
      <p>{c.choose}</p>
      <fieldset className="stack">
        <legend>{c.choices}</legend>
        <div className="button-row">
          <button type="button" style={target} disabled={selected.length === deck.cards.length}
            onClick={() => select(deck.cards)}>{c.all}</button>
          <button type="button" style={target} disabled={!selected.length}
            onClick={() => select([])}>{c.none}</button>
        </div>
        {deck.cards.map((card, index) => {
          const other = language === "en" ? "fr" : "en";
          const messageLanguage = card[language] ? language : other;
          return <label key={card.id} style={{ display: "flex", alignItems: "center", gap: ".5rem", overflowWrap: "anywhere" }}>
            <input type="checkbox" style={target} checked={marked.has(card)} onChange={(event) =>
              select(event.target.checked ? [...selected, card] : selected.filter(item => item !== card))} />
            <span>
              {c.card} {index + 1} — {c[messageLanguage]} — <span lang={messageLanguage} dir="auto">{card[messageLanguage]}</span>
            </span>
          </label>;
        })}
      </fieldset>
      <label className="field">{c.faces}
        <select style={target} value={faces} onChange={event => { setFaces(event.target.value as PrintFaces); setResult(null); }}>
          <option value="both">{c.both}</option>
          <option value="en">{c.en}</option>
          <option value="fr">{c.fr}</option>
        </select>
      </label>
      <label className="field">{c.size}
        <select style={target} value={size} onChange={event => { setSize(event.target.value as PrintSize); setResult(null); }}>
          <option value="large">{c.large}</option>
          <option value="extra-large">{c.extra}</option>
        </select>
      </label>
      <p>{c.selected}{language === "fr" ? "\u00a0: " : ": "}{selected.length}</p>
      {first && <section className="panel" aria-label={c.preview}>
        <h4>{c.preview}</h4>
        <p>{cardPosition(0, selected.length, language)}</p>
        {printLanguages(faces, language).map(face => <div key={face}>
          <strong>{c[face]}</strong>
          <p dir="auto" lang={first[face] ? face : "und"} style={{ fontSize: `${pointSize[size]}pt`, whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>
            {displayText(first, face)}
          </p>
        </div>)}
      </section>}
      <p>{c.paper}</p>
      <button type="button" style={target} disabled={!selected.length} onClick={save}>{c.save}</button>
      <p role="status">{result ? c[result] : ""}</p>
    </div>
  </details>;
}
