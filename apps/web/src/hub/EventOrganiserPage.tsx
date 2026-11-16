import { OrganiserForm } from "@hub/event-access-ui";
import { useTranslation } from "react-i18next";
import { PackageView } from "./PackageView";

/** Today on this device, YYYY-MM-DD, in local time. */
export function localToday(now: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

export default function EventOrganiserPage() {
  const { t } = useTranslation("hub");
  return (
    <PackageView page="eventOrganiser" component={OrganiserForm} props={{ today: localToday() }}>
      <p>{t("eventOrganiserNote")}</p>
    </PackageView>
  );
}
