import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { MARKS_CODE_HEADER, marksImportSummary, marksToCode, parseMarksCode, plannedLine, planMarksImport } from "./marksTransfer.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";
import type { VisitMarksState } from "./useVisitMarks.ts";

interface Props {
  /** Every place the pack holds. A pasted mark is checked against these, not only against the listed places. */
  places: readonly PackPlaceRecord[];
  state: VisitMarksState;
  locale: Locale;
  /** Writes text to the clipboard. Defaults to the browser's; returns false when it cannot. */
  copy?: (text: string) => Promise<boolean>;
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

/**
 * Move the marks to or from another device as text. Copying makes a marks code; pasting one shows
 * what would be set, and nothing is set until the person presses the button. Closed until asked for.
 */
export function MarksTransfer({ places, state, locale, copy = browserCopy }: Props) {
  const panelId = useId();
  const pasteId = useId();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");
  const [shown, setShown] = useState<string | null>(null);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p] as const)), [places]);
  const code = useMemo(() => marksToCode(state.marks.flatMap((m) => (byId.has(m.id) ? [{ id: m.id, status: m.status, name: byId.get(m.id)!.name }] : []))), [state.marks, byId]);
  const markCount = state.marks.filter((m) => byId.has(m.id)).length;
  const parsed = useMemo(() => parseMarksCode(pasted), [pasted]);
  const plan = useMemo(() => planMarksImport(parsed, state.marks, new Set(byId.keys())), [parsed, state.marks, byId]);

  const doCopy = async () => {
    const ok = await copy(code);
    setShown(ok ? null : code);
    setStatus(ok ? t(locale, "Marks code copied.", "Code de marques copié.") : t(locale, "This browser could not copy. The code is shown below so you can select it.", "Ce navigateur n’a pas pu copier. Le code est affiché ci-dessous pour que vous puissiez le sélectionner."));
  };
  const doSet = () => {
    let set = 0;
    for (const s of plan.toSet) if (state.set(s.id, s.status) === "set") set += 1;
    setPasted("");
    setStatus(t(locale, `${set} ${set === 1 ? "mark" : "marks"} set.`, `${set} ${set === 1 ? "marque appliquée" : "marques appliquées"}.`));
  };

  return (
    <div data-marks-transfer>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide moving your marks", "Masquer le transfert des marques") : t(locale, "Move your marks to another device", "Transférer vos marques vers un autre appareil")}
      </Button>
      <div id={panelId} hidden={!open}>
        {open ? (
          <>
            <p>{t(locale, "A marks code is plain text with place ids, your marks and place names. It holds nothing else about you.", "Un code de marques est du texte brut avec des identifiants de lieux, vos marques et des noms de lieux. Il ne contient rien d’autre sur vous.")}</p>
            {markCount > 0 ? (
              <Button variant="secondary" onPress={doCopy}>
                {t(locale, `Copy a code for your ${markCount} ${markCount === 1 ? "mark" : "marks"}`, `Copier un code pour ${markCount} ${markCount === 1 ? "marque" : "marques"}`)}
              </Button>
            ) : (
              <p>{t(locale, "You have no marks on places in the pack, so there is no code to copy.", "Vous n’avez aucune marque sur un lieu du pack : il n’y a donc aucun code à copier.")}</p>
            )}
            {shown !== null ? <textarea readOnly aria-label={t(locale, "Marks code", "Code de marques")} rows={Math.min(14, shown.split("\n").length)} value={shown} onFocus={(e) => e.currentTarget.select()} /> : null}
            <label htmlFor={pasteId}>{t(locale, "Paste a marks code here", "Collez un code de marques ici")}</label>
            <textarea id={pasteId} rows={5} value={pasted} placeholder={`${MARKS_CODE_HEADER}\n- id | to-visit | name`} onChange={(e) => setPasted(e.target.value)} />
            {pasted.trim() !== "" ? (
              <div data-marks-transfer-plan>
                <p>{marksImportSummary(plan, parsed, locale)}</p>
                {plan.toSet.length > 0 ? (
                  <ul>
                    {plan.toSet.map((s) => (
                      <li key={s.id}>{plannedLine(byId.get(s.id)?.name ?? "UNKNOWN", s.status, s.replaces, locale)}</li>
                    ))}
                  </ul>
                ) : null}
                <Button variant="secondary" isDisabled={plan.toSet.length === 0} onPress={doSet}>
                  {t(locale, `Set ${plan.toSet.length} ${plan.toSet.length === 1 ? "mark" : "marks"}`, `Appliquer ${plan.toSet.length} ${plan.toSet.length === 1 ? "marque" : "marques"}`)}
                </Button>
              </div>
            ) : null}
            <p aria-live="polite" data-marks-transfer-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
