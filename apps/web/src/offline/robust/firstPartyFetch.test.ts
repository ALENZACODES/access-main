import { describe, expect, it, vi } from "vitest";
import {
  validFirstPartyPath,
  firstPartyCellUrl,
  readBoundedBody,
  createFirstPartyCellFetcher,
} from "./firstPartyFetch.ts";
import { type RegionCell } from "./regionDownload.ts";

const origin = "https://app.example.test";
const cell: RegionCell = {
  id: "part-01", bytes: 3,
  provenance: { source: "Public open data", licence: "CC0 1.0", date: "2026-01-01" },
};
const data = new Uint8Array([10, 11, 12]);
function response(body: Uint8Array, init: ResponseInit = {}): Response {
  return new Response(body.slice().buffer, {
    status: 200,
    headers: { "content-type": "application/octet-stream", ...init.headers },
    ...init,
  });
}
function setup(fetchFn: typeof fetch) {
  return createFirstPartyCellFetcher({ basePath: "/offline/cells", origin, fetchFn });
}

describe("first-party offline cell fetch policy", () => {
  it.each([
    "/offline", "/regions/a", "/data-2026", "/", "/offline/cells",
  ])("accepts a same-origin absolute path: %s", (path) => {
    expect(validFirstPartyPath(path)).toBe(true);
  });

  it.each([
    "", "offline", "//remote.test/a", "https://remote.test/a",
    "/../data", "/./data", "/data/../other", "/data\\other",
    "/data?token=x", "/data#fragment", "/data%2Fescape", "/data%5cfile",
    "/data%2E%2E", "/data\u0000name",
  ])("rejects unsafe base path: %s", (path) => {
    expect(validFirstPartyPath(path)).toBe(false);
  });

  it("constructs only same-origin escaped cell locations", () => {
    expect(firstPartyCellUrl({ basePath: "/offline/cells", origin },
      "ontario", "a-1")).toBe(
      "https://app.example.test/offline/cells/ontario/a-1.bin",
    );
  });

  it("rejects cell IDs that could escape the data directory", () => {
    for (const id of ["../a", "/a", "a/b", "a..b", "a%2fb", "", "a?b", "a#b"]) {
      expect(() => firstPartyCellUrl({ basePath: "/cells", origin }, "region", id)).toThrow();
    }
  });

  it("rejects remote origins and credentials in the configured origin", () => {
    expect(() => firstPartyCellUrl({ basePath: "/cells", origin: "ftp://example.test" }, "r", "c")).toThrow();
    expect(() => firstPartyCellUrl({ basePath: "/cells", origin: "https://user:password@example.test" }, "r", "c")).toThrow();
    expect(() => firstPartyCellUrl({ basePath: "/cells", origin: "https://example.test/path" }, "r", "c")).toThrow();
  });

  it("uses explicit GET, same-origin credentials, no cache, and redirect errors", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data));
    const fetchCell = setup(fetchFn);
    const result = await fetchCell("r", cell);
    expect(result).toBe(data.byteLength);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    expect(fetchFn.mock.calls[0]?.[0]).toBe(
      "https://app.example.test/offline/cells/r/part-01.bin",
    );
    const options = fetchFn.mock.calls[0]?.[1];
    expect(options).toMatchObject({
      method: "GET", credentials: "same-origin", redirect: "error", cache: "no-store",
      headers: { Accept: "application/octet-stream" },
    });
  });

  it("does not initiate a request for already aborted work", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data));
    const controller = new AbortController();
    controller.abort();
    await expect(setup(fetchFn)("r", cell, controller.signal)).rejects.toThrow();
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses a cell larger than the configured byte cap", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data));
    const fetchCell = createFirstPartyCellFetcher({
      basePath: "/offline", origin, fetchFn, maximumBytes: 2,
    });
    await expect(fetchCell("r", cell)).rejects.toThrow(RangeError);
    expect(fetchFn).not.toHaveBeenCalled();
  });

  it("refuses invalid size limits at construction", () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data));
    for (const maximumBytes of [0, -1, 0.5, Infinity, 300 * 1024 * 1024]) {
      expect(() => createFirstPartyCellFetcher({
        basePath: "/offline", origin, fetchFn, maximumBytes,
      })).toThrow(RangeError);
    }
  });

  it("rejects an error response without accepting its body", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data, { status: 404 }));
    await expect(setup(fetchFn)("r", cell)).rejects.toThrow();
  });

  it("rejects JSON rather than interpreting it as binary data", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data, {
      headers: { "content-type": "application/json" },
    }));
    await expect(setup(fetchFn)("r", cell)).rejects.toThrow();
  });

  it("rejects absent content type rather than assuming a safe response", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => new Response(new Uint8Array(data).buffer));
    await expect(setup(fetchFn)("r", cell)).rejects.toThrow();
  });

  it("accepts an octet-stream response with a charset parameter", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data, {
      headers: { "content-type": "application/octet-stream; charset=binary" },
    }));
    await expect(setup(fetchFn)("r", cell)).resolves.toBe(data.byteLength);
  });

  it("checks content-length before reading body", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data, {
      headers: { "content-length": "3000" },
    }));
    await expect(setup(fetchFn)("r", cell)).rejects.toThrow();
  });

  it("rejects non-numeric length headers", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data, {
      headers: { "content-length": "unknown" },
    }));
    await expect(setup(fetchFn)("r", cell)).rejects.toThrow();
  });

  it("accepts body with no content-length if bytes match exactly", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(data));
    await expect(setup(fetchFn)("r", cell)).resolves.toBe(data.byteLength);
  });

  it("rejects truncated response body", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(new Uint8Array([10])));
    await expect(setup(fetchFn)("r", cell)).rejects.toThrow();
  });

  it("rejects a response with extra bytes", async () => {
    const fetchFn = vi.fn<typeof fetch>(async () => response(new Uint8Array([10, 11, 12, 13])));
    await expect(setup(fetchFn)("r", cell)).rejects.toThrow();
  });

  it("refuses redirected response metadata", async () => {
    const fetched = response(data);
    Object.defineProperty(fetched, "redirected", { value: true });
    const fetchFn = vi.fn<typeof fetch>(async () => fetched);
    await expect(setup(fetchFn)("r", cell)).rejects.toThrow();
  });

  it("refuses a response that claims a different origin", async () => {
    const fetched = response(data);
    Object.defineProperty(fetched, "url", { value: "https://remote.test/offline" });
    const fetchFn = vi.fn<typeof fetch>(async () => fetched);
    await expect(setup(fetchFn)("r", cell)).rejects.toThrow();
  });

  it("accepts a response URL on the configured origin", async () => {
    const fetched = response(data);
    Object.defineProperty(fetched, "url", { value: "https://app.example.test/offline/cells/r/part-01.bin" });
    const fetchFn = vi.fn<typeof fetch>(async () => fetched);
    await expect(setup(fetchFn)("r", cell)).resolves.toBe(data.byteLength);
  });

  it("rejects a stream that exceeds its expected size", async () => {
    const response = new Response(new Uint8Array([1, 2, 3, 4, 5]).buffer);
    await expect(readBoundedBody(response, 3, 5)).rejects.toThrow();
  });

  it("rejects a stream that ends early", async () => {
    const response = new Response(new Uint8Array([1, 2]).buffer);
    await expect(readBoundedBody(response, 3, 5)).rejects.toThrow();
  });

  it("reads an exact-size stream without changing the bytes", async () => {
    const response = new Response(data.slice().buffer);
    await expect(readBoundedBody(response, 3, 5)).resolves.toEqual(data);
  });

  it("rejects an invalid expected byte count", async () => {
    for (const bytes of [-1, Infinity, NaN, 1.1, 6]) {
      await expect(readBoundedBody(response(data), bytes, 5)).rejects.toThrow(RangeError);
    }
  });

  it("does not accept a stream after cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    await expect(readBoundedBody(response(data), 3, 5, controller.signal)).rejects.toThrow();
  });
});
