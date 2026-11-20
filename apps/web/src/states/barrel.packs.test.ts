import { describe, expect, it } from "vitest";
import * as states from "./index";

describe("the states barrel exposes the pack tools", () => {
  it.each([
    "auditPackPlaces", "assertPackClean", "computePackCoverage", "packCoverageLines", "PackAuditError",
    "readExportRecords", "packPlacesToCsv", "packPlaceToText", "packExportSummary", "PACK_CSV_HEADER", "PACK_CSV_FILENAMES",
    "computeFreshness", "freshnessLines", "freshnessSummary", "PackFreshness",
    "PackReport", "buildPackReport", "packReportToText", "issuesToCsv", "groupIssues", "issueMessage", "findPossibleDuplicates", "saveTextFile", "safeFileName",
    "PackBands", "buildBands", "bandOf", "filterByBand", "bandsToCsv", "bandsToText", "BAND_EDGES_M", "PackNearest", "nearestByTag",
    "PackCategories", "buildKindRows", "kindKey", "kindLabel", "filterByKind", "summariseKinds", "kindsLine", "kindsToCsv", "kindsToText", "KIND_CSV_HEADER",
    "PackCompare", "readEarlierFile", "diffPacks", "changesFor", "diffToCsv", "diffToText", "diffSummaryLine", "parseCsv", "undoFormulaGuard",
    "PackTagMoves", "buildTagMoves", "tagMovesToCsv", "tagMovesToText", "rankedMoves", "MOVE_KEYS",
    "DataCredits", "buildCredits", "creditRecordsFromPack",
    "VisitPlan", "buildVisitPlan", "questionsFor", "visitPlanToText", "visitPlanToCsv", "toggleDone", "QUESTION_TOPICS", "filterPlan", "VISIT_FILTERS", "draftMessage", "mailtoHref",
    "NoteTopics", "TOPIC_IDS", "TOPICS", "topicLabel", "isTopicId", "CUE_TO_TOPIC", "scanTopics", "topicWordSpans", "topicMarkSegments", "buildTopicIndex", "topicEntryFor", "topicTallyAddsUp", "TOPIC_TAG_ORDER", "filterTopicEntries", "orderTopicEntries", "topicsInUse", "entryUsesTopic", "NO_TOPIC_FILTER", "topicsToText", "topicEntriesToCsv", "topicTableToCsv", "TOPIC_CSV_HEADER",
    "PlaceSheet", "ShortlistFiles", "GapMatrix", "Handout", "ListTransfer", "listToCode", "parseListCode", "planImport", "importSummary", "LIST_CODE_HEADER", "buildHandout", "handoutToHtml", "handoutToText", "parseHandoutOptions", "escapeHandoutHtml", "handoutCss", "handoutTitle", "placeSheetToText", "buildGapMatrix", "gapSentence", "cellWord", "gapMatrixToCsv", "buildPlaceSheet", "sheetSummary", "placeToVcard", "placesToVcards", "placesToGpx", "foldVcardLine", "escapeXml",
    "StreetIndex", "buildStreetIndex", "parseAddress", "parityOf", "foldAddressText", "streetSummary", "streetCaveat", "streetGroupLine", "orderGroups", "orderLabel", "compareNames", "STREET_ORDERS", "DEFAULT_STREET_ORDER", "filterStreets", "keyWord", "addMany", "addManySentence", "streetIndexToText", "streetIndexToCsv", "STREET_TEXT_FILENAMES", "STREET_CSV_FILENAMES",
    "VenueGroups", "buildVenueGroups", "readName", "foldVenueName", "venueBase", "venueDisplayBase", "venuePartKind", "venuePartLabel", "PART_KINDS", "VENUE_RADIUS_METRES", "onlyDiffering", "venueSummary", "venueCaveat", "groupHeading", "memberDistance", "venuesToText", "venuesToCsv", "VENUE_TEXT_FILENAMES", "VENUE_ORDERS", "DEFAULT_VENUE_ORDER", "NO_VENUE_FILTER", "venueOrderLabel", "orderVenues", "filterVenues", "kindCounts", "kindSentence", "spanSentence", "TAG_COLUMNS", "kindTagRows", "venueNotes", "venueNoteText", "VENUE_CSV_FILENAMES",
    "TextMap", "DistanceMatrix", "buildDistanceMatrix", "cellText", "matrixSummary", "matrixCaveat", "matrixToText", "matrixToCsv", "MAX_MATRIX_PLACES", "buildTextMap", "buildAround", "bearingDegrees", "compassOf", "compassName", "locate", "partOf", "tagMix", "cellSentence", "gridSummary", "directionLine", "textMapToText", "aroundToText", "textMapToCsv", "aroundToCsv", "GRID_SIZES", "COMPASS",
    "Shortlist", "useShortlist", "browserStore", "parseShortlist", "addToShortlist", "resolveShortlist", "buildShortlistTable", "shortlistToText", "SHORTLIST_KEY",
    "OutingPlanner", "buildOuting", "nearestOrder", "reconcileOrder", "moveStop", "outingToText", "outingToCsv", "outingToGeoJson", "parsePace",
    "moduleStateFor", "escalateView", "SuggestionList", "useFailureStreak", "readTier", "tierLine",
  ])("exports %s", (name) => expect((states as Record<string, unknown>)[name], name).toBeDefined());
});
