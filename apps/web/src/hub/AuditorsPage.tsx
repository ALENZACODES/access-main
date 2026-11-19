import { App } from "@access-tools/auditors";
import { AuditorsEnglishBoundary } from "./AuditorsEnglishBoundary";
import { PackageView } from "./PackageView";

function EmbeddedAuditors() {
  return <AuditorsEnglishBoundary><App /></AuditorsEnglishBoundary>;
}

export default function AuditorsPage() {
  return <PackageView page="auditors" component={EmbeddedAuditors} />;
}
