import { useEffect, useId, useState } from "react";
import type CommunicationCards from "./CommunicationCards";

type Language = "en" | "fr";

const copy = {
  en: {
    open: "Open communication cards",
    close: "Close communication cards",
    loading: "Opening communication cards…",
    failed: "The cards could not open. Select the button to try again.",
  },
  fr: {
    open: "Ouvrir les cartes de communication",
    close: "Fermer les cartes de communication",
    loading: "Ouverture des cartes de communication…",
    failed: "Impossible d’ouvrir les cartes. Sélectionnez le bouton pour réessayer.",
  },
};

export function CommunicationCardsLauncher({ language }: { language: Language }) {
  const [expanded, setExpanded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [Panel, setPanel] = useState<typeof CommunicationCards | null>(null);
  const contentId = useId();
  const labels = copy[language];

  useEffect(() => {
    if (!expanded || Panel) return;
    let active = true;
    void import("./CommunicationCards").then(
      (module) => {
        if (active) setPanel(() => module.default);
      },
      () => {
        if (!active) return;
        setFailed(true);
        setExpanded(false);
      },
    );
    return () => { active = false; };
  }, [expanded, Panel]);

  return <div className="stack">
    <button
      type="button"
      aria-controls={contentId}
      aria-expanded={expanded}
      style={{ minHeight: 44, minWidth: 44, justifySelf: "start" }}
      onClick={() => { setFailed(false); setExpanded(!expanded); }}
    >
      {expanded ? labels.close : labels.open}
    </button>
    {failed && <p role="status">{labels.failed}</p>}
    <div id={contentId} hidden={!expanded}>
      {Panel ? <Panel language={language} /> : expanded && <p role="status">{labels.loading}</p>}
    </div>
  </div>;
}
