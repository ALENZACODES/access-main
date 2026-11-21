import { useEffect, useId, useRef, useState } from "react";
import { cardCopy } from "./copy";
import { displayText, type CardDeck, type CardLanguage } from "./model";

interface Props {
  deck: CardDeck;
  language: CardLanguage;
  initialId: string;
  onClose: () => void;
}

export function CardDisplay({ deck, language, initialId, onClose }: Props) {
  const c = cardCopy[language];
  const [index, setIndex] = useState(() => Math.max(0, deck.cards.findIndex((card) => card.id === initialId)));
  const [shownLanguage, setShownLanguage] = useState(language);
  const [extraLarge, setExtraLarge] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const card = deck.cards[index];
  useEffect(() => { heading.current?.focus(); }, []);

  if (!card) return <button type="button" onClick={onClose}>{c.back}</button>;
  const hasText = Boolean(card[shownLanguage]);
  return <section aria-labelledby={id} className="communication-display stack">
    <h3 id={id} tabIndex={-1} ref={heading}>{c.present}</h3>
    <div className="button-row">
      <button type="button" onClick={onClose}>{c.back}</button>
      <button type="button" aria-pressed={shownLanguage === "en"} onClick={() => setShownLanguage("en")}>{c.showEn}</button>
      <button type="button" aria-pressed={shownLanguage === "fr"} onClick={() => setShownLanguage("fr")}>{c.showFr}</button>
    </div>
    <div className="communication-display-message" aria-live="polite" aria-atomic="true">
      <p>{c.card} {index + 1} {c.of} {deck.cards.length} · {shownLanguage === "en" ? c.enName : c.frName}</p>
      <p className={extraLarge ? "communication-reading extra-large" : "communication-reading"}
        lang={hasText ? shownLanguage : "und"} dir="auto">{displayText(card, shownLanguage)}</p>
      {!hasText && <p>{c.missing}</p>}
    </div>
    <div className="button-row">
      <button type="button" disabled={index === 0} onClick={() => setIndex(index - 1)}>{c.previous}</button>
      <button type="button" disabled={index === deck.cards.length - 1} onClick={() => setIndex(index + 1)}>{c.next}</button>
    </div>
    <fieldset>
      <legend>{c.size}</legend>
      <div className="button-row">
        <button type="button" aria-pressed={!extraLarge} onClick={() => setExtraLarge(false)}>{c.large}</button>
        <button type="button" aria-pressed={extraLarge} onClick={() => setExtraLarge(true)}>{c.extra}</button>
      </div>
    </fieldset>
  </section>;
}
