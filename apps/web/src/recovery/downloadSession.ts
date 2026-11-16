import { classifyRecoveryError } from "./classify";
import type { RecoveryReason } from "./index";
import {
  checkPackIntegrity,
  type PackManifest,
  type Sha256,
} from "./packIntegrity";

/** A source supplied by the caller: no implicit third-party endpoints. */
export type ChunkSource = (
  signal: AbortSignal,
) => AsyncIterable<Uint8Array>;

export type DownloadPhase =
  | "idle"
  | "receiving"
  | "checking"
  | "saving"
  | "complete"
  | "corrupt"
  | "unknown"
  | "failed"
  | "cancelled";

export interface DownloadSnapshot {
  readonly phase: DownloadPhase;
  readonly received: number;
  readonly expected: number | null;
  readonly percent: number | null;
  readonly failure?: RecoveryReason;
}

export interface DownloadOutcome {
  readonly phase: Exclude<DownloadPhase, "idle" | "receiving" | "checking" | "saving">;
  readonly received: number;
  readonly failure?: RecoveryReason;
}

export type DownloadListener = (snapshot: DownloadSnapshot) => void;

const EMPTY: DownloadSnapshot = {
  phase: "idle",
  received: 0,
  expected: null,
  percent: null,
};

export interface SessionOptions {
  readonly source: ChunkSource;
  readonly manifest: PackManifest | null;
  /** Must replace the stored copy atomically. */
  readonly commit: (data: Uint8Array) => Promise<void>;
  readonly digest?: Sha256;
  /** Hard limit, in bytes. Defaults to 32 MiB. */
  readonly maxBytes?: number;
}

/** Fail closed before allocation, including for untrusted remote chunk sizes. */
export const DEFAULT_MAX_PACK_BYTES = 32 * 1024 * 1024;

function withinLimit(value: number, max: number): boolean {
  return Number.isSafeInteger(value) && value >= 0 && value <= max;
}

function expectedSize(manifest: PackManifest | null, max: number): number | null {
  if (manifest === null || !withinLimit(manifest.byteLength, max)) return null;
  return manifest.byteLength;
}

function percent(received: number, expected: number | null): number | null {
  if (expected === null) return null;
  if (expected === 0) return received === 0 ? 100 : null;
  return Math.min(100, Math.floor((received / expected) * 100));
}

function snapshot(
  phase: DownloadPhase,
  received: number,
  expected: number | null,
  failure?: RecoveryReason,
): DownloadSnapshot {
  return {
    phase,
    received,
    expected,
    percent: percent(received, expected),
    ...(failure === undefined ? {} : { failure }),
  };
}

/**
 * One start = one attempt. No timer, automatic retry, network selection,
 * background persistence or implicit approval. An interruption cannot commit.
 */
export class PackDownloadSession {
  private controller: AbortController | null = null;
  private current: DownloadSnapshot = EMPTY;
  private listeners = new Set<DownloadListener>();
  private attempt = 0;

  get state(): DownloadSnapshot {
    return this.current;
  }

  get busy(): boolean {
    return this.controller !== null;
  }

  subscribe(listener: DownloadListener): () => void {
    this.listeners.add(listener);
    listener(this.current);
    return () => { this.listeners.delete(listener); };
  }

  private publish(next: DownloadSnapshot): void {
    this.current = next;
    for (const listener of this.listeners) listener(next);
  }

  cancel(): boolean {
    if (this.controller === null) return false;
    this.controller.abort();
    return true;
  }

