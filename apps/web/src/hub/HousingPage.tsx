import { HousingFinder } from "@access-tools/housing";
import { HousingLanguageBoundary } from "./HousingLanguageBoundary";
import { PackageView } from "./PackageView";

/** Local integration boundary: do not replace or reinterpret upstream records. */
function HousingWithLanguageAnnotations() {
  return (
    <HousingLanguageBoundary>
      <HousingFinder />
    </HousingLanguageBoundary>
  );
}

export default function HousingPage() {
  return <PackageView page="housing" component={HousingWithLanguageAnnotations} />;
}
