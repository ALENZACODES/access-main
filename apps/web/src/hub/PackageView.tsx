import { Component, createElement, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { EmbeddedLanguageGate } from "./EmbeddedLanguageGate";
import { HubLayout } from "./HubLayout";

type Language = "en" | "fr";
type ToolProps = {
  language?: Language;
  lang?: Language;
  initialLanguage?: Language;
  initialRecords?: readonly unknown[];
  handoff?: unknown;
  asOf?: string;
};

class ToolBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}

/**
 * The three embedded tools currently own a language selector and an h1.
 * Leave both to the tool; the host's job is to synchronize them before the
 * content becomes visible. Other tool components keep the previous contract.
 */
export function PackageView({ page, component, props }: {
  page: "employment" | "housing" | "safety" | "diary" | "auditors" | "handoff";
  component: ComponentType<ToolProps>;
  props?: ToolProps;
}) {
  const { t, i18n } = useTranslation("hub");
  const language: Language = i18n.language.startsWith("fr") ? "fr" : "en";
  const hasInternalLanguage = page === "housing" || page === "diary" || page === "auditors";
  const demo = page === "employment" || page === "housing" || page === "handoff";
  const tool = createElement(component, { language, lang: language, initialLanguage: language, ...props });
  return (
    <HubLayout title={hasInternalLanguage ? undefined : t(page)}>
      {demo ? <p>{t("demonstration")}</p> : null}
      {page === "safety" ? <p>{t("journeyNote")} <Link to="/journey">{t("journey")}</Link></p> : null}
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        {hasInternalLanguage ? (
          <EmbeddedLanguageGate key={language} language={language}>{tool}</EmbeddedLanguageGate>
        ) : tool}
      </ToolBoundary>
    </HubLayout>
  );
}
