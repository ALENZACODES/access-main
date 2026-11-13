import type { FactLike } from "./values.js";
export interface ImportRecord {
    id: string;
    tranche: "venue" | "washroom" | "path" | "transit";
    region?: string;
    fields: Record<string, FactLike>;
}
export interface SourceName {
    id: string;
    name: string;
}
/**
 * Split an access-maps record into canonical drafts.
 * Values are copied. Tags are not turned into measurements or booleans.
 * Piece count is unchanged because each source field is written once.
 */
export declare function migrateImportRecord(record: ImportRecord, sources?: readonly SourceName[]): Record<string, unknown>[];
export declare function odblShareAlikeMissing(source: {
    licence_id?: string;
    share_alike?: boolean;
}): boolean;
