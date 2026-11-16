import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { Diary } from "@access-tools/diary";
import { HubLayout } from "./HubLayout";
import { ToolBoundary } from "./PackageView";
import { shellLanguage, useAdoptToolLanguage } from "./shellLanguage";

/** Diary starts in English and renders its own h1. */
export default function DiaryPage() {
  const { t, i18n } = useTranslation("hub");
  const language = shellLanguage(i18n);
  const hostRef = useRef<HTMLDivElement>(null);
  useAdoptToolLanguage(hostRef, language);
  return (
    <HubLayout>
      <ToolBoundary fallback={<p role="alert">{t("error")}</p>}>
        <div ref={hostRef}>
          <Diary />
        </div>
      </ToolBoundary>
    </HubLayout>
  );
}
