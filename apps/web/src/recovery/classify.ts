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
