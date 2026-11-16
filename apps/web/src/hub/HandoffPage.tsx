import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { HandoffAudit } from "@access-tools/handoff";
import { demonstrationHandoff, demonstrationRecords } from "@hub/handoff-fixtures";
import { HubLayout } from "./HubLayout";
import { ToolBoundary } from "./PackageView";
import { shellLanguage, useAdoptToolLanguage } from "./shellLanguage";

/**
 * HandoffAudit accepts the shell language as initialLanguage and renders its
 * own h1, but it writes document.documentElement.lang on mount and on change.
 */
export default function HandoffPage() {
  const { t, i18n } = useTranslation("hub");
  const language = shellLanguage(i18n);
  const hostRef = useRef<HTMLDivElement>(null);
  useAdoptToolLanguage(hostRef, language);
  return (
    <HubLayout>
      <p>{t("demonstration")}</p>
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        <div ref={hostRef}>
          <HandoffAudit
            initialLanguage={language}
            initialRecords={demonstrationRecords}
            handoff={demonstrationHandoff}
            asOf="2026-11-15"
          />
        </div>
      </ToolBoundary>
    </HubLayout>
  );
}
