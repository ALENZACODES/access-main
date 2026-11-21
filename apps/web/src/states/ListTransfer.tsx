import { useId, useMemo, useState } from "react";
import { Button } from "../design/Button.tsx";
import { LIST_CODE_HEADER, importSummary, listToCode, parseListCode, planImport } from "./listTransfer.ts";
import type { PackPlaceRecord } from "./packPlaces.ts";
import { type AddResult, type ShortlistEntry } from "./shortlist.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  list: readonly ShortlistEntry[];
  places: readonly PackPlaceRecord[];
  locale: Locale;
  add: (id: string) => AddResult;
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
 * Move the list to or from another device as text. Copying makes a list code; pasting one shows
 * what would be added, and nothing is added until the person presses the button.
 */
export function ListTransfer({ list, places, locale, add, copy = browserCopy }: Props) {
  const panelId = useId();
  const pasteId = useId();
  const [open, setOpen] = useState(false);
  const [pasted, setPasted] = useState("");
  const [status, setStatus] = useState("");
  const [shown, setShown] = useState<string | null>(null);

  const byId = useMemo(() => new Map(places.map((p) => [p.id, p] as const)), [places]);
  const code = useMemo(() => listToCode(list.flatMap((e) => (byId.has(e.id) ? [{ id: e.id, name: byId.get(e.id)!.name }] : []))), [list, byId]);
  const parsed = useMemo(() => parseListCode(pasted), [pasted]);
  const plan = useMemo(() => planImport(parsed.ids, list.map((e) => e.id), new Set(byId.keys())), [parsed, list, byId]);
  const listedCount = list.filter((e) => byId.has(e.id)).length;

  const doCopy = async () => {
    const ok = await copy(code);
    setShown(ok ? null : code);
    setStatus(ok ? t(locale, "List code copied.", "Code de liste copié.") : t(locale, "This browser could not copy. The code is shown below so you can select it.", "Ce navigateur n’a pas pu copier. Le code est affiché ci-dessous pour que vous puissiez le sélectionner."));
  };

  const doAdd = () => {
    let added = 0;
    for (const id of plan.toAdd) if (add(id) === "added") added += 1;
    setPasted("");
    setStatus(t(locale, `${added} ${added === 1 ? "place" : "places"} added to your list.`, `${added} ${added === 1 ? "lieu ajouté" : "lieux ajoutés"} à votre liste.`));
  };

  const names = plan.toAdd.map((id) => byId.get(id)?.name ?? "UNKNOWN");

  return (
    <div data-list-transfer>
      <Button variant="quiet" aria-expanded={open} aria-controls={panelId} onPress={() => setOpen((v) => !v)}>
        {open ? t(locale, "Hide moving your list", "Masquer le transfert de la liste") : t(locale, "Move your list to another device", "Transférer votre liste vers un autre appareil")}
      </Button>
      <div id={panelId} hidden={!open}>
        {open ? (
          <>
            <p>{t(locale, "A list code is plain text with place ids and names. It holds nothing about you.", "Un code de liste est du texte brut avec des identifiants et des noms de lieux. Il ne contient rien sur vous.")}</p>
            {listedCount > 0 ? (
              <Button variant="secondary" onPress={doCopy}>
                {t(locale, `Copy a code for your ${listedCount} ${listedCount === 1 ? "place" : "places"}`, `Copier un code pour ${listedCount} ${listedCount === 1 ? "lieu" : "lieux"}`)}
              </Button>
            ) : (
              <p>{t(locale, "Your list is empty, so there is no code to copy.", "Votre liste est vide\u00a0: il n’y a donc aucun code à copier.")}</p>
            )}
            {shown !== null ? <textarea readOnly aria-label={t(locale, "List code", "Code de liste")} rows={Math.min(14, shown.split("\n").length)} value={shown} onFocus={(e) => e.currentTarget.select()} /> : null}
            <label htmlFor={pasteId}>{t(locale, "Paste a list code here", "Collez un code de liste ici")}</label>
            <textarea id={pasteId} rows={5} value={pasted} placeholder={`${LIST_CODE_HEADER}\n- id | name`} onChange={(e) => setPasted(e.target.value)} />
            {pasted.trim() !== "" ? (
              <div data-list-transfer-plan>
                <p>{importSummary(plan, parsed, locale)}</p>
                {names.length > 0 ? (
                  <ul>
                    {names.map((n, i) => (
                      <li key={plan.toAdd[i]}>{n}</li>
                    ))}
                  </ul>
                ) : null}
                <Button variant="secondary" isDisabled={plan.toAdd.length === 0} onPress={doAdd}>
                  {t(locale, `Add ${plan.toAdd.length} to your list`, `Ajouter ${plan.toAdd.length} à votre liste`)}
                </Button>
              </div>
            ) : null}
            <p aria-live="polite" data-list-transfer-status>
              {status}
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
