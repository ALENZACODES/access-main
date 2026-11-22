import { useEffect, useId, useState, type ComponentType } from "react";
import type { QueuePanelProps } from "./DownloadQueuePanel";

const text = {
  en: {
    open: "Open region download queue", close: "Close region download queue",
    loading: "Opening the region download queue…",
    failed: "The region download queue could not open. Select the button to try again.",
  },
  fr: {
    open: "Ouvrir la file de téléchargement des régions", close: "Fermer la file de téléchargement des régions",
    loading: "Ouverture de la file de téléchargement des régions…",
    failed: "La file de téléchargement des régions n’a pas pu s’ouvrir. Sélectionnez le bouton pour réessayer.",
  },
};

export function DownloadQueueLauncher(props: QueuePanelProps) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<QueuePanelProps> | null>(null);
  const id = useId();
  const c = text[props.language];

  useEffect(() => {
    if (!open || Panel) return;
    let active = true;
    void import("./DownloadQueuePanel").then(({ default: loaded }) => {
      if (active) setPanel(() => loaded);
    }).catch(() => {
      if (active) {
        setOpen(false);
        setFailed(true);
      }
    });
    return () => { active = false; };
  }, [open, Panel]);

  return <div className="stack">
    <button type="button" style={{ minHeight: 44, minWidth: 44, justifySelf: "start" }}
      aria-expanded={open} aria-controls={id}
      onClick={() => { setFailed(false); setOpen(!open); }}>
      {open ? c.close : c.open}
    </button>
    {failed && <p role="status">{c.failed}</p>}
    <div id={id} hidden={!open}>
      {open && (Panel ? <Panel {...props} /> : <p role="status">{c.loading}</p>)}
    </div>
  </div>;
}
