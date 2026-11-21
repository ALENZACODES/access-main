import { HousingFinder } from "@access-tools/housing";
import { HousingLanguageBoundary } from "./HousingLanguageBoundary";
import { PackageView } from "./PackageView";

/** Wrap only the housing embed; do not alter the shared shell or other tools. */
function HousingWithLanguageBoundary() {
  return <HousingLanguageBoundary><HousingFinder /></HousingLanguageBoundary>;
}

export default function HousingPage() {
  return <PackageView page="housing" component={HousingWithLanguageBoundary} />;
}
