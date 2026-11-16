import { PEER_TOPICS } from "@access/peers";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { HubLayout } from "./HubLayout";

export default function PeersPage() {
  const { t } = useTranslation("hub");
  return (
    <HubLayout title={t("peers")}>
      <p>{t("peerNotice")}</p>
      <h2>{t("peerTopics")}</h2>
      <ul>{Object.values(PEER_TOPICS).map((topic) => <li key={String(topic)}>{String(topic)}</li>)}</ul>
      <Link to="/help" style={{ display: "inline-flex", minHeight: 44, alignItems: "center" }}>{t("help")}</Link>
    </HubLayout>
  );
}
