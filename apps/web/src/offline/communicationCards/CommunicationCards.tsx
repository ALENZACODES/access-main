import { useEffect, useId, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { CardBackup } from "./CardBackup";
import { CardDisplay } from "./CardDisplay";
import { cardCopy, examples } from "./copy";
import {
  addCard, CardDeckError, displayText, duplicateCard, editCard, emptyDeck,
  MAX_CARDS, MAX_CARD_LENGTH, moveCard, nextCardId, removeCard,
  type CardDeck, type CardLanguage, type CardText, type CommunicationCard,
} from "./model";
import { PrintableCards } from "./PrintableCards";
import "./communicationCards.css";

const emptyDraft: CardText = { en: "", fr: "" };
type EditFocus = { cardId: string } | "draft" | "confirm";

export default function CommunicationCards({ language }: { language: CardLanguage }) {
  const c = cardCopy[language];
  const id = useId();
  const [deck, setDeck] = useState(emptyDeck);
  const [draft, setDraft] = useState<CardText>(emptyDraft);
  const [editId, setEditId] = useState<string | null>(null);
  const [pendingRemoval, setPendingRemoval] = useState<string | null>(null);
  const [presentId, setPresentId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const fields = useRef<Partial<Record<CardLanguage, HTMLTextAreaElement | null>>>({});
  const editButtons = useRef(new Map<string, HTMLButtonElement>());
  const keepButton = useRef<HTMLButtonElement>(null);
  const returnTo = useRef<HTMLButtonElement | null>(null);
  const [focus, setFocus] = useState<EditFocus | null>(null);
  const draftPending = editId !== null || draft.en !== "" || draft.fr !== "";
  const full = deck.cards.length >= MAX_CARDS;

  useLayoutEffect(() => {
    if (!focus) return;
    if (focus === "draft") fields.current[language]?.focus();
    else if (focus === "confirm") keepButton.current?.focus();
    else editButtons.current.get(focus.cardId)?.focus();
    setFocus(null);
  }, [focus, language]);

  useEffect(() => {
    if (presentId === null && returnTo.current) {
      returnTo.current.focus();
      returnTo.current = null;
    }
  }, [presentId]);

  const present = (cardId: string, button: HTMLButtonElement) => {
    returnTo.current = button;
    setPresentId(cardId);
  };

  const clearDraft = () => {
    setDraft(emptyDraft);
    setEditId(null);
  };

  const modify = (operation: () => CardDeck, success: string) => {
    try {
      setDeck(operation());
      setPendingRemoval(null);
      setNotice(success);
      return true;
    } catch (error) {
      let message = c.actionError;
      if (error instanceof CardDeckError) {
        switch (error.code) {
          case "empty-text": message = c.blank; break;
          case "text-too-long": message = c.tooLong; break;
          case "invalid-text": message = c.invalidText; break;
          case "card-limit": message = c.full; break;
        }
      }
      setNotice(message);
      return false;
    }
  };

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const target = editId ?? nextCardId(deck);
    const saved = modify(
      () => editId ? editCard(deck, target, draft) : addCard(deck, target, draft),
      editId ? c.changedMessage : c.addedMessage,
    );
    if (saved) {
      clearDraft();
      setFocus(editId ? { cardId: target } : "draft");
    } else setFocus("draft");
  };

  const beginEdit = (card: CommunicationCard) => {
    if (draftPending) {
      setNotice(c.finishDraft);
      setFocus("draft");
      return;
    }
    setPendingRemoval(null);
    setEditId(card.id);
    setDraft({ en: card.en, fr: card.fr });
    setNotice("");
    setFocus("draft");
  };

  const confirmRemove = (index: number, cardId: string) => {
    const next = deck.cards[index + 1] ?? deck.cards[index - 1];
    if (modify(() => removeCard(deck, cardId), c.removedMessage)) {
      if (editId === cardId) clearDraft();
      setFocus(next ? { cardId: next.id } : "draft");
    }
  };

  const composer = <form className="panel stack" onSubmit={submit} aria-labelledby={id + "-compose"}>
    <h3 id={id + "-compose"}>{editId ? c.editTitle : c.compose}</h3>
    <label className="field">{c.templates}
      <select value="" disabled={draftPending || full} aria-describedby={id + "-example-help"} onChange={(event) => {
        const chosen = examples[Number(event.currentTarget.value)];
        if (chosen) { setDraft({ ...chosen }); setNotice(""); setFocus("draft"); }
      }}>
        <option value="">{c.choose}</option>
        {examples.map((item, index) => <option value={index} key={item.en}>{item[language]}</option>)}
      </select>
    </label>
    <p id={id + "-example-help"}>{c.templateHint}</p>
    <p id={id + "-limit"}>{c.characterLimit} · {MAX_CARD_LENGTH}</p>
    {(["en", "fr"] as const).map((lang) => <label key={lang} className="field">
      {lang === "en" ? c.english : c.french}
      <textarea lang={lang} dir="auto" ref={(element) => { fields.current[lang] = element; }}
        aria-describedby={id + "-limit"} rows={2} maxLength={MAX_CARD_LENGTH} value={draft[lang]}
        onChange={(event) => {
          setDraft({ ...draft, [lang]: event.currentTarget.value });
          setNotice("");
        }} />
    </label>)}
    <div className="button-row">
      <button type="submit" disabled={!editId && full}>{editId ? c.save : c.add}</button>
      {draftPending && <button type="button" onClick={() => {
        const previousId = editId;
        clearDraft();
        setNotice("");
        setFocus(previousId ? { cardId: previousId } : "draft");
      }}>{editId ? c.cancelEdit : c.clear}</button>}
    </div>
  </form>;

  return <section className="communication-cards stack" aria-labelledby={id}>
    <h2 id={id}>{c.title}</h2>
    {presentId !== null && <CardDisplay deck={deck} language={language} initialId={presentId}
      onClose={() => setPresentId(null)} />}
    <div hidden={presentId !== null}>
      <div className="stack">
        <p>{c.intro}</p>
        <p>{c.privacy}</p>
        <section className="panel stack" aria-labelledby={id + "-list"}>
          <h3 id={id + "-list"}>{c.messages}</h3>
          <p>{c.capacity} · {deck.cards.length} / {MAX_CARDS}</p>
          {full && <p>{c.full}</p>}
          {deck.cards.length > 0 ? <>
            <div><button type="button" onClick={(event) => {
              const first = deck.cards[0];
              if (first) present(first.id, event.currentTarget);
            }}>{c.show}</button></div>
            <ol className="communication-list">{deck.cards.map((card, index) => {
              const position = c.card + " " + (index + 1);
              const rowId = id + "-" + card.id;
              return <li key={card.id}><div className="stack" role="group" aria-labelledby={rowId}>
                <h4 id={rowId}>{position}</h4>
                <dl className="communication-wording">
                  {(["en", "fr"] as const).map((lang) => <div key={lang}>
                    <dt>{lang === "en" ? c.enName : c.frName}</dt>
                    <dd lang={card[lang] ? lang : "und"} dir="auto">{displayText(card, lang)}</dd>
                  </div>)}
                </dl>
                <div className="button-row">
                  <button type="button" onClick={(event) => present(card.id, event.currentTarget)}>{c.showThis}</button>
                  <button type="button" ref={(button) => {
                    if (button) editButtons.current.set(card.id, button);
                    else editButtons.current.delete(card.id);
                  }} onClick={() => beginEdit(card)}>{c.edit}</button>
                  <button type="button" disabled={full} onClick={() => {
                    const newId = nextCardId(deck);
                    if (modify(() => duplicateCard(deck, card.id, newId), c.copiedMessage)) setFocus({ cardId: newId });
                  }}>{c.duplicate}</button>
                  {(["up", "down"] as const).map((direction) => <button type="button" key={direction}
                    disabled={direction === "up" ? index === 0 : index === deck.cards.length - 1}
                    onClick={() => {
                      if (modify(() => moveCard(deck, card.id, direction), c.movedMessage)) setFocus({ cardId: card.id });
                    }}>{c[direction]}</button>)}
                  <button type="button" aria-expanded={pendingRemoval === card.id} onClick={() => {
                    setPendingRemoval(card.id);
                    setFocus("confirm");
                  }}>{c.delete}</button>
                </div>
                {pendingRemoval === card.id && <div className="stack" role="group" aria-label={c.confirmDelete}>
                  <p>{c.confirmDelete}</p>
                  <div className="button-row">
                    <button type="button" ref={keepButton} onClick={() => {
                      setPendingRemoval(null);
                      setFocus({ cardId: card.id });
                    }}>{c.keep}</button>
                    <button type="button" onClick={() => confirmRemove(index, card.id)}>{c.removeCard}</button>
                  </div>
                </div>}
              </div></li>;
            })}</ol>
          </> : <p>{c.empty}</p>}
        </section>
        {composer}
        <p role="status" aria-live="polite">{notice}</p>
        <CardBackup deck={deck} language={language} draftPending={draftPending} onReplace={(next) => {
          setDeck(next);
          setPendingRemoval(null);
          setNotice("");
        }} />
        <PrintableCards deck={deck} language={language} />
      </div>
    </div>
  </section>;
}
