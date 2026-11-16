import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";

export function Message({ name }: { name: "pending" | "unavailable" }): ReactNode {
  const { t } = useTranslation();
  return <p role="status">{t(`features.${name}`)}</p>;
}

