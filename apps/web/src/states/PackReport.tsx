import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { type SavedFile, saveTextFile } from "./downloadFile.ts";
import { PACK_CSV_FILENAMES, packPlacesToCsv } from "./packExport.ts";
import { gapLines } from "./packGaps.ts";
import { duplicateLines, duplicatesHeadline, issuesToCsv, outlierLines, outliersHeadline, packReportToText, buildPackReport, reportHeadline, REPORT_FILENAMES, sampleLine } from "./packReport.ts";
import { groupLine, severityLabel } from "./packIssueText.ts";
import { packCoverageLines } from "./packAudit.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The `places` array of the pack stored on this device, as read. It is checked here, not trusted. */
  places: unknown;
  locale: Locale;
  /** ISO date; defaults to today on this device. */
  today?: string;
  /** Receives each file to save. Returns false when the browser cannot save it. Defaults to the browser's own save. */
  onSave?: (file: SavedFile) => boolean;
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

type Saved = { readonly name: string; readonly ok: boolean } | null;

/**
 * What the saved places cover and what is missing, with files to save: the places as a CSV, the
 * whole report as text, and the problems as a CSV. Reading and saving only; nothing is sent
 * anywhere. The words describe the pack. They never say it is right, current or complete.
 */
export function PackReport({ places, locale, today, onSave = (file) => saveTextFile(file) }: Props) {
  const headingId = useId();
  const day = today ?? localToday();
  const report = useMemo(() => buildPackReport(places, day), [places, day]);
  const [saved, setSaved] = useState<Saved>(null);
  if (report.level === "empty") return null;

  const names = REPORT_FILENAMES[locale];
  const save = (file: SavedFile) => setSaved({ name: file.name, ok: onSave(file) });
  const savedLine =
    saved === null
      ? ""
      : saved.ok
        ? t(locale, `Saved ${saved.name}.`, `${saved.name} enregistré.`)
        : t(locale, "This browser could not save the file.", "Ce navigateur n’a pas pu enregistrer le fichier.");

  return (
    <section aria-labelledby={headingId} lang={locale} data-pack-report={report.level}>
      <h2 id={headingId}>{t(locale, "About the saved places", "À propos des lieux enregistrés")}</h2>
      <p>{reportHeadline(report, locale)}</p>
      <ul>
        {packCoverageLines(report.coverage, locale).map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      {report.groups.length > 0 ? (
        <details>
          <summary>{t(locale, "Problems and gaps found", "Problèmes et lacunes repérés")}</summary>
          <ul>
            {report.groups.map((g) => (
              <li key={g.code} data-severity={g.severity}>
                <strong>{severityLabel(g.severity, locale)}</strong>
                {" · "}
                {groupLine(g, locale)}
                <br />
                <span>{sampleLine(g, locale)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {report.duplicates.total > 0 ? (
        <details>
          <summary>{duplicatesHeadline(report.duplicates, locale)}</summary>
          <p>{t(locale, "These are listed for a data owner to look at. Nothing is merged or hidden.", "Ces paires sont listées pour qu’une personne responsable des données les examine. Rien n’est fusionné ni masqué.")}</p>
          <ul>
            {duplicateLines(report.duplicates, locale).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {report.outliers.total > 0 ? (
        <details>
          <summary>{outliersHeadline(report.outliers, locale)}</summary>
          <p>{t(locale, "A position far from the rest can be a slip in the coordinates. It is listed for a data owner to look at and is not moved or hidden.", "Une position éloignée des autres peut être une erreur de coordonnées. Elle est listée pour qu’une personne responsable des données l’examine ; elle n’est ni déplacée ni masquée.")}</p>
          <ul>
            {outlierLines(report.outliers, locale).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
      {report.gaps.rows.length > 0 ? (
        <details>
          <summary>{t(locale, "What each kind of place leaves out", "Ce que chaque type de lieu laisse de côté")}</summary>
          <ul>
            {gapLines(report.gaps, locale).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </details>
      ) : null}
      <div className="stack" role="group" aria-label={t(locale, "Save a file", "Enregistrer un fichier")}>
        {report.records.length > 0 ? (
          <Button
            variant="secondary"
            onPress={() => save({ name: PACK_CSV_FILENAMES[locale], mime: "text/csv;charset=utf-8", content: packPlacesToCsv(report.records, { bom: true }) })}
          >
            {t(locale, "Save the places (CSV)", "Enregistrer les lieux (CSV)")}
          </Button>
        ) : null}
        <Button variant="secondary" onPress={() => save({ name: names.text, mime: "text/plain;charset=utf-8", content: packReportToText(report, locale) })}>
          {t(locale, "Save this report (text)", "Enregistrer ce rapport (texte)")}
        </Button>
        {report.audit.issues.length > 0 ? (
          <Button variant="secondary" onPress={() => save({ name: names.issues, mime: "text/csv;charset=utf-8", content: issuesToCsv(report, { bom: true }) })}>
            {t(locale, "Save the problems (CSV)", "Enregistrer les problèmes (CSV)")}
          </Button>
        ) : null}
      </div>
      <p role="status">{savedLine}</p>
    </section>
  );
}
