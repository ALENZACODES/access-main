import type { RecoveryLocale, RecoverySource } from "./index";
import { classifyRecoveryError } from "./classify";

/** Integrity information must come from an independently supplied manifest. */
export interface PackManifest {
  readonly byteLength: number;
  readonly sha256: string;
  readonly source: RecoverySource;
}

export type PackCheck =
  | { readonly status: "complete"; readonly source: RecoverySource }
  | { readonly status: "corrupt"; readonly reason: "size" | "digest" }
  | { readonly status: "unknown"; readonly reason: "metadata" | "digest-unavailable" };

const OPEN_LICENCES = new Set([
  "CC0-1.0", "CC-BY-4.0", "ODbL-1.0", "OGL-Canada-2.0", "OGL-ON-1.0",
]);

export type Sha256 = (bytes: Uint8Array) => Promise<string>;

export async function browserSha256(bytes: Uint8Array): Promise<string> {
  if (typeof crypto === "undefined" || !crypto.subtle) {
    throw new Error("Digest unavailable");
  }
  // Copy so a shared or resizable caller buffer cannot change mid-digest.
  const copy = Uint8Array.from(bytes);
  const hash = await crypto.subtle.digest("SHA-256", copy.buffer);
  return Array.from(new Uint8Array(hash), (value) => value.toString(16).padStart(2, "0")).join("");
}

function hasManifest(manifest: PackManifest | null | undefined): manifest is PackManifest {
  return !!manifest && Number.isSafeInteger(manifest.byteLength) &&
    manifest.byteLength >= 0 && /^[a-f\d]{64}$/i.test(manifest.sha256) &&
    !!manifest.source && manifest.source.name.trim().length > 0 &&
    OPEN_LICENCES.has(manifest.source.licence) &&
    /^\d{4}-\d{2}-\d{2}$/.test(manifest.source.date) &&
    !Number.isNaN(Date.parse(`${manifest.source.date}T00:00:00Z`));
}

/** UNKNOWN is not a successful check; no guessed size, checksum or licence. */
export async function checkPackIntegrity(
  data: Uint8Array,
  manifest: PackManifest | null | undefined,
  digest: Sha256 = browserSha256,
): Promise<PackCheck> {
  if (!hasManifest(manifest)) return { status: "unknown", reason: "metadata" };
  if (data.byteLength !== manifest.byteLength) {
    return { status: "corrupt", reason: "size" };
  }
  try {
    const actual = await digest(data);
    if (!/^[a-f\d]{64}$/i.test(actual)) {
      return { status: "unknown", reason: "digest-unavailable" };
    }
    if (actual.toLowerCase() !== manifest.sha256.toLowerCase()) {
      return { status: "corrupt", reason: "digest" };
    }
  } catch {
    return { status: "unknown", reason: "digest-unavailable" };
  }
  return { status: "complete", source: manifest.source };
}

export type PackRedownloadResult =
  | { readonly status: "complete"; readonly source: RecoverySource }
  | { readonly status: "corrupt" | "unknown"; readonly check: PackCheck }
  | { readonly status: "failed"; readonly reason: "offline" | "quota" | "permission" | "interrupted" | "invalid-data" | "unknown" };

/**
 * Call from an explicit user action. Download to memory, check first, then
 * commit. No automatic retry; the previously stored pack is not overwritten
 * by corrupted or uncheckable bytes. The commit callback must be atomic.
 */
export async function redownloadPack(
  download: () => Promise<Uint8Array>,
  manifest: PackManifest | null | undefined,
  commit: (data: Uint8Array) => Promise<void>,
  digest: Sha256 = browserSha256,
): Promise<PackRedownloadResult> {
  let data: Uint8Array;
  try {
    data = await download();
  } catch (error: unknown) {
    return { status: "failed", reason: classifyRecoveryError("download", error).reason };
  }
  const check = await checkPackIntegrity(data, manifest, digest);
  if (check.status !== "complete") return { status: check.status, check };
  try {
    await commit(data);
  } catch (error: unknown) {
    return { status: "failed", reason: classifyRecoveryError("pack", error).reason };
  }
  return { status: "complete", source: check.source };
}

export function packIntegrityCopy(locale: RecoveryLocale, status: "corrupt" | "unknown") {
  if (locale === "fr") {
    return status === "corrupt"
      ? {
          title: "Ensemble endommagé",
          explanation: "L’ensemble ne correspond pas aux données attendues. Ne l’utilisez pas. Vous pouvez le télécharger de nouveau.",
          action: "Télécharger de nouveau",
          dismiss: "Fermer",
        }
      : {
          title: "État de l’ensemble inconnu",
          explanation: "Les renseignements nécessaires au contrôle sont absents ou indisponibles. L’ensemble ne peut pas être utilisé comme complet.",
          action: "Télécharger de nouveau",
          dismiss: "Fermer",
        };
  }
  return status === "corrupt"
    ? {
        title: "Damaged pack",
        explanation: "The pack does not match the expected data. Do not use it. You can download it again.",
        action: "Download again",
        dismiss: "Dismiss",
      }
    : {
        title: "Pack status unknown",
        explanation: "Information needed to check the pack is missing or unavailable. The pack cannot be treated as complete.",
        action: "Download again",
        dismiss: "Dismiss",
      };
}

/** One stored pack part, as reported by the data client, for an integrity re-check. */
export interface StoredPackPart {
  readonly data: Uint8Array | null;
  readonly expectedBytes: number;
  readonly expectedSha256: string;
  readonly expectedCount: number;
  readonly actualCount: number | null;
  readonly structurallyValid: boolean;
  readonly source: RecoverySource;
}

/**
 * Checks every stored part against the independently supplied size, digest and
 * record count. Missing, unreadable or mismatched parts are corrupt. Parts
 * without raw bytes cannot have their digest confirmed, so the result is
 * unknown rather than complete.
 */
export async function checkStoredPackParts(
  parts: readonly StoredPackPart[],
  digest: Sha256 = browserSha256,
): Promise<PackCheck> {
  if (parts.length === 0) return { status: "unknown", reason: "metadata" };
  let unknown: PackCheck | undefined;
  for (const part of parts) {
    if (part.actualCount === null || !part.structurallyValid || part.actualCount !== part.expectedCount) {
      return { status: "corrupt", reason: "size" };
    }
    if (!part.data) {
      unknown ??= { status: "unknown", reason: "digest-unavailable" };
      continue;
    }
    const check = await checkPackIntegrity(part.data, {
      byteLength: part.expectedBytes,
      sha256: part.expectedSha256,
      source: part.source,
    }, digest);
    if (check.status === "corrupt") return check;
    if (check.status === "unknown") unknown = check;
  }
  return unknown ?? { status: "complete", source: parts[0]!.source };
}
