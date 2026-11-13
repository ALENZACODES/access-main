import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useRegisterSW } from "virtual:pwa-register/react";
import { Button } from "../design/Button.tsx";

export function UpdatePrompt() {
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(false);
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker,
  } = useRegisterSW();

  if (needRefresh && !dismissed) {
    return (
      <div className="banner" role="region" aria-label={t("update.region")}>
        <p>{t("update.body")}</p>
        <div className="button-row">
          <Button onPress={() => void updateServiceWorker(true)}>{t("update.reload")}</Button>
          <Button variant="secondary" onPress={() => { setNeedRefresh(false); setDismissed(true); }}>{t("update.later")}</Button>
        </div>
      </div>
    );
  }

  if (offlineReady && !dismissed) {
    return (
      <div className="banner" role="status">
        <p>{t("update.offlineReady")}</p>
        <Button variant="quiet" onPress={() => setOfflineReady(false)}>{t("update.later")}</Button>
      </div>
    );
  }

  return null;
}
