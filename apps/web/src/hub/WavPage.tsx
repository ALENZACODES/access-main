import { WavFinder, loadWavDataset } from "@access-maps/conditions";
import dataset from "@hub/wav-dataset";
import { useTranslation } from "react-i18next";
import { PackageView } from "./PackageView";

/** The published dataset only. A file that fails the package's own checks shows no services. */
function publishedRecords(): { records: unknown[]; valid: boolean } {
  try {
    return { records: loadWavDataset(dataset), valid: true };
  } catch {
    return { records: [], valid: false };
  }
}

export default function WavPage() {
  const { t } = useTranslation("hub");
  const { records, valid } = publishedRecords();
  return (
    <PackageView page="wav" component={WavFinder} props={{ records }}>
      <p>{t("wavNote")}</p>
      {!valid ? <p role="alert">{t("wavInvalid")}</p> : records.length === 0 ? <p>{t("wavEmpty")}</p> : null}
    </PackageView>
  );
}
