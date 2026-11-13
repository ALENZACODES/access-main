import { type RecordDef } from "./types.js";
/**
 * Benefits and other official-programme directory entries.
 * General information and links only. There is no eligibility result and no calculated entitlement.
 */
export declare const benefitsRecord: RecordDef;
export declare const journeyCounting: {
    recordType: string;
    counting: "derived_product";
    reason: string;
};
export declare const profileCounting: {
    recordType: string;
    counting: "local";
    reason: string;
};
export declare const registerCounting: {
    recordTypes: readonly ["source", "licence"];
    counting: "register";
    reason: string;
};
