import { Link } from "react-router-dom";
import { Button } from "../design/Button.tsx";
import { ACTION_LINKS, type ActionId, type StateView } from "./stateCopy.ts";

interface Props {
  view: StateView;
  /** Handlers for actions that are not links (retry, clear-search, change-trip, go-back). */
  onAction?: Partial<Record<ActionId, () => void>>;
  /** Language of the copy, so the heading is read in the right language. */
  lang: "en" | "fr";
}

/**
 * One consistent error or empty state: a heading, one sentence, and next
 * actions. Errors are announced (role="alert"); empty states are polite
 * (role="status"). Every action is a 44 px link or button. An action with no
 * link and no handler is not shown, so nothing on screen does nothing.
 */
export function StateNotice({ view, onAction = {}, lang }: Props) {
  const actions = view.actions.filter((action) => ACTION_LINKS[action.id] !== undefined || onAction[action.id] !== undefined);
  return (
    <section className="panel state-notice" lang={lang} aria-labelledby="state-notice-title" data-state-role={view.role}>
      <div role={view.role}>
        <h2 id="state-notice-title">{view.title}</h2>
        <p>{view.description}</p>
      </div>
      {actions.length > 0 ? (
        <ul className="error-actions">
          {actions.map((action) => {
            const to = ACTION_LINKS[action.id];
            return (
              <li key={action.id}>
                {to !== undefined ? (
                  <Link className="text-link" to={to}>{action.label}</Link>
                ) : (
                  <Button variant="secondary" onPress={onAction[action.id]}>{action.label}</Button>
                )}
              </li>
            );
          })}
        </ul>
      ) : null}
    </section>
  );
}
