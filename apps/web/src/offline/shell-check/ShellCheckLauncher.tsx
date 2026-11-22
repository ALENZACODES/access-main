import { useEffect, useId, useState, type ComponentType } from "react";

type Language = "en" | "fr";
type Panel = ComponentType<{ language: Language }>;

const labels = {
  en: {
    open: "Open offline startup file check",
    close: "Close offline startup file check",
    loading: "Opening the file check…",
    failed: "The file check could not open. Select the button to try again.",
  },
  fr: {
    open: "Ouvrir le contrôle des fichiers de démarrage hors ligne",
    close: "Fermer le contrôle des fichiers de démarrage hors ligne",
    loading: "Ouverture du contrôle des fichiers…",
    failed: "Le contrôle des fichiers n’a pas pu s’ouvrir. Sélectionnez le bouton pour réessayer.",
  },
};

export function ShellCheckLauncher({ language }: { language: Language }) {
  const contentId = useId();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [Panel, setPanel] = useState<Panel | null>(null);
  const c = labels[language];

  useEffect(() => {
    if (!open || Panel) return;
    let active = true;
    void import("./ShellCheckPanel").then(({ default: loaded }) => {
      if (active) setPanel(() => loaded);
    }).catch(() => {
      if (active) {
        setOpen(false);
        setFailed(true);
      }
    });
    return () => { active = false; };
  }, [open, Panel]);

  return (
    <div className="stack">
      <div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={contentId}
          style={{ minHeight: 44, minWidth: 44 }}
          onClick={() => {
            setFailed(false);
            setOpen(!open);
          }}
        >
          {open ? c.close : c.open}
        </button>
      </div>
      {failed && <p role="status">{c.failed}</p>}
      <div id={contentId} hidden={!open}>
        {open && (Panel ? <Panel language={language} /> : <p role="status">{c.loading}</p>)}
      </div>
    </div>
  );
}
