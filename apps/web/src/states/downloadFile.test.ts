/** @vitest-environment jsdom */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { safeFileName, saveBlobFile, saveTextFile } from "./downloadFile";

describe("safeFileName", () => {
  it("keeps an ordinary name", () => {
    expect(safeFileName("pack-report.txt")).toBe("pack-report.txt");
    expect(safeFileName("lieux-du-pack.csv")).toBe("lieux-du-pack.csv");
  });
  it("removes path parts and reserved characters", () => {
    expect(safeFileName("../../etc/passwd")).toBe("etc-passwd");
    expect(safeFileName('a<b>c:d"e|f?g*h')).toBe("a-b-c-d-e-f-g-h");
    expect(safeFileName("C:\\Users\\x\\file.txt")).toBe("C-Users-x-file.txt");
  });
  it("removes control characters and leading dots, spaces and dashes", () => {
    expect(safeFileName("a\u0000b\u001fc.txt")).toBe("a-b-c.txt");
    expect(safeFileName("  .hidden")).toBe("hidden");
    expect(safeFileName("--x")).toBe("x");
  });
  it("falls back when nothing usable is left, and honours the fallback given", () => {
    expect(safeFileName("")).toBe("download.txt");
    expect(safeFileName("///")).toBe("download.txt");
    expect(safeFileName("...", "report.csv")).toBe("report.csv");
  });
  it("cuts a very long name", () => {
    expect(safeFileName("x".repeat(500) + ".txt").length).toBeLessThanOrEqual(120);
  });
});

const readBlob = (blob: Blob): Promise<string> =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsText(blob);
  });

describe("saveTextFile", () => {
  const original = { create: URL.createObjectURL, revoke: URL.revokeObjectURL };
  let created: Blob[] = [];
  const revoke = vi.fn();
  let clicked: HTMLAnchorElement[] = [];
  beforeEach(() => {
    created = [];
    clicked = [];
    revoke.mockReset();
    URL.createObjectURL = ((b: Blob) => {
      created.push(b);
      return "blob:test/1";
    }) as typeof URL.createObjectURL;
    URL.revokeObjectURL = revoke;
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      clicked.push(this);
    });
  });
  afterEach(() => {
    URL.createObjectURL = original.create;
    URL.revokeObjectURL = original.revoke;
    vi.restoreAllMocks();
    document.body.innerHTML = "";
  });

  it("makes a blob of the content with its type and clicks a link with the cleaned name", async () => {
    const ok = saveTextFile({ name: "a/b.csv", mime: "text/csv;charset=utf-8", content: "x,y\r\n" });
    expect(ok).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0]!.type).toBe("text/csv;charset=utf-8");
    expect(await readBlob(created[0]!)).toBe("x,y\r\n");
    expect(clicked).toHaveLength(1);
    expect(clicked[0]!.download).toBe("a-b.csv");
    expect(clicked[0]!.getAttribute("href")).toBe("blob:test/1");
    expect(clicked[0]!.rel).toBe("noopener");
  });
  it("leaves no link in the page and releases the address", () => {
    saveTextFile({ name: "r.txt", mime: "text/plain", content: "hello" });
    expect(document.querySelectorAll("a")).toHaveLength(0);
    expect(revoke).toHaveBeenCalledWith("blob:test/1");
  });
  it("hands the browser the original blob, including its original encoding and line endings", () => {
    const bytes = new Uint8Array([0xef, 0xbb, 0xbf, 0x7b, 0x7d, 0x0d, 0x0a]);
    const original = new Blob([bytes], { type: "application/json" });
    expect(saveBlobFile(original, "résumé.json")).toBe(true);
    expect(created[0]).toBe(original);
    expect(clicked[0]?.download).toBe("résumé.json");
    expect(revoke).toHaveBeenCalledWith("blob:test/1");
  });
  it("releases the address even when the click throws", () => {
    vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(() => saveTextFile({ name: "r.txt", mime: "text/plain", content: "x" })).toThrow("blocked");
    expect(revoke).toHaveBeenCalledTimes(1);
    expect(document.body.querySelector("a")).toBeNull();
  });
  it("returns false and does nothing where the browser cannot make a file", () => {
    (URL as unknown as Record<string, unknown>).createObjectURL = undefined;
    expect(saveTextFile({ name: "r.txt", mime: "text/plain", content: "x" })).toBe(false);
    expect(clicked).toHaveLength(0);
  });
  it("keeps non-ASCII text intact", async () => {
    saveTextFile({ name: "r.txt", mime: "text/plain;charset=utf-8", content: "Niveau\u00a0: UNKNOWN — « ok »" });
    expect(await readBlob(created[0]!)).toBe("Niveau\u00a0: UNKNOWN — « ok »");
  });
});
