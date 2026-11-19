import { Button } from "../design/Button.tsx";
import type { Hint } from "./hints.ts";
import { message } from "./messages.ts";
import type { Locale } from "./stateCopy.ts";

interface Props {
  hints: readonly Hint[];
  locale: Locale;
  /** Called with the hint's label; the page puts it in the search box and searches. */
  onPick: (label: string) => void;
}

/**
 * Other things to search for, shown under an empty result. Each is a 44 px
 * button. Nothing is shown when there are no hints, so an empty state never
 * grows an empty heading.
 */
export function SuggestionList({ hints, locale, onPick }: Props) {
  if (hints.length === 0) return null;
  return (
    <div className="stack" lang={locale} data-suggestions>
      <p>{message("hint.didYouMean", locale)}</p>
      <ul className="error-actions">
        {hints.map((hint) => (
          <li key={hint.key}>
            <Button variant="secondary" onPress={() => onPick(hint.label)}>
              {message("hint.pick", locale, { name: hint.label })}
            </Button>
          </li>
        ))}
      </ul>
    </div>
  );
}
