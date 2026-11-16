import { App } from "@access-tools/auditors";
import { PackageView } from "./PackageView";

export default function AuditorsPage() {
  return <PackageView page="auditors" component={App} />;
}
