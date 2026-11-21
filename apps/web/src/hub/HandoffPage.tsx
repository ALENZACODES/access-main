import { HandoffAudit } from "@access-tools/handoff";
import { demonstrationHandoff, demonstrationRecords } from "@hub/handoff-fixtures";
import { PackageView } from "./PackageView";

export default function HandoffPage() {
  return (
    <PackageView
      page="handoff"
      component={HandoffAudit}
      props={{
        initialRecords: demonstrationRecords,
        handoff: demonstrationHandoff,
        asOf: "2026-11-15",
      }}
    />
  );
}
