import { SafetyApp } from "@access-tools/safety";
import { PackageView } from "./PackageView";

export default function SafetyPage() {
  return <PackageView page="safety" component={SafetyApp} />;
}
