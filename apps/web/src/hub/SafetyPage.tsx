import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { SafetyPanel } from "@access-tools/safety";
import { applyLanguage, type AppLanguage } from "../i18n/index.ts";
import { HubLayout } from "./HubLayout";
import { ToolBoundary } from "./PackageView";

/**
 * The package's SafetyApp keeps its own language, starts in English and writes
 * document.documentElement.lang, which overwrote the shell language on a direct
 * visit in French. SafetyPanel takes the shell language and reports changes back.
 */
export default function SafetyPage() {
  const { t, i18n } = useTranslation("hub");
  const language: AppLanguage = (i18n.resolvedLanguage ?? i18n.language).startsWith("fr") ? "fr" : "en";
  return (
    <HubLayout title={t("safety")}>
      <p>
        {t("journeyNote")}{" "}
        <Link to="/journey" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, minWidth: 44 }}>
          {t("journey")}
        </Link>
      </p>
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        <SafetyPanel language={language} onLanguage={(next) => void applyLanguage(next, true)} />
      </ToolBoundary>
    </HubLayout>
  );
}
