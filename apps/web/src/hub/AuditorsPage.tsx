import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { App } from "@access-tools/auditors";
import { HubLayout } from "./HubLayout";
import { ToolBoundary } from "./PackageView";
import { shellLanguage, useAdoptToolLanguage } from "./shellLanguage";

/**
 * The auditors App starts in English, renders its own h1, and writes
 * document.documentElement.lang when the language control changes.
 */
export default function AuditorsPage() {
  const { t, i18n } = useTranslation("hub");
  const language = shellLanguage(i18n);
  const hostRef = useRef<HTMLDivElement>(null);
  useAdoptToolLanguage(hostRef, language);
  return (
    <HubLayout>
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        <div ref={hostRef}>
          <App />
        </div>
      </ToolBoundary>
    </HubLayout>
  );
}
