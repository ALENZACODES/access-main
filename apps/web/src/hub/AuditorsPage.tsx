import { App } from "@access-tools/auditors";
import { AuditorsLanguageRegion } from "./AuditorsLanguageRegion";
import { PackageView } from "./PackageView";

/** Keep text-language metadata in the embedded tool, not on the French shell. */
function AuditorsSurface() {
  return (
    <AuditorsLanguageRegion>
      <App />
    </AuditorsLanguageRegion>
  );
}

export default function AuditorsPage() {
  return <PackageView page="auditors" component={AuditorsSurface} />;
}
