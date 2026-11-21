import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { CheckField, ChoiceGroup } from "../design/fields.tsx";
import { saveTextFile, type SavedFile } from "./downloadFile.ts";
import { DEFAULT_HANDOUT, HANDOUT_FILENAMES, HANDOUT_SIZES, SIZE_POINTS, buildHandout, parseHandoutOptions, type HandoutOptions, type HandoutSize } from "./handout.ts";
import { handoutToHtml } from "./handoutHtml.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  places: readonly PackPlaceRecord[];
  locale: Locale;
  today: string;
  onSave?: (file: SavedFile) => boolean;
}

const sizeLabel = (s: HandoutSize, locale: Locale): string =>
  s === "standard" ? t(locale, `Standard (${SIZE_POINTS[s]} point)`, `Standard (${SIZE_POINTS[s]} points)`) : s === "large" ? t(locale, `Large (${SIZE_POINTS[s]} point)`, `Grand (${SIZE_POINTS[s]} points)`) : t(locale, `Extra large (${SIZE_POINTS[s]} point)`, `Très grand (${SIZE_POINTS[s]} points)`);

/** Make a large-print page of the listed places. Shown on request; the page is made here and saved by the browser. */
export function Handout({ places, locale, today, onSave = saveTextFile }: Props) {
  const panelId = useId();
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<HandoutOptions>(DEFAULT_HANDOUT);
  const [status, setStatus] = useState("");
  const handout = useMemo(() => (open ? buildHandout(places, locale, today, options) : null), [open, places, locale, today, options]);
  if (places.length === 0) return null;

  const save = () => {
    let ok = false;
    try {
      ok = onSave({ name: HANDOUT_FILENAMES[locale], mime: "text/html;charset=utf-8", content: handoutToHtml(buildHandout(places, locale, today, options)) });
    } catch {
      ok = false;
    }
    setStatus(ok ? t(locale, `Saved ${HANDOUT_FILENAMES[locale]}. Open it in a browser to read or print it.`, `Fichier ${HANDOUT_FILENAMES[locale]} enregistré. Ouvrez-le dans un navigateur pour le lire ou l’imprimer.`) : t(locale, "This browser cannot save a file here.", "Ce navigateur ne peut pas enregistrer de fichier ici."));
  };

  return (
    <div data-handout>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide the large-print page", "Masquer la page en gros caractères") : t(locale, "Make a large-print page", "Créer une page en gros caractères")}
      </Button>
      <div id={panelId} hidden={!open}>
        {handout ? (
          <>
            <ChoiceGroup
              label={t(locale, "Text size", "Taille du texte")}
              value={options.size}
              onChange={(v) => setOptions(parseHandoutOptions({ ...options, size: v }))}
              options={HANDOUT_SIZES.map((s) => ({ value: s, label: sizeLabel(s, locale) }))}
            />
            <CheckField label={t(locale, "Include the pack’s notes", "Inclure les notes du pack")} isSelected={options.notes} onChange={(v) => setOptions({ ...options, notes: v })} />
            <CheckField label={t(locale, "Include map points as numbers", "Inclure les points de carte en chiffres")} isSelected={options.mapPoints} onChange={(v) => setOptions({ ...options, mapPoints: v })} />
            <CheckField label={t(locale, "Include where each detail comes from", "Inclure la provenance de chaque détail")} isSelected={options.sources} onChange={(v) => setOptions({ ...options, sources: v })} />
            <CheckField label={t(locale, "Include questions to ask, with room to write the answer", "Inclure des questions à poser, avec de la place pour la réponse")} isSelected={options.questions} onChange={(v) => setOptions({ ...options, questions: v })} />
            <section aria-label={t(locale, "Preview", "Aperçu")} data-handout-preview style={{ fontSize: `${SIZE_POINTS[handout.size]}pt` }}>
              <h4>{handout.title}</h4>
              <p>{handout.intro}</p>
              <ol>
                {handout.entries.map((e) => (
                  <li key={e.id}>
                    <strong>{e.heading}</strong>
                    <dl>
                      {e.lines.map((l) => (
                        <div key={l.label}>
                          <dt>{l.label}</dt>
                          <dd>{l.value}</dd>
                        </div>
                      ))}
                      {e.note ? (
                        <div>
                          <dt>Note</dt>
                          <dd>{e.note}</dd>
                        </div>
                      ) : null}
                    </dl>
                    {e.questions.length > 0 ? (
                      <>
                        <p>{t(locale, "Questions to ask", "Questions à poser")}</p>
                        <ol>
                          {e.questions.map((q) => (
                            <li key={q}>{q}</li>
                          ))}
                        </ol>
                      </>
                    ) : null}
                  </li>
                ))}
              </ol>
              {handout.footer.map((f) => (
                <p key={f}>{f}</p>
              ))}
            </section>
            <Button variant="secondary" onPress={save}>
              {t(locale, "Save the page (.html)", "Enregistrer la page (.html)")}
            </Button>
            <p aria-live="polite" data-handout-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
