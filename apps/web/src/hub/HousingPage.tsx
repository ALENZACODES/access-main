import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { HousingFinder } from "@access-tools/housing";
import { HubLayout } from "./HubLayout";
import { ToolBoundary } from "./PackageView";
import { shellLanguage, useAdoptToolLanguage } from "./shellLanguage";

/** HousingFinder starts in English and renders its own h1. */
export default function HousingPage() {
  const { t, i18n } = useTranslation("hub");
  const language = shellLanguage(i18n);
  const hostRef = useRef<HTMLDivElement>(null);
  useAdoptToolLanguage(hostRef, language);
  return (
    <HubLayout>
      <p>{t("demonstration")}</p>
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        <div ref={hostRef}>
          <HousingFinder />
        </div>
      </ToolBoundary>
    </HubLayout>
  );
}
