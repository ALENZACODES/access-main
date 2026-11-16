import { ConnectionRequestStore } from "@access/peers";
import { PeerRequestFlow } from "@hub/peers-ui";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link } from "react-router-dom";
import { PackageView } from "./PackageView";

/** The package's on-device history, or none when this browser blocks storage. Without it a request lasts only while the page is open. */
function deviceStore(): ConnectionRequestStore | undefined {
  try {
    return globalThis.localStorage ? new ConnectionRequestStore(globalThis.localStorage) : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The package's own rules for its choice rows, without its colours: each label that holds a checkbox or a
 * radio is at least 44 px high and the box is 24 px, so every target meets WCAG 2.2 SC 2.5.8 in the shell.
 */
const CHOICE_TARGETS = `
.hub-tool .peer-connect label.peer-check { display: flex; align-items: center; gap: 0.75rem; min-height: 44px; }
.hub-tool .peer-connect .peer-check input { width: 24px; height: 24px; margin: 0; flex: none; }
`;

/**
 * The access-help peer request flow. The person prepares a summary on this device and shares it themselves.
 * The routing table is the package's recorded one, which holds no streams, so every request routes to Unknown.
 */
export default function PeerRequestPage() {
  const { t } = useTranslation("hub");
  const [store] = useState(deviceStore);
  return (
    <PackageView page="peerRequest" component={PeerRequestFlow} props={store ? { store } : {}}>
      <style>{CHOICE_TARGETS}</style>
      <p>{t("peerRequestNote")}</p>
      <p>
        <Link to="/more/peers" style={{ display: "inline-flex", minHeight: 44, alignItems: "center" }}>{t("peerRequestTopics")}</Link>
      </p>
    </PackageView>
  );
}
