import { assertUnverifiedDraft, isUnverifiedDraft } from "./validation";
import type {
  CommunityContribution,
  EvidenceHandle,
  Source,
  Target,
  UnverifiedDraft,
  DraftValue,
} from "./types";

const STORAGE_KEY = "access-main:proposals:v1";

export interface LocalStorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export interface DraftInput {
  target: Target;
  field: string;
  suggestedValue: DraftValue;
  evidence: EvidenceHandle[];
  source?: Source;
}

function contributionFromDraft(
  draft: UnverifiedDraft,
): CommunityContribution {
  if (
    draft.status !== "accepted" ||
    !draft.personNote?.trim() ||
    !draft.reviewedAt ||
    !draft.source
  ) {
    throw new Error("Only verified drafts can become contributions");
  }

  return {
    id: draft.id,
    target: structuredClone(draft.target),
    field: draft.field,
    record: {
      value: draft.suggestedValue,
      source_id: draft.source.source_id,
      licence: draft.source.licence,
      retrieved_at: draft.source.retrieved_at,
      tier: 1,
      ...(draft.source.source_key === undefined
        ? {}
        : { source_key: draft.source.source_key }),
    },
    evidence: structuredClone(draft.evidence),
    personNote: draft.personNote,
    verifiedAt: draft.reviewedAt,
    status: "accepted",
  };
}

/**
 * Device-only review queue.
 *
 * Storage failures are surfaced to the caller, rather than allowing a review
 * to appear saved when it is not. No network or pack writer is used.
 */
export class ProposalStore {
  constructor(
    private readonly storage: LocalStorageLike,
    private readonly now: () => Date = () => new Date(),
    private readonly newId: () => string = () => crypto.randomUUID(),
  ) {}

  private read(): UnverifiedDraft[] {
    const raw = this.storage.getItem(STORAGE_KEY);
    if (raw === null) return [];

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("Stored draft data is invalid");
    }

    if (
      !Array.isArray(parsed) ||
      !parsed.every(isUnverifiedDraft) ||
      new Set(parsed.map((draft) => draft.id)).size !== parsed.length
    ) {
      throw new Error("Stored draft data is invalid");
    }

    return parsed;
  }

  private write(drafts: UnverifiedDraft[]): void {
    this.storage.setItem(STORAGE_KEY, JSON.stringify(drafts));
  }

  create(input: DraftInput): UnverifiedDraft {
    if (!input.field.trim()) {
      throw new Error("A field is required");
    }

    const drafts = this.read();
    const draft: UnverifiedDraft = {
      id: this.newId(),
      target: structuredClone(input.target),
      field: input.field.trim(),
      suggestedValue: input.suggestedValue,
      evidence: structuredClone(input.evidence),
      tier: 0,
      createdAt: this.now().toISOString(),
      status: "pending",
      ...(input.source ? { source: structuredClone(input.source) } : {}),
    };

    assertUnverifiedDraft(draft);
    if (drafts.some((existing) => existing.id === draft.id)) {
      throw new Error("Duplicate draft identifier");
    }

    this.write([...drafts, draft]);
    return structuredClone(draft);
  }

  listPending(): UnverifiedDraft[] {
    return structuredClone(
      this.read().filter((draft) => draft.status === "pending"),
    );
  }

  listAll(): UnverifiedDraft[] {
    return structuredClone(this.read());
  }

  get(id: string): UnverifiedDraft | undefined {
    const draft = this.read().find((item) => item.id === id);
    return draft ? structuredClone(draft) : undefined;
  }

  accept(id: string, personNote: string): CommunityContribution {
    if (!personNote.trim()) {
      throw new Error("A verification note is required");
    }

    const drafts = this.read();
    const index = drafts.findIndex((draft) => draft.id === id);

    const pending = drafts[index];
    if (index < 0 || !pending || pending.status !== "pending") {
      throw new Error("Pending draft not found");
    }

    if (!pending.source) {
      throw new Error("Source and open licence are required");
    }

    const accepted: UnverifiedDraft = {
      ...pending,
      status: "accepted",
      personNote: personNote.trim(),
      reviewedAt: this.now().toISOString(),
    };

    assertUnverifiedDraft(accepted);
    const contribution = contributionFromDraft(accepted);
    drafts[index] = accepted;
    this.write(drafts);

    return contribution;
  }

  reject(id: string, reason: string): UnverifiedDraft {
    if (!reason.trim()) {
      throw new Error("A rejection reason is required");
    }

    const drafts = this.read();
    const index = drafts.findIndex((draft) => draft.id === id);

    const pending = drafts[index];
    if (index < 0 || !pending || pending.status !== "pending") {
      throw new Error("Pending draft not found");
    }

    const rejected: UnverifiedDraft = {
      ...pending,
      status: "rejected",
      rejectionReason: reason.trim(),
      reviewedAt: this.now().toISOString(),
    };

    assertUnverifiedDraft(rejected);
    drafts[index] = rejected;
    this.write(drafts);

    return structuredClone(rejected);
  }

  /**
   * Explicit export hand-off to I9.
   * Pending and rejected drafts are excluded, including their evidence.
   */
  listExportable(): CommunityContribution[] {
    return this.read()
      .filter((draft) => draft.status === "accepted")
      .map(contributionFromDraft);
  }

  exportJSON(): string {
    return JSON.stringify(this.listExportable(), null, 2);
  }
}

export function createBrowserProposalStore(): ProposalStore {
  if (typeof window === "undefined" || !window.localStorage) {
    throw new Error("Device storage is unavailable");
  }

  return new ProposalStore(window.localStorage);
}
