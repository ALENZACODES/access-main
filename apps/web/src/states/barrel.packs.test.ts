import { describe, expect, it } from "vitest";
import * as states from "./index";

describe("the states barrel exposes the pack tools", () => {
  it.each([
    "auditPackPlaces", "assertPackClean", "computePackCoverage", "packCoverageLines", "PackAuditError",
    "readExportRecords", "packPlacesToCsv", "packPlaceToText", "packExportSummary", "PACK_CSV_HEADER", "PACK_CSV_FILENAMES",
    "computeFreshness", "freshnessLines", "freshnessSummary", "PackFreshness",
    "PackReport", "buildPackReport", "packReportToText", "issuesToCsv", "groupIssues", "issueMessage", "findPossibleDuplicates", "saveTextFile", "safeFileName",
    "DataCredits", "buildCredits", "creditRecordsFromPack",
    "Shortlist", "useShortlist", "browserStore", "parseShortlist", "addToShortlist", "resolveShortlist", "buildShortlistTable", "shortlistToText", "SHORTLIST_KEY",
    "moduleStateFor", "escalateView", "SuggestionList", "useFailureStreak", "readTier", "tierLine",
  ])("exports %s", (name) => expect((states as Record<string, unknown>)[name], name).toBeDefined());
});
