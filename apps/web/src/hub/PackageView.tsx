import { Component, createElement, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { HubLayout } from "./HubLayout";

/** Props the shell passes to a mounted tool. Each tool reads the language prop it knows and ignores the rest. */
type ToolProps = Record<string, unknown>;

export type HubPage =
  | "employment" | "housing" | "safety" | "diary" | "auditors" | "handoff"
  | "games" | "routeReports" | "wav" | "eventOrganiser" | "eventPlan" | "reports" | "peerRequest";

/** Pages whose records are labelled demonstration or sample data. */
const DEMONSTRATION: readonly HubPage[] = ["employment", "housing", "handoff", "eventPlan", "reports"];

/**
 * Keeps a mounted tool inside a 320 px wide page: long choices and grouped fields shrink to the page
 * instead of moving the whole page sideways.
 */
const FIT = `
.hub-tool :is(select, input, textarea, button) { max-width: 100%; }
.hub-tool fieldset { min-width: 0; }
`;

export class ToolBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PackageView<P extends object>({ page, component, props, children }: {
  page: HubPage;
  component: ComponentType<P>;
  props?: ToolProps;
  /** Shell notes shown above the tool, inside the same error boundary page. */
  children?: ReactNode;
}) {
  const { t, i18n } = useTranslation("hub");
  const language = i18n.resolvedLanguage?.startsWith("fr") ? "fr" : "en";
  const demo = DEMONSTRATION.includes(page);
  return (
    <HubLayout title={t(page)}>
      {demo && <p>{t("demonstration")}</p>}
      {page === "safety" && <p>{t("journeyNote")} <Link to="/journey">{t("journey")}</Link></p>}
      {children}
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        <div className="hub-tool">
          <style>{FIT}</style>
          {createElement(component as ComponentType<ToolProps>, { language, lang: language, initialLanguage: language, ...props })}
        </div>
      </ToolBoundary>
    </HubLayout>
  );
}
