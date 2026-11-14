import { validateManifest, validatePackContent, type FieldIssue, type PackContent, type PackManifest, type StoredPack } from "@access/shared";

export const TORONTO_MANIFEST_PATH = "/packs/toronto/manifest.json";

export type PackErrorCode = "network" | "manifest_invalid" | "size_mismatch" | "hash_mismatch" | "content_invalid";

export class PackError extends Error {
  code: PackErrorCode;
  issues: FieldIssue[];

  constructor(code: PackErrorCode, issues: FieldIssue[] = []) {
    super(code);
    this.name = "PackError";
    this.code = code;
    this.issues = issues;
  }
}

type Fetcher = (input: string, init?: RequestInit) => Promise<Response>;

export async function fetchManifest(fetcher: Fetcher = fetch, path = TORONTO_MANIFEST_PATH): Promise<PackManifest> {
  let response: Response;
  try {
    response = await fetcher(path, { cache: "no-store" });
  } catch {
    throw new PackError("network");
  }
  if (!response.ok) throw new PackError("network");
  let manifest: PackManifest;
  try {
    manifest = (await response.json()) as PackManifest;
  } catch {
    throw new PackError("manifest_invalid");
  }
  const issues = validateManifest(manifest);
  if (issues.length > 0) throw new PackError("manifest_invalid", issues);
  return manifest;
}

async function sha256Hex(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

/**
 * Downloads the content file, reports progress against the manifest size, and refuses the pack when
 * the size, the hash, a count, or any record does not match. Nothing is stored here.
 */
export async function downloadPack(
  manifest: PackManifest,
  options: { fetcher?: Fetcher; onProgress?: (received: number, total: number) => void; nowIso: string },
): Promise<StoredPack> {
  const fetcher = options.fetcher ?? fetch;
  let response: Response;
  try {
    response = await fetcher(manifest.content_path, { cache: "no-store" });
  } catch {
    throw new PackError("network");
  }
  if (!response.ok) throw new PackError("network");

  const total = manifest.size_bytes;
  const chunks: Uint8Array[] = [];
  let received = 0;
  options.onProgress?.(0, total);
  try {
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        options.onProgress?.(Math.min(received, total), total);
      }
    } else {
      const buffer = new Uint8Array(await response.arrayBuffer());
      chunks.push(buffer);
      received = buffer.byteLength;
      options.onProgress?.(Math.min(received, total), total);
    }
  } catch {
    throw new PackError("network");
  }

  if (received !== total) throw new PackError("size_mismatch");
  const bytes = new Uint8Array(received);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  if ((await sha256Hex(bytes)) !== manifest.sha256) throw new PackError("hash_mismatch");

  let content: PackContent;
  try {
    content = JSON.parse(new TextDecoder().decode(bytes)) as PackContent;
  } catch {
    throw new PackError("content_invalid");
  }
  const issues = validatePackContent(content, manifest);
  if (issues.length > 0) throw new PackError("content_invalid", issues);
  return { pack_id: manifest.pack_id, manifest, content, stored_at: options.nowIso };
}
