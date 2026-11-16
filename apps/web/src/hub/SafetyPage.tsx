import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SafetyPanel } from "@access-tools/safety";
import { applyLanguage, type AppLanguage } from "../i18n/index.ts";
import { HubLayout } from "./HubLayout";
import { ToolBoundary } from "./PackageView";

/**
 * The package's SafetyApp starts in English and writes document.documentElement.lang,
 * which would overwrite the shell language. SafetyPanel accepts the shell language
 * and keeps a single h1 (HubLayout's title is omitted for that reason).
 */
export default function SafetyPage() {
  const { t, i18n } = useTranslation("hub");
  const language: AppLanguage = i18n.resolvedLanguage?.startsWith("fr") || i18n.language.startsWith("fr") ? "fr" : "en";
  return (
    <HubLayout>
      <p>
        {t("journeyNote")} <Link to="/journey">{t("journey")}</Link>
      </p>
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        <SafetyPanel language={language} onLanguage={(next) => void applyLanguage(next, true)} />
      </ToolBoundary>
    </HubLayout>
  );
}
