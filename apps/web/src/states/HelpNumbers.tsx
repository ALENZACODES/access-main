import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { ChoiceGroup, TextInput } from "../design/fields.tsx";
import { saveTextFile } from "./downloadFile.ts";
import {
  helpDropped, helpHeading, helpLead, helpSaveAudit, helpSaveAuditCsv, helpSaveCsv, helpSaveFailed, helpSaveText, helpSaved, helpSearchHelp, helpSearchLabel, helpSortLabel, helpSortName,
  helpSourceLine, helpToolsLabel, kindLine, nameOrId, noHowNote, noNumberNote, otherLanguageNote, pageLine, saidLine,
} from "./helpCopy.ts";
import { auditToCsv, auditToText } from "./helpAudit.ts";
import { helpFileName, helpToCsv, helpToText } from "./helpExport.ts";
import { EMPTY_HELP_QUERY, HELP_SORTS, isHelpSort, viewHelp, type HelpQuery } from "./helpView.ts";
import { parseHelpNumbers } from "./packHelp.ts";
import type { Locale } from "./stateCopy.ts";

interface Props {
  /** The `help_numbers` array of the pack stored on this device, as read. It is parsed here, not trusted. */
  numbers: unknown;
  locale: Locale;
  /** ISO date for the saved file; defaults to today on this device. */
  today?: string;
}

const localToday = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/**
 * The help numbers saved in the pack, in the order the pack lists them, each as the pack writes it
 * with a reading aloud beside it. Nothing is dialled, linked or fetched. Search and saving are
 * closed until asked for and add no heading while closed or open.
 */
export function HelpNumbers({ numbers, locale, today }: Props) {
  const headingId = useId();
  const toolsId = useId();
  const day = today ?? localToday();
  const parsed = useMemo(() => parseHelpNumbers(numbers), [numbers]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState<HelpQuery>(EMPTY_HELP_QUERY);
  const [saved, setSaved] = useState("");
  const view = useMemo(() => viewHelp(parsed.items, query, locale), [parsed.items, query, locale]);
  if (parsed.items.length === 0 && parsed.dropped === 0) return null;

  const save = (kind: "csv" | "txt" | "audit" | "auditcsv") => {
    const name = kind === "audit" ? `help-numbers-check-${day}.txt` : kind === "auditcsv" ? `help-numbers-check-${day}.csv` : helpFileName(kind, day);
    const content = kind === "auditcsv" ? auditToCsv(parsed.items, day, locale, { bom: true }) : kind === "csv" ? helpToCsv(view.rows.map((r) => r.item), { bom: true }) : kind === "audit" ? auditToText(parsed.items, day, locale) : helpToText(view.rows, day, locale, query);
    const done = saveTextFile({ name, mime: kind === "csv" || kind === "auditcsv" ? "text/csv;charset=utf-8" : "text/plain;charset=utf-8", content });
    setSaved(done ? helpSaved(name, locale) : helpSaveFailed(locale));
  };
  const dropped = helpDropped(parsed.dropped, locale);

  return (
    <section aria-labelledby={headingId} lang={locale} className="stack" data-help-numbers>
      <h2 id={headingId}>{helpHeading(locale)}</h2>
      <p>{helpLead(locale)}</p>
      {parsed.items.length > 0 ? (
        <Button variant="quiet" onPress={() => setOpen((v) => !v)} aria-expanded={open} aria-controls={toolsId}>
          {helpToolsLabel(open, locale)}
        </Button>
      ) : null}
      <div id={toolsId} hidden={!open} className="stack">
        {open ? (
          <>
            <TextInput label={helpSearchLabel(locale)} description={helpSearchHelp(locale)} value={query.text} onChange={(text) => setQuery({ ...query, text })} />
            <ChoiceGroup
              label={helpSortLabel(locale)}
              value={query.sort}
              onChange={(v) => setQuery({ ...query, sort: isHelpSort(v) ? v : "pack" })}
              options={HELP_SORTS.map((s) => ({ value: s, label: helpSortName(s, locale) }))}
            />
            <div className="row">
              <Button variant="secondary" onPress={() => save("txt")}>{helpSaveText(locale)}</Button>
              <Button variant="secondary" onPress={() => save("csv")}>{helpSaveCsv(locale)}</Button>
              <Button variant="secondary" onPress={() => save("audit")}>{helpSaveAudit(locale)}</Button>
              <Button variant="secondary" onPress={() => save("auditcsv")}>{helpSaveAuditCsv(locale)}</Button>
            </div>
            <p aria-live="polite" data-help-saved>{saved}</p>
          </>
        ) : null}
      </div>
      <p aria-live="polite" data-help-count>{view.announcement}</p>
      {dropped ? <p>{dropped}</p> : null}
      <ul className="stack">
        {view.rows.map((row) => {
          const said = saidLine(row, locale);
          const kind = kindLine(row, locale);
          const page = pageLine(row.item, locale);
          const note = row.how ? otherLanguageNote(row.how.lang, locale) : "";
          return (
            <li key={row.item.id} className="stack" data-help-id={row.item.id}>
              <h3 lang={row.name?.lang}>{nameOrId(row, locale)}</h3>
              <p data-help-number>{row.item.contact !== null ? <strong>{row.item.contact}</strong> : noNumberNote(locale)}</p>
              {said ? <p>{said}</p> : null}
              {kind ? <p>{kind}</p> : null}
              <p lang={row.how?.lang}>{row.how?.text ?? noHowNote(locale)}</p>
              {note ? <p>{note}</p> : null}
              {page ? <p>{page}</p> : null}
              <p>{helpSourceLine(row.item, locale)}</p>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
