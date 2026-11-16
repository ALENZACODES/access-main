import type {
  RecoveryFailure,
  RecoveryOperation,
  RecoveryReason,
  RecoverySource,
} from "./index";

/** Error names are known signals; arbitrary exception messages are never shown. */
export function classifyRecoveryError(
  operation: RecoveryOperation,
  error: unknown,
  source?: RecoverySource,
): RecoveryFailure {
  let reason: RecoveryReason = "unknown";
  if (error instanceof Error) {
    switch (error.name) {
      case "QuotaExceededError":
        reason = "quota";
        break;
      case "NotAllowedError":
      case "SecurityError":
        reason = "permission";
        break;
      case "AbortError":
        reason = "interrupted";
        break;
      case "DataError":
      case "SyntaxError":
        reason = "invalid-data";
        break;
      case "NetworkError":
        reason = "offline";
        break;
      default:
        reason = "unknown";
    }
  }
  return { operation, reason, ...(source === undefined ? {} : { source }) };
}

export type RecoveryResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly failure: RecoveryFailure };

/** Call only from a user-controlled operation. No automatic retries or uploads. */
export async function runRecoverable<T>(
  operation: RecoveryOperation,
  task: () => Promise<T>,
  source?: RecoverySource,
): Promise<RecoveryResult<T>> {
  try {
    return { ok: true, value: await task() };
  } catch (error: unknown) {
    return { ok: false, failure: classifyRecoveryError(operation, error, source) };
  }
}

/**
 * Pack download failures from packages/data-client carry a code. Size, digest
 * and record-count mismatches are invalid data; a failed fetch is offline only
 * when the device reports it is offline, otherwise the cause stays unknown.
 */
export function classifyPackDownloadError(
  error: unknown,
  online: boolean,
  source?: RecoverySource,
): RecoveryFailure {
  const code = error !== null && typeof error === "object" && "code" in error ? (error as { code: unknown }).code : undefined;
  let reason: RecoveryReason | undefined;
  switch (code) {
    case "quota": reason = "quota"; break;
    case "bytes": case "sha256": case "content": reason = "invalid-data"; break;
    case "network": reason = online ? "unknown" : "offline"; break;
    case "missing": reason = "unknown"; break;
    default: reason = undefined;
  }
  if (reason === undefined) return classifyRecoveryError("download", error, source);
  return { operation: "download", reason, ...(source === undefined ? {} : { source }) };
}
