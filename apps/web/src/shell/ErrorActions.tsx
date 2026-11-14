import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { Button } from "../design/Button.tsx";
import { ERROR_STATES, type ErrorState } from "./errorStates.ts";

interface Props {
  state: ErrorState["id"];
  onRetry?: () => void;
  /** Runs before a link navigates, for example to reset an error boundary. */
  onNavigate?: () => void;
}

/** Renders the next actions listed for an error state. A retry action needs `onRetry`. */
export function ErrorActions({ state, onRetry, onNavigate }: Props) {
  const { t } = useTranslation();
  const actions = ERROR_STATES[state].actions;
  return (
    <ul className="error-actions">
      {actions.map((action) => (
        <li key={action.labelKey}>
          {action.kind === "link" ? (
            <Link className="text-link" to={action.to} onClick={onNavigate}>
              {t(action.labelKey)}
            </Link>
          ) : onRetry ? (
            <Button variant="secondary" onPress={onRetry}>
              {t(action.labelKey)}
            </Button>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
