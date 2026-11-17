import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import "./i18n";

/** Each entry is a string-catalogue key and the path under /more. */
const sections = [
  { key: "everyday", pages: [["employment", "employment"], ["housing", "housing"], ["diary", "diary"], ["auditors", "auditors"], ["handoff", "handoff"], ["games", "games"]] },
  { key: "travel", pages: [["safety", "safety"], ["routeReports", "route-reports"], ["wav", "accessible-taxis"]] },
  { key: "community", pages: [["peers", "peers"], ["peerRequest", "peer-request"], ["events", "events"], ["eventOrganiser", "event-organiser"], ["eventPlan", "event-plan"], ["reports", "reports"]] },
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
            {section.pages.map(([page, path]) => (
              <li key={page}>
                <Link to={`/more/${path}`} style={{ display: "block", padding: "0.8rem", minHeight: 44, border: "1px solid currentColor", borderRadius: "0.35rem" }}>
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
