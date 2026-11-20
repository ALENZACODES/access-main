import { useId, useState } from "react";
import { Button } from "../design/Button.tsx";
import { type LetterItem, buildLetterIndex, letterButtonName, showLetterIndex } from "./letterIndex.ts";
import type { Locale } from "./stateCopy.ts";
import { t } from "./typography.ts";

interface Props {
  /** The places in the order the list shows them. */
  items: readonly LetterItem[];
  locale: Locale;
  /** CSS selector of the list whose items are the places. */
  listSelector?: string;
}

/** Moves focus to the heading of the nth place in the list. Returns false when there is no such place. */
export function focusPlaceAt(list: Element | null, index: number): boolean {
  const heading = list?.children.item(index)?.querySelector("h3") ?? null;
  if (heading === null) return false;
  heading.setAttribute("tabindex", "-1");
  heading.focus();
  heading.scrollIntoView?.({ block: "start" });
  return true;
}

/** One button for each first letter of the shown names. It only moves focus; it never changes the list. */
export function LetterJump({ items, locale, listSelector = "ul.record-list" }: Props) {
  const labelId = useId();
  const [status, setStatus] = useState("");
  const groups = buildLetterIndex(items);
  if (!showLetterIndex(groups, items.length)) return null;

  const jump = (index: number, key: string) => {
    const ok = focusPlaceAt(document.querySelector(listSelector), index);
    setStatus(ok ? t(locale, `Moved to the first place under ${key}.`, `Déplacé vers le premier lieu sous ${key}.`) : t(locale, "That place is not on the page.", "Ce lieu n’est pas sur la page."));
  };

  return (
    <nav aria-labelledby={labelId} data-letter-jump>
      <p id={labelId}>
        <strong>{t(locale, "Jump to a place by its first letter", "Aller à un lieu par sa première lettre")}</strong>
      </p>
      <ul style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", listStyle: "none", padding: 0, margin: 0 }}>
        {groups.map((g) => (
          <li key={g.key}>
            <Button variant="quiet" aria-label={letterButtonName(g, locale)} onPress={() => jump(g.firstIndex, g.key)}>
              {g.key}
            </Button>
          </li>
        ))}
      </ul>
      <p aria-live="polite" data-letter-jump-status>
        {status}
      </p>
    </nav>
  );
}
