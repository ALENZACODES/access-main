import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./i18n";

export function HubLayout({ title, children }: { title?: string; children: ReactNode }) {
  const { t } = useTranslation("hub");
  return (
    <div style={{ maxWidth: "68rem", margin: "0 auto", padding: "1rem" }}>
      <nav aria-label={t("title")}>
        <Link to="/more" style={{ display: "inline-flex", alignItems: "center", minHeight: 44, minWidth: 44 }}>
          {t("back")}
        </Link>
      </nav>
      {title ? <h1>{title}</h1> : null}
      {children}
    </div>
  );
}
