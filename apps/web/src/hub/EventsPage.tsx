import { DEMONSTRATION_RECORDS } from "@access/event-access";
import { useTranslation } from "react-i18next";
import { HubLayout } from "./HubLayout";

export default function EventsPage() {
  const { t } = useTranslation("hub");
  return (
    <HubLayout title={t("events")}>
      <p>{t("demonstration")}</p>
      <p>{t("eventNotice")}</p>
      {!Array.isArray(DEMONSTRATION_RECORDS) || DEMONSTRATION_RECORDS.length === 0 ? <p>{t("noListings")}</p> : (
        <ul>
          {DEMONSTRATION_RECORDS.map((_record, index) => (
            <li key={index}>
              <h2>{t("eventNumber", { number: index + 1 })}</h2>
              <p>{t("dataUnavailable")}</p>
            </li>
          ))}
        </ul>
      )}
    </HubLayout>
  );
}
