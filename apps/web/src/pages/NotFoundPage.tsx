import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { useDocumentTitle } from "../shell/useDocumentTitle.ts";

export function NotFoundPage() {
  const { t } = useTranslation();
  useDocumentTitle(t("notFound.title"));
  return (
    <div className="stack">
      <h1>{t("notFound.title")}</h1>
      <p>{t("notFound.body")}</p>
      <Link className="text-link" to="/">{t("notFound.home")}</Link>
    </div>
  );
}
