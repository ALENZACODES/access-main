import { HousingFinder } from "@access-tools/housing";
import { PackageView } from "./PackageView";

export default function HousingPage() {
  return <PackageView page="housing" component={HousingFinder} />;
}
