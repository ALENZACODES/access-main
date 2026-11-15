import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ReviewScreen } from "./ReviewScreen.tsx";
import { catalogs, type Locale } from "./catalogs.ts";
import { demonstrationReport } from "./demo.ts";
import type { ReconcileReport } from "./types.ts";

function Demo() {
  const locale: Locale = location.search.includes("lang=fr") ? "fr" : "en";
  document.documentElement.lang = locale;
  const [report, setReport] = useState<ReconcileReport | null>(location.search.includes("empty=1") ? null : demonstrationReport);
  return <>
    <p style={{ padding: "1rem", fontFamily: "system-ui" }}>{catalogs[locale].demo}</p>
    <ReviewScreen report={report} locale={locale} onResolved={setReport} />
  </>;
}
createRoot(document.getElementById("root")!).render(<Demo />);
