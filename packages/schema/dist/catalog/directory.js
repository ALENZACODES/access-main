import { fact, systemEnvelope } from "./types.js";
const str = { type: "string" };
const bool = { type: "boolean" };
const date = { type: "date" };
const url = { type: "url" };
/**
 * Benefits and other official-programme directory entries.
 * General information and links only. There is no eligibility result and no calculated entitlement.
 */
export const benefitsRecord = {
    recordType: "benefits_directory",
    schemaVersion: "benefits-directory-1.0.0",
    title: "Benefits directory entry",
    description: "One official programme, linked and dated. Rates carry the source date. The App does not decide eligibility and does not calculate an entitlement.",
    planRef: "Part 3 section 3.10 benefits rules",
    shape: "facts",
    counting: "canonical",
    fields: [
        systemEnvelope("record_id", "id", "Stable id. Does not count.", str),
        systemEnvelope("schema_version", "schema_version", "Schema version. Does not count.", str),
        systemEnvelope("record_status", "record_status", "Publication status. Does not count.", {
            type: "enum",
            values: ["draft", "in_review", "published", "stale_flagged", "archived", "disputed"],
        }),
        fact("name_en", "required", "identity", str, "Programme name in English as published."),
        fact("name_fr", "optional", "identity", str, "French programme name where the official source publishes one.", {
            count: "translation",
            translationOf: "name_en",
        }),
        fact("administering_body", "required", "directory", str, "Body that administers the programme, as named on the official page."),
        fact("organisation_type", "required", "directory", {
            type: "enum",
            values: ["government_federal", "government_provincial", "government_municipal", "other"],
        }, "Which government publishes the page. Not a partnership."),
        fact("benefit_type", "required", "directory", str, "Benefit type in the programme's own words."),
        fact("description_general", "optional", "directory", str, "Short general description. Not eligibility advice."),
        fact("eligibility_general_note", "optional", "directory", str, "General note pointing at the official eligibility page. Not an assessment."),
        fact("application_route", "optional", "directory", str, "How to apply, with the official link and phone."),
        fact("appeal_or_review_route", "optional", "directory", str, "Appeal or review route as published."),
        fact("official_url", "required", "directory", url, "Official programme page."),
        fact("official_url_checked_on", "required", "directory", date, "Date the official page was checked."),
        fact("rate_or_amount_text", "optional", "directory", str, "Rate or amount copied from the official page, as text, with the source date on the fact. Not a calculated entitlement."),
        fact("rate_effective_date", "optional", "directory", date, "Date the published rate took effect, as stated by the programme."),
        fact("indexation_note", "optional", "directory", str, "Indexation note as published."),
        fact("related_programmes", "optional", "directory", { type: "string_array" }, "Related programme names as published. One piece for the array."),
        fact("phone", "optional", "directory", str, "Public phone on the official page."),
        fact("languages_offered", "optional", "directory", { type: "string_array" }, "Languages of service as published."),
        fact("geography", "optional", "directory", str, "Geography the official page says the programme covers."),
        fact("desk_verified_date", "required", "directory", date, "Date of desk verification against the official page."),
        fact("review_due_date", "optional", "directory", date, "Next scheduled check. Quarterly or on indexation."),
        fact("referral_required", "optional", "directory", bool, "Whether the official page says a referral is required.", { triState: true }),
    ],
};
export const journeyCounting = {
    recordType: "journey",
    counting: "derived_product",
    reason: "A journey is assembled from places, stops, segments, and outages. Counting its legs again would double-count those field values. Table T3-12 excludes derived values.",
};
export const profileCounting = {
    recordType: "user_profile",
    counting: "local",
    reason: "The profile stays on the device. It is not a canonical data piece and it is not health data.",
};
export const registerCounting = {
    recordTypes: ["source", "licence"],
    counting: "register",
    reason: "Source and licence rows are provenance. Table T3-12 does not count provenance as data pieces.",
};
//# sourceMappingURL=directory.js.map