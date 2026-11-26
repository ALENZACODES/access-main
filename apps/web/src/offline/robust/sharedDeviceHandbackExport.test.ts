/** @vitest-environment jsdom */
import { describe, expect, it, vi } from "vitest";
import {
  createSharedDeviceHandback,
  updateHandbackEntry,
} from "./sharedDeviceHandback";
import {
  saveSharedDeviceHandback,
  sharedDeviceHandbackFilename,
  sharedDeviceHandbackJson,
  sharedDeviceHandbackText,
} from "./sharedDeviceHandbackExport";

const created = "2026-11-21T10:00:00.000Z";
const changed = "2026-11-21T10:01:00.000Z";

function sample() {
  return updateHandbackEntry(
    createSharedDeviceHandback("handback-20261121100000000-1", "north", created),
    "account-signout",
    "done",
    changed,
  );
}

describe("shared-device handback text export", () => {
  it("includes the review summary and fixed prompts", () => {
    const text = sharedDeviceHandbackText(sample(), "en");
    expect(text).toContain("Shared-device handback review");
    expect(text).toContain("Review summary");
    expect(text).toContain("account sign-in used");
    expect(text).toContain("Marked complete");
    expect(text).toContain("UNKNOWN");
    expect(text).toContain("does not sign out");
  });

  it("includes French labels and the exact UNKNOWN token", () => {
    const text = sharedDeviceHandbackText(sample(), "fr");
    expect(text).toContain("Examen de restitution");
    expect(text).toContain("Domaine\u00a0:");
    expect(text).toContain("Élément requis\u00a0:");
    expect(text).toContain("UNKNOWN");
    expect(text).not.toMatch(/ [;:!?]/u);
    expect(text).not.toContain("'");
  });

  it("includes the fixed prompts but no free-form personal details", () => {
    const text = sharedDeviceHandbackText(sample(), "en");
    expect(text).toContain("download folder");
    expect(text).toContain("printed pages");
    expect(text).not.toMatch(/password|email|accountName|credential|token/i);
  });

  it("describes only user selections and does not claim the page performed actions", () => {
    const text = sharedDeviceHandbackText(sample(), "en");
    expect(text).toContain("does not sign out");
    expect(text).toContain("does not describe the current device state");
    expect(text).not.toMatch(/\b(?:signed out|deleted|cleared|removed)\b/i);
  });
});

describe("shared-device handback JSON and filenames", () => {
  it("uses the validated model serializer", () => {
    const review = sample();
    const raw = JSON.parse(sharedDeviceHandbackJson(review)) as Record<string, unknown>;
    expect(raw).toMatchObject({
      schema: "shared-device-handback-v1",
      reviewId: review.reviewId,
      regionId: "north",
    });
  });

  it("sanitizes filenames and preserves the requested extension", () => {
    expect(sharedDeviceHandbackFilename("handback-1", "json")).toBe("shared-device-handback-handback-1.json");
    expect(sharedDeviceHandbackFilename("../private id", "txt")).toBe("shared-device-handback-private-id.txt");
    expect(sharedDeviceHandbackFilename(" ", "json")).toBe("shared-device-handback-review.json");
  });
});

describe("saveSharedDeviceHandback", () => {
  it("creates a JSON blob and revokes its object URL after the explicit export", async () => {
    const review = sample();
    const captured: Blob[] = [];
    const createUrl = vi.fn((blob: Blob) => {
      captured.push(blob);
      return "blob:handback";
    });
    const revokeUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    saveSharedDeviceHandback(review, "en", "json", document, createUrl, revokeUrl);
    expect(createUrl).toHaveBeenCalledOnce();
    expect(revokeUrl).toHaveBeenCalledWith("blob:handback");
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector("a[download]")).toBeNull();
    click.mockRestore();
    const blob = captured[0]!;
    expect(blob.type).toBe("application/json;charset=utf-8");
    const reader = new FileReader();
    const content = new Promise<string>((resolve, reject) => {
      reader.addEventListener("load", () => resolve(String(reader.result)));
      reader.addEventListener("error", () => reject(reader.error));
    });
    reader.readAsText(blob);
    expect(JSON.parse(await content)).toEqual(review);
  });

  it("creates a text blob with the selected language", () => {
    const review = sample();
    const types: string[] = [];
    const createUrl = vi.fn((blob: Blob) => {
      types.push(blob.type);
      return "blob:handback-text";
    });
    const revokeUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    saveSharedDeviceHandback(review, "fr", "txt", document, createUrl, revokeUrl);
    expect(types).toEqual(["text/plain;charset=utf-8"]);
    expect(revokeUrl).toHaveBeenCalledWith("blob:handback-text");
    click.mockRestore();
  });

  it("revokes the URL even when the download click throws", () => {
    const revokeUrl = vi.fn();
    const click = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("click failed");
    });
    expect(() => saveSharedDeviceHandback(sample(), "en", "json", document, () => "blob:fail", revokeUrl)).toThrow();
    expect(revokeUrl).toHaveBeenCalledWith("blob:fail");
    click.mockRestore();
  });
});
