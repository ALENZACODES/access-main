import { useEffect, useState } from "react";
import { formatDateTime, t, tDynamic, type Lang } from "../i18n/index.ts";
import type { CaregiverService } from "../service.ts";
import type { CaregiverView, ViewItem } from "../types.ts";
import { describeDate, describeField, describeValue, snapshotFields } from "./describe.ts";

function Item({ item, lang }: { item: ViewItem; lang: Lang }) {
  const { scope } = item;
  return (
    <li>
      <h4>{tDynamic(lang, `scope.${scope.kind}`)}</h4>
      {scope.kind === "journey_reference" && (
        <p>
          {scope.label}. {t(lang, "caregiver.journeyRef", { ref: scope.journey_ref })}
        </p>
      )}
      {scope.kind === "check_in_receipt" && (
        <p>
          {scope.label}. {t(lang, "caregiver.receiptRef", { ref: scope.receipt_id })} {t(lang, "caregiver.recordedAt", { time: describeDate(lang, scope.recorded_at) })}
        </p>
      )}
      {scope.kind === "equipment_snapshot" && (
        <>
          <dl>
            {snapshotFields(scope).map((field) => (
              <div key={field} className="pair">
                <dt>{describeField(lang, field)}</dt>
                <dd>{describeValue(lang, field, scope.snapshot[field])}</dd>
              </div>
            ))}
          </dl>
          <p className="hint">{t(lang, "caregiver.snapshotNote")}</p>
        </>
      )}
      <p className="hint">{item.expires_at ? t(lang, "caregiver.expires", { time: formatDateTime(lang, item.expires_at) }) : t(lang, "caregiver.noEnd")}</p>
    </li>
  );
}

export interface CaregiverPanelProps {
  service: CaregiverService;
  lang: Lang;
}

/** Shows one caregiver's active grants and nothing else. It is given no profile. */
export function CaregiverPanel({ service, lang }: CaregiverPanelProps) {
  const [labels, setLabels] = useState<string[] | null>(null);
  const [selected, setSelected] = useState("");
  const [view, setView] = useState<CaregiverView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let current = true;
    service.caregiverLabels().then(
      (found) => {
        if (!current) return;
        setLabels(found);
        setSelected((previous) => (found.includes(previous) ? previous : (found[0] ?? "")));
      },
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [service]);

  useEffect(() => {
    if (!selected) {
      setView(null);
      return;
    }
    let current = true;
    service.caregiverView(selected).then(
      (next) => current && setView(next),
      () => current && setFailed(true),
    );
    return () => {
      current = false;
    };
  }, [service, selected]);

  if (failed) return <p role="alert">{t(lang, "app.loadError")}</p>;
  if (labels === null) return <p>{t(lang, "app.loading")}</p>;

  return (
    <section aria-labelledby="caregiver-heading">
      <h2 id="caregiver-heading">{t(lang, "caregiver.heading")}</h2>
      {labels.length === 0 ? (
        <p>{t(lang, "caregiver.noCaregivers")}</p>
      ) : (
        <>
          <div className="field">
            <label htmlFor="viewing-as">{t(lang, "caregiver.pick")}</label>
            <select id="viewing-as" value={selected} onChange={(event) => setSelected(event.target.value)}>
              {labels.map((label) => (
                <option key={label} value={label}>{label}</option>
              ))}
            </select>
          </div>
          {view && view.empty && (
            <div role="status">
              <p><strong>{t(lang, "caregiver.empty")}</strong></p>
              <p>{t(lang, "caregiver.emptyHelp")}</p>
            </div>
          )}
          {view && !view.empty && (
            <>
              <h3 id="items-heading">{t(lang, "caregiver.items")}</h3>
              <ul aria-labelledby="items-heading" className="cards">
                {view.items.map((item) => (
                  <Item key={item.grant_id} item={item} lang={lang} />
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </section>
  );
}
