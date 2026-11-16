import type { ReactElement } from "react";
import type { LocalPackRecord } from "./packInventory";
import type { RecoveryLocale } from "./index";

export interface RecoveryQueuePanelProps {
  readonly locale: RecoveryLocale;
  readonly records: readonly LocalPackRecord[];
  readonly busy: boolean;
  readonly onInspect: () => void;
}

const copy = {
  en: {
    title: "Packs needing attention",
    unknown: "Status UNKNOWN. Check the saved data before use.",
    corrupt: "Saved data differs from its expected contents.",
    absent: "No saved copy was found.",
    inspect: "Check saved packs",
    empty: "No packs currently need attention.",
  },
  fr: {
    title: "Ensembles à examiner",
    unknown: "État INCONNU. Contrôlez les données enregistrées avant utilisation.",
    corrupt: "Les données enregistrées diffèrent du contenu attendu.",
    absent: "Aucune copie enregistrée n’a été trouvée.",
    inspect: "Contrôler les ensembles enregistrés",
    empty: "Aucun ensemble ne nécessite actuellement d’attention.",
  },
} as const;

/** Manual queue based only on the latest locally inspected records. */
export function RecoveryQueuePanel({
  locale, records, busy, onInspect,
}: RecoveryQueuePanelProps): ReactElement {
  const c = copy[locale];
  const pending = records.filter((item) => item.state !== "ready");
  return (
    <section lang={locale} className="panel stack" aria-label={c.title}>
      <h3>{c.title}</h3>
      {pending.length === 0 ? <p>{c.empty}</p> : (
        <ul>{pending.map((item) => (
          <li key={item.id}>
            <strong>{item.id}</strong>{" — "}
            {item.state === "corrupt" ? c.corrupt : item.state === "absent" ? c.absent : c.unknown}
          </li>
        ))}</ul>
      )}
      <button
        type="button"
        disabled={busy}
        style={{ minWidth: 44, minHeight: 44, padding: "10px 16px" }}
        onClick={onInspect}
      >{c.inspect}</button>
    </section>
  );
}
