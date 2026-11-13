export declare function isGapToken(value: unknown): boolean;
export interface FactLike {
    value?: unknown;
    source_id?: string;
    licence?: string;
    retrieved_at?: string;
    tier?: number | string;
    observed_at?: string;
    method?: string | null;
    derived?: boolean;
    tri_state_observation?: boolean;
    source_key?: string;
    import_field?: string;
}
export declare function isFactLike(value: unknown): value is FactLike;
export declare function observationComplete(fact: FactLike): boolean;
