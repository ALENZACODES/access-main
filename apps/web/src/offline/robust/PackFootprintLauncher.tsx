import { useEffect, useId, useRef, useState, type ComponentType } from "react";
import type { PackManifest, RegionStatus } from "../../../../../packages/data-client/src/types";
import type { Language, StorageEstimate } from "./regionDownload";

export interface PackFootprintProps {
  readonly pack: PackManifest;
  readonly statuses: readonly RegionStatus[];
  readonly language: Language;
  readonly estimateStorage: () => Promise<StorageEstimate>;
}

const labels = {
  en: {
    open: "Compare regional download sizes",
    close: "Close download size comparison",
    loading: "Opening the download size comparison…",
    failure: "The comparison could not open. Try again.",
  },
  fr: {
    open: "Comparer la taille des téléchargements régionaux",
    close: "Fermer la comparaison des téléchargements",
    loading: "Ouverture de la comparaison des téléchargements…",
    failure: "La comparaison n’a pas pu s’ouvrir. Réessayez.",
  },
};

export function PackFootprintLauncher(props: PackFootprintProps) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const [Panel, setPanel] = useState<ComponentType<PackFootprintProps> | null>(null);
  const request = useRef(0);
  const copy = labels[props.language];
  useEffect(() => () => { request.current++; }, []);

  function toggle() {
    const token = ++request.current;
    setFailed(false);
    setOpen(!open);
    if (open || Panel) return;
    void import("./PackFootprintPanel").then(({ default: component }) => {
      if (request.current === token) setPanel(() => component);
    }).catch(() => {
      if (request.current === token) {
        setOpen(false);
        setFailed(true);
      }
    });
  }

  return <div className="stack">
    <div>
      <button type="button" style={{ minHeight: 44, minWidth: 44 }}
        aria-controls={id} aria-expanded={open} onClick={toggle}>
        {open ? copy.close : copy.open}
      </button>
    </div>
    {failed && <p role="status">{copy.failure}</p>}
    <div id={id} hidden={!open}>
      {open && (Panel ? <Panel {...props} /> : <p role="status">{copy.loading}</p>)}
    </div>
  </div>;
}
