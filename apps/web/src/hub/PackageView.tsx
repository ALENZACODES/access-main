import { Component, createElement, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { HubLayout } from "./HubLayout";

type ToolProps = {
  language?: "en" | "fr";
  lang?: "en" | "fr";
  initialLanguage?: "en" | "fr";
  initialRecords?: readonly unknown[];
  handoff?: unknown;
  asOf?: string;
};

class ToolBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

export function PackageView({ page, component, props }: {
  page: "employment" | "housing" | "safety" | "diary" | "auditors" | "handoff";
  component: ComponentType<ToolProps>;
  props?: ToolProps;
}) {
  const { t, i18n } = useTranslation("hub");
  const language = i18n.resolvedLanguage?.startsWith("fr") ? "fr" : "en";
  const demo = page === "employment" || page === "housing" || page === "handoff";
  return (
    <HubLayout>
      {demo && <p>{t("demonstration")}</p>}
      {page === "safety" && <p>{t("journeyNote")} <Link to="/journey">{t("journey")}</Link></p>}
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        {createElement(component, { language, lang: language, initialLanguage: language, ...props })}
      </ToolBoundary>
    </HubLayout>
  );
}
