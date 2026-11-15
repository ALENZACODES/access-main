import { useTranslation } from "react-i18next";
import { ErrorActions } from "../shell/ErrorActions.tsx";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";

export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t("notFound.title"));
  return (
    <div className="stack">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <ErrorActions state="notFound" />
    </div>
  );
}
