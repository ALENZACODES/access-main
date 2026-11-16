import { EmploymentView } from "@access-tools/employment";
import { PackageView } from "./PackageView";

export default function EmploymentPage() {
  return <PackageView page="employment" component={EmploymentView} />;
}
