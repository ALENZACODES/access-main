import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { CheckField, ChoiceGroup } from "../design/fields.tsx";
import { saveTextFile } from "./downloadFile.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";
import { pruneDone, progress, progressLine, toggleDone } from "./visitChecks.ts";
import { VISIT_CSV_FILENAMES, VISIT_TEXT_FILENAMES, visitPlanToCsv, visitPlanToText } from "./visitPlanText.ts";
import { VISIT_FILTERS, type VisitFilter, filterCounts, filterLabel, filterNote, filterPlan, isVisitFilter } from "./visitFilter.ts";
import { draftMessage, draftToText, mailtoHref } from "./visitMessage.ts";
import { buildVisitPlan, planSummary } from "./visitQuestions.ts";

interface Props {
  /** The listed places the pack holds, in the order shown. */
  found: readonly PackPlaceRecord[];
  /** Listed places the pack does not hold. */
  missing: number;
  locale: Locale;
  today: string;
  /** Writes text to the clipboard. Rejects or returns false when it cannot. */
  copy?: (text: string) => Promise<boolean>;
  /** Hands a file to the browser. Returns false where it cannot. */
  save?: (file: { name: string; mime: string; content: string }) => boolean;
}

const browserCopy = async (text: string): Promise<boolean> => {
  try {
    if (!navigator.clipboard?.writeText) return false;
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

const browserSave = (file: { name: string; mime: string; content: string }): boolean => saveTextFile(file);

/**
 * Questions to put to each listed place, made from what the pack says and leaves out. The person
 * ticks a question once asked; the ticks live only on this page. The App does not answer them.
 */
export function VisitPlan({ found, missing, locale, today, copy = browserCopy, save = browserSave }: Props) {
  const headingId = useId();
  const panelId = useId();
  const plan = useMemo(() => buildVisitPlan(found, missing, locale, today), [found, missing, locale, today]);
  const [open, setOpen] = useState(false);
  const [done, setDone] = useState<ReadonlySet<string>>(new Set());
  const [status, setStatus] = useState("");
  const [filter, setFilter] = useState<VisitFilter>("all");
  const [draftFor, setDraftFor] = useState<string | null>(null);
  const live = useMemo(() => pruneDone(done, plan), [done, plan]);
  const counts = progress(live, plan);
  const shown = useMemo(() => filterPlan(plan, filter, live), [plan, filter, live]);
  const perFilter = useMemo(() => filterCounts(plan, live), [plan, live]);

  if (plan.places.length === 0) return null;

  const doCopy = async () => {
    let ok = false;
    try {
      ok = await copy(visitPlanToText(plan, locale, today, live));
    } catch {
      ok = false;
    }
    setStatus(ok ? t(locale, "Copied the questions.", "Questions copiées.") : t(locale, "This browser could not copy. Save the questions as a file instead.", "Ce navigateur n’a pas pu copier. Enregistrez plutôt les questions dans un fichier."));
  };
  const doSave = (kind: "text" | "csv") => {
    const file =
      kind === "csv"
        ? { name: VISIT_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: visitPlanToCsv(plan, { bom: true }) }
        : { name: VISIT_TEXT_FILENAMES[locale], mime: "text/plain;charset=utf-8", content: visitPlanToText(plan, locale, today, live) };
    let ok = false;
    try {
      ok = save(file);
    } catch {
      ok = false;
    }
    setStatus(ok ? t(locale, `Saved ${file.name}.`, `Fichier ${file.name} enregistré.`) : t(locale, "This browser could not make a file. Copy the questions instead.", "Ce navigateur n’a pas pu créer de fichier. Copiez plutôt les questions."));
  };

  return (
    <section aria-labelledby={headingId} lang={locale} data-visit-plan={plan.total}>
      <h3 id={headingId}>{t(locale, "Questions to ask before you go", "Questions à poser avant d’y aller")}</h3>
      <Button variant="secondary" onPress={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={panelId}>
        {open ? t(locale, "Hide the questions", "Masquer les questions") : t(locale, "Show the questions", "Afficher les questions")}
      </Button>
      <div id={panelId} hidden={!open}>
        {open ? (
          <>
            <p>{planSummary(plan, locale)}</p>
            <p aria-live="polite">{progressLine(counts, locale)}</p>
            <ChoiceGroup
              label={t(locale, "Which questions to show", "Questions à afficher")}
              value={filter}
              onChange={(value) => {
                if (isVisitFilter(value)) setFilter(value);
              }}
              options={VISIT_FILTERS.map((f) => ({ value: f, label: `${filterLabel(f, locale)} (${perFilter[f]})` }))}
            />
            {filterNote(plan, shown, locale) ? <p>{filterNote(plan, shown, locale)}</p> : null}
            {shown.places.map((place) => {
              const name = place.name ?? t(locale, "Place with no name (UNKNOWN)", "Lieu sans nom (UNKNOWN)");
              const draft = draftFor === place.id ? draftMessage(place, locale, live) : null;
              const href = draft ? mailtoHref(draft) : null;
              return (
                <fieldset key={place.id}>
                  <legend>{name}</legend>
                  {place.questions.map((q) => (
                    <CheckField key={q.key} label={q.text} description={q.basis} isSelected={live.has(q.key)} onChange={() => setDone((d) => toggleDone(d, q.key))} />
                  ))}
                  <Button variant="quiet" aria-expanded={draftFor === place.id} onPress={() => setDraftFor((id) => (id === place.id ? null : place.id))}>
                    {draftFor === place.id ? t(locale, `Hide the message for ${name}`, `Masquer le message pour ${name}`) : t(locale, `Draft a message for ${name}`, `Rédiger un message pour ${name}`)}
                  </Button>
                  {draftFor === place.id ? (
                    draft ? (
                      <div className="stack">
                        <textarea readOnly rows={10} value={draftToText(draft, locale)} aria-label={t(locale, `Message for ${name}`, `Message pour ${name}`)} style={{ width: "100%" }} />
                        <Button
                          variant="secondary"
                          onPress={async () => {
                            let ok = false;
                            try {
                              ok = await copy(draftToText(draft, locale));
                            } catch {
                              ok = false;
                            }
                            setStatus(ok ? t(locale, "Copied the message.", "Message copié.") : t(locale, "This browser could not copy. Select the text above instead.", "Ce navigateur n’a pas pu copier. Sélectionnez plutôt le texte ci-dessus."));
                          }}
                        >
                          {t(locale, "Copy the message", "Copier le message")}
                        </Button>
                        {href ? <a href={href}>{t(locale, "Open in your email app", "Ouvrir dans votre application de courriel")}</a> : <p>{t(locale, "This message is too long for an email link. Copy it instead.", "Ce message est trop long pour un lien de courriel. Copiez-le plutôt.")}</p>}
                      </div>
                    ) : (
                      <p>{t(locale, "Every question for this place is ticked, so there is nothing left to put in a message.", "Toutes les questions pour ce lieu sont cochées\u00a0: il n’y a plus rien à mettre dans un message.")}</p>
                    )
                  ) : null}
                </fieldset>
              );
            })}
            <div className="stack" role="group" aria-label={t(locale, "Question actions", "Actions sur les questions")}>
              <Button variant="secondary" onPress={doCopy}>
                {t(locale, "Copy the questions", "Copier les questions")}
              </Button>
              <Button variant="secondary" onPress={() => doSave("text")}>
                {t(locale, "Save as text", "Enregistrer en texte")}
              </Button>
              <Button variant="secondary" onPress={() => doSave("csv")}>
                {t(locale, "Save as CSV", "Enregistrer en CSV")}
              </Button>
            </div>
            <p aria-live="polite">{status}</p>
          </>
        ) : null}
      </div>
    </section>
  );
}
