import Ajv2020 from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { describe, expect, it } from "vitest";
import { outboxItem, outboxItemSchema } from "./outbox.ts";

const ajv = new Ajv2020({ allErrors: true, strict: true });
addFormats(ajv);
const validate = ajv.compile(outboxItemSchema);

describe("outbox item schema", () => {
  it("accepts a queued correction report built by the helper, including observation fields", () => {
    const item = outboxItem({
      id: "demo-note",
      based_on_record_id: "demo-record",
      note: "Demonstration correction only",
      made_offline: true,
    });
    expect(item.kind).toBe("correction-report");
    expect(item.status).toBe("queued-on-device");
    expect(item.based_on_record_id).toBe("demo-record");
    expect(item.observed_at).toBe("2026-01-01T00:00:00Z");
    expect(item.made_offline).toBe(true);
    expect(validate(item)).toBe(true);
  });

  it("rejects a report that omits observed_at or made_offline", () => {
    const item = outboxItem();
    const missingObserved = { ...item };
    delete (missingObserved as { observed_at?: string }).observed_at;
    const missingOffline = { ...item };
    delete (missingOffline as { made_offline?: boolean }).made_offline;
    expect(validate(missingObserved)).toBe(false);
    expect(validate(missingOffline)).toBe(false);
  });

  it("keeps reports as export-only on-device notes, never an upload status", () => {
    expect(outboxItemSchema.properties.status.const).toBe("queued-on-device");
    expect(outboxItemSchema.properties.kind.const).toBe("correction-report");
    expect(validate({ ...outboxItem(), status: "uploaded" })).toBe(false);
  });
});