  async start(options: SessionOptions): Promise<DownloadOutcome> {
    if (this.controller !== null) {
      return { phase: "failed", received: this.current.received, failure: "unknown" };
    }
    const max = options.maxBytes ?? DEFAULT_MAX_PACK_BYTES;
    const expected = expectedSize(options.manifest, max);
    if (!withinLimit(max, Number.MAX_SAFE_INTEGER) || max === 0) {
      this.publish(snapshot("unknown", 0, null));
      return { phase: "unknown", received: 0 };
    }
    if (options.manifest === null || expected === null) {
      this.publish(snapshot("unknown", 0, null));
      return { phase: "unknown", received: 0 };
    }

    const controller = new AbortController();
    this.controller = controller;
    const ticket = ++this.attempt;
    let received = 0;
    const chunks: Uint8Array[] = [];
    this.publish(snapshot("receiving", 0, expected));
    try {
      for await (const chunk of options.source(controller.signal)) {
        if (controller.signal.aborted) break;
        if (!(chunk instanceof Uint8Array)) {
          this.publish(snapshot("unknown", received, expected));
          return { phase: "unknown", received };
        }
        const next = received + chunk.byteLength;
        if (!Number.isSafeInteger(next) || next > max || next > expected) {
          this.publish(snapshot("corrupt", received, expected));
          return { phase: "corrupt", received };
        }
        // Copy each chunk: the producer may reuse its backing buffer.
        chunks.push(Uint8Array.from(chunk));
        received = next;
        this.publish(snapshot("receiving", received, expected));
      }
      if (controller.signal.aborted) {
        this.publish(snapshot("cancelled", received, expected));
        return { phase: "cancelled", received };
      }
      if (received !== expected) {
        this.publish(snapshot("corrupt", received, expected));
        return { phase: "corrupt", received };
      }
      const bytes = new Uint8Array(received);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      this.publish(snapshot("checking", received, expected));
      const result = await checkPackIntegrity(bytes, options.manifest, options.digest);
      if (controller.signal.aborted) {
        this.publish(snapshot("cancelled", received, expected));
        return { phase: "cancelled", received };
      }
      if (result.status !== "complete") {
        this.publish(snapshot(result.status, received, expected));
        return { phase: result.status, received };
      }
      this.publish(snapshot("saving", received, expected));
      await options.commit(bytes);
      // Saving may have completed despite cancellation: report UNKNOWN, not
      // "complete", since the caller cannot know the state of a non-atomic store.
      if (controller.signal.aborted) {
        this.publish(snapshot("unknown", received, expected));
        return { phase: "unknown", received };
      }
      this.publish(snapshot("complete", received, expected));
      return { phase: "complete", received };
    } catch (error: unknown) {
      if (controller.signal.aborted) {
        this.publish(snapshot("cancelled", received, expected));
        return { phase: "cancelled", received };
      }
      const failure = classifyRecoveryError("download", error).reason;
      this.publish(snapshot("failed", received, expected, failure));
      return { phase: "failed", received, failure };
    } finally {
      if (this.attempt === ticket) this.controller = null;
    }
  }
}

export interface DownloadCopy {
  readonly heading: string;
  readonly begin: string;
  readonly again: string;
  readonly cancel: string;
  readonly received: string;
  readonly of: string;
  readonly bytes: string;
  readonly phases: Readonly<Record<DownloadPhase, string>>;
  readonly warning: string;
  readonly cancelled: string;
}

const EN: DownloadCopy = {
  heading: "Pack download",
  begin: "Download pack",
  again: "Download again",
  cancel: "Cancel download",
  received: "Received",
  of: "of",
  bytes: "bytes",
  phases: {
    idle: "Not started",
    receiving: "Downloading",
    checking: "Checking contents",
    saving: "Saving locally",
    complete: "Saved on this device",
    corrupt: "Damaged download",
    unknown: "UNKNOWN",
    failed: "Download failed",
    cancelled: "Download cancelled",
  },
  warning: "Do not use an incomplete pack. Downloading needs an available connection.",
  cancelled: "Cancelled by the user. No complete pack was saved by this attempt.",
};

const FR: DownloadCopy = {
  heading: "Téléchargement de l’ensemble",
  begin: "Télécharger l’ensemble",
  again: "Télécharger de nouveau",
  cancel: "Annuler le téléchargement",
  received: "Reçus",
  of: "sur",
  bytes: "octets",
  phases: {
    idle: "Non commencé",
    receiving: "Téléchargement",
    checking: "Contrôle du contenu",
    saving: "Enregistrement local",
    complete: "Enregistré sur cet appareil",
    corrupt: "Téléchargement endommagé",
    unknown: "INCONNU",
    failed: "Échec du téléchargement",
    cancelled: "Téléchargement annulé",
  },
  warning: "N’utilisez pas un ensemble incomplet. Le téléchargement nécessite une connexion disponible.",
  cancelled: "Annulé par l’utilisateur. Aucune copie complète n’a été enregistrée par cette tentative.",
};

export function downloadCopy(locale: "en" | "fr"): DownloadCopy {
  return locale === "fr" ? FR : EN;
}
