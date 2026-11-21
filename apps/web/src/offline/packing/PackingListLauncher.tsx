import { useEffect, useId, useState, type ComponentType } from "react";

type Language = "en" | "fr";

const labels = {
  en: {
    open: "Open packing list",
    close: "Close packing list",
    loading: "Opening the packing list…",
    retry: "The packing list could not open. Try opening it again.",
    session: "Your list stays here while this page is open. Save a backup to use it after leaving or reloading.",
  },
  fr: {
    open: "Ouvrir la liste de bagages",
    close: "Fermer la liste de bagages",
    loading: "Ouverture de la liste de bagages…",
    retry: "La liste de bagages n’a pas pu s’ouvrir. Essayez de l’ouvrir de nouveau.",
    session: "Votre liste reste ici tant que cette page est ouverte. Enregistrez une copie pour la retrouver après avoir quitté ou rechargé la page.",
  },
};

export function PackingListLauncher({ language }: { language: Language }) {
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<{ language: Language }> | null>(null);
  const contentId = useId();
  const c = labels[language];

  useEffect(() => {
    if (!open || Panel) return;
    let active = true;
    void import("./PackingListPanel").then(({ default: loaded }) => {
      if (active) setPanel(() => loaded);
    }).catch(() => {
      if (active) {
        setOpen(false);
        setFailed(true);
      }
    });
    return () => { active = false; };
  }, [Panel, open]);

  return <div className="stack">
    <div>
      <button type="button" aria-expanded={open} aria-controls={contentId}
        style={{ minHeight: 44, minWidth: 44 }}
        onClick={() => { setFailed(false); setOpen(!open); }}>
        {open ? c.close : c.open}
      </button>
    </div>
    {failed && <p role="status">{c.retry}</p>}
    <div id={contentId} hidden={!open}>
      {open && !Panel && <p role="status">{c.loading}</p>}
      {Panel && <>
        <p>{c.session}</p>
        <Panel language={language} />
      </>}
    </div>
  </div>;
}
