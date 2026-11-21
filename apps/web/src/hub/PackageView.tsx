import { Component, createElement, useLayoutEffect, useRef, type ComponentType, type ReactNode } from "react";
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

/**
 * Employment and auditor tool packages currently supply more than one form
 * without names. Name the actual mounted forms, not just the surrounding
 * section: otherwise they remain indistinguishable as form landmarks.
 *
 * Preserve existing authored names and derive each fallback from the tool's
 * translated title and the form's visible legend, heading or field label.
 * Never use values entered by a person. Dynamic package renders are handled
 * without listening to or retaining form inputs.
 */
function labelUnnamedToolForms(host: HTMLElement, title: string, language: "en" | "fr"): void {
  const forms = Array.from(host.querySelectorAll("form"));
  for (const [index, form] of forms.entries()) {
    const generated = form.hasAttribute("data-hub-generated-form-name");
    if (!generated && (form.getAttribute("aria-label")?.trim() ||
        form.getAttribute("aria-labelledby")?.trim() || form.getAttribute("title")?.trim())) continue;
    const first = form.querySelector("legend,h2,h3,label");
    const purpose = first?.textContent?.replace(/\s+/g, " ").trim().slice(0, 80) ||
      (language === "fr" ? "Formulaire" : "Form");
    form.setAttribute("data-hub-generated-form-name", "true");
    form.setAttribute("aria-label", `${title} — ${purpose} ${index + 1}`);
  }
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
  const toolRoot = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    if (page !== "employment" && page !== "auditors") return;
    const host = toolRoot.current;
    if (!host) return;
    const nameForms = (): void => labelUnnamedToolForms(host, t(page), language);
    nameForms();
    const observer = new MutationObserver(nameForms);
    observer.observe(host, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [page, t, language]);

  return (
    <HubLayout title={t(page)}>
      {demo && <p>{t("demonstration")}</p>}
      {page === "safety" && <p>{t("journeyNote")} <Link to="/journey">{t("journey")}</Link></p>}
      {children}
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        <div className="hub-tool" ref={toolRoot}>
          <style>{FIT}</style>
          {createElement(component as ComponentType<ToolProps>, { language, lang: language, initialLanguage: language, ...props })}
        </div>
      </ToolBoundary>
    </HubLayout>
  );
}
