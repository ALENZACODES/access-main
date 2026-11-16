import { type RegionCell, type DownloadDependencies } from "./regionDownload.ts";

export interface FirstPartyFetchOptions {
  /** Same-origin absolute path, never a remote hostname. */
  readonly basePath: string;
  readonly origin: string;
  readonly fetchFn: typeof fetch;
  readonly maximumBytes?: number;
}

export type FirstPartyCellFetcher = DownloadDependencies["fetchCell"];

const MAX_CELL_BYTES = 256 * 1024 * 1024;

/** No .. segments, encoded separators, query strings or absolute URLs. */
export function validFirstPartyPath(value: string): boolean {
  if (!value.startsWith("/") || value.startsWith("//") ||
    value.includes("?") || value.includes("#") || value.includes("\\") ||
    /%(?:2f|5c|2e|00)/i.test(value)) return false;
  const segments = value.split("/");
  return segments.every((part, index) => index === 0 ||
    (part !== ".." && part !== "." && !/[\u0000-\u001f\u007f]/.test(part)));
}

function validateId(value: string): string {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_.:-]*$/.test(value) ||
    value.includes("..") || value.length > 160) {
    throw new TypeError("Invalid offline cell identifier");
  }
  return encodeURIComponent(value);
}

function requiredOrigin(value: string): URL {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password ||
    url.pathname !== "/" || url.search || url.hash) {
    throw new TypeError("Invalid first-party origin");
  }
  return url;
}

/**
 * Produces a same-origin URL only. The runtime checks redirects too, because
 * a same-origin endpoint can redirect to an unrelated host.
 */
export function firstPartyCellUrl(
  options: Pick<FirstPartyFetchOptions, "basePath" | "origin">,
  region: string,
  cell: string,
): string {
  const origin = requiredOrigin(options.origin);
  if (!validFirstPartyPath(options.basePath)) {
    throw new TypeError("Invalid first-party base path");
  }
  const base = options.basePath.replace(/\/+$/, "");
  const path = `${base}/${validateId(region)}/${validateId(cell)}.bin`;
  const url = new URL(path, origin);
  if (url.origin !== origin.origin) throw new Error("Cross-origin request denied");
  return url.href;
}

/** Read an exact-size binary cell with bounded memory and cancellation. */
export async function readBoundedBody(
  response: Response,
  expectedBytes: number,
  maxBytes: number,
  signal?: AbortSignal,
): Promise<Uint8Array> {
  if (!Number.isSafeInteger(expectedBytes) || expectedBytes < 0 ||
    expectedBytes > maxBytes) throw new RangeError("Cell exceeds download size cap");
  if (!response.body) {
    if (signal?.aborted || expectedBytes !== 0) {
      throw new Error("Incomplete offline cell");
    }
    return new Uint8Array(0);
  }
  const reader = response.body.getReader();
  const output = new Uint8Array(expectedBytes);
  let position = 0;
  try {
    while (true) {
      if (signal?.aborted) throw new Error("Download interrupted");
      const chunk = await reader.read();
      if (chunk.done) break;
      if (position + chunk.value.byteLength > expectedBytes) {
        throw new Error("Cell exceeds declared size");
      }
      output.set(chunk.value, position);
      position += chunk.value.byteLength;
    }
    if (signal?.aborted || position !== expectedBytes) {
      throw new Error("Incomplete offline cell");
    }
    return output;
  } finally {
    reader.releaseLock();
  }
}

/**
 * Only the user-initiated dashboard download invokes this fetcher. Rejects
 * redirects, cross-origin addresses, unexpected content, and oversized bodies.
 * It does not call any third-party tile or external mapping service.
 */
export function createFirstPartyCellFetcher(
  options: FirstPartyFetchOptions,
): FirstPartyCellFetcher {
  const origin = requiredOrigin(options.origin);
  const maximumBytes = options.maximumBytes ?? MAX_CELL_BYTES;
  if (!Number.isSafeInteger(maximumBytes) || maximumBytes < 1 ||
    maximumBytes > MAX_CELL_BYTES) throw new RangeError("Invalid cell size cap");
  if (!validFirstPartyPath(options.basePath)) {
    throw new TypeError("Invalid first-party path");
  }
  return async (regionId: string, cell: RegionCell, signal?: AbortSignal) => {
    if (signal?.aborted) throw new Error("Download interrupted");
    if (cell.bytes > maximumBytes) throw new RangeError("Cell exceeds size cap");
    const url = firstPartyCellUrl(options, regionId, cell.id);
    const response = await options.fetchFn(url, {
      method: "GET",
      credentials: "same-origin",
      redirect: "error",
      cache: "no-store",
      signal,
      headers: { Accept: "application/octet-stream" },
    });
    if (response.redirected || response.url && new URL(response.url).origin !== origin.origin) {
      throw new Error("Unexpected remote response");
    }
    if (!response.ok) throw new Error("Offline cell request failed");
    const type = response.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
    if (type !== "application/octet-stream") {
      throw new Error("Unexpected offline cell content type");
    }
    const length = response.headers.get("content-length");
    if (length !== null && (!/^\d+$/.test(length) || Number(length) !== cell.bytes)) {
      throw new Error("Offline cell response size mismatch");
    }
    const body = await readBoundedBody(response, cell.bytes, maximumBytes, signal);
    return body.byteLength;
  };
}
