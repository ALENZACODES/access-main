import { EventOutingPlanner } from "@access/outings";
import { useTranslation } from "react-i18next";
import { PackageView } from "./PackageView";

export default function EventPlanPage() {
  const { t } = useTranslation("hub");
  return (
    <PackageView page="eventPlan" component={EventOutingPlanner}>
      <p>{t("eventPlanNote")}</p>
    </PackageView>
  );
}
