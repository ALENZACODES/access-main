import { useId, useState } from "react";
import { Button } from "../design/Button.tsx";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";
import { type ViewParts, parseViewCode, viewKeys, viewToCode } from "./viewCode.ts";
import { viewAppliedStatus, viewAppliedText, viewIgnoredText } from "./viewCodeCopy.ts";

interface Props {
  /** What the page shows now. The typed starting point is not part of it. */
  view: ViewParts;
  locale: Locale;
  onApply: (view: ViewParts) => void;
}

/** Share the current search and filters as text, or read a code from someone else. Nothing changes until the button is pressed. */
export function ViewCode({ view, locale, onApply }: Props) {
  const panelId = useId();
  const pasteId = useId();
  const codeId = useId();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");

  const code = viewToCode(view);
  const parsed = parseViewCode(pasted);
  const n = viewKeys(view).length;

  const doApply = () => {
    onApply(parsed.view);
    setStatus(viewAppliedStatus(locale));
    setPasted("");
  };

  return (
    <div data-view-code>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {t(locale, "Share or load a view", "Partager ou charger une vue")}
      </Button>
      <div id={panelId} hidden={!open}>
        {open ? (
          <>
            <p>{t(locale, "Plain text. It has no starting point, and using one replaces your search and filters.", "Du texte, sans point de départ. L’utiliser remplace votre recherche et vos filtres.")}</p>
            {n === 0 ? (
              <p>{t(locale, "No search or filter is set.", "Aucune recherche ni aucun filtre.")}</p>
            ) : (
              <>
                <label htmlFor={codeId}>{t(locale, "View code (select to copy)", "Code de vue (à sélectionner pour copier)")}</label>
                <textarea id={codeId} readOnly rows={6} value={code} onFocus={(e) => e.currentTarget.select()} />
              </>
            )}
            <label htmlFor={pasteId}>{t(locale, "Paste a view code here", "Collez un code de vue ici")}</label>
            <textarea id={pasteId} rows={5} value={pasted} placeholder={"VIEW v1\nsearch: …"} onChange={(e) => setPasted(e.target.value)} />
            {pasted.trim() !== "" ? (
              <div data-view-code-plan>
                <p>{viewAppliedText(parsed.applied.length, locale)}</p>
                {parsed.ignored.length > 0 ? <p>{viewIgnoredText(parsed.ignored, locale)}</p> : null}
                <Button variant="secondary" isDisabled={!parsed.ok} onPress={doApply}>
                  {t(locale, "Use this view", "Utiliser cette vue")}
                </Button>
              </div>
            ) : null}
            <p aria-live="polite" data-view-code-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
