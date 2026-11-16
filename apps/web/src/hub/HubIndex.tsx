import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./i18n";

const sections = [
  { key: "everyday", pages: ["employment", "housing", "diary", "auditors", "handoff"] },
  { key: "travel", pages: ["safety"] },
  { key: "community", pages: ["peers", "events"] },
] as const;

export function HubIndex() {
  const { t } = useTranslation("hub");
  return (
    <div style={{ maxWidth: "68rem", margin: "0 auto", padding: "1rem" }}>
      <h1>{t("title")}</h1>
      <p>{t("intro")}</p>
      {sections.map((section) => (
        <section key={section.key} aria-labelledby={`hub-${section.key}`}>
          <h2 id={`hub-${section.key}`}>{t(section.key)}</h2>
          <ul style={{ listStyle: "none", padding: 0, display: "grid", gap: "0.75rem", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 16rem), 1fr))" }}>
            {section.pages.map((page) => (
              <li key={page}>
                <Link to={`/more/${page}`} style={{ display: "block", padding: "0.8rem", minHeight: 44, border: "1px solid currentColor", borderRadius: "0.35rem" }}>
                  <strong>{t(page)}</strong>
                  <span style={{ display: "block" }}>{t(`${page}Description`)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
