# Photo metadata audit (P10-ph)

This file is separate from the shared panel README on purpose. It describes the photo audit in `apps/web/src/privacy/audit/ph*`.

## What it is

A structure reader for JPEG bytes and an audit built on it. It does not decode pictures. It checks the code that cleans a photo before it is stored and exported (`packages/contribute/src/photos.ts`) and the export (`export.ts`), on files built by `phBuild.ts`.

| File | Job |
| --- | --- |
| `phJpeg.ts` | Reads markers, segments, scans, fill bytes and trailers. Never throws. |
| `phTiff.ts` | Reads the EXIF block: GPS, identity and time tags. Never throws. |
| `phRules.ts` | `auditJpeg`: the findings (`ph-exif-gps`, `ph-xmp`, `ph-trailer`, …). |
| `phDiff.ts` | `compareStrip`: what cleaning removed, kept, and changed by mistake. |
| `phStrip.ts` | A reference clean, written from the reader and not from the App's code. |
| `phZip.ts` | Reads the stored-entry ZIP that `exportZip` writes. |
| `phRepo.ts` | Reads source text for photo writes and the picture functions. |
| `phReport.ts` | Plain-text report of findings and diffs. |
| `phBuild.ts` | Test builders for JPEG and EXIF bytes. |

## Rules that pass today

- Every APP0–APP15 segment and comment before the scan is removed, in both byte orders, and nothing else changes.
- Cleaning is stable: cleaning a cleaned file changes nothing.
- `sanitisePhoto` asks for the picture to be turned upright, caps the long side at 2400 px, and frees the bitmap on success and on every failure after decoding.
- A stored photo is written in one place only, after `sanitisePhoto`, in one transaction with its draft.
- Photo entries in the export are named by draft id and photo id.

## Known findings (recorded as tests that fail when the code is fixed)

1. **Trailer kept.** `stripJpegMetadata` copies everything from the first scan on. Bytes after the end of image, including a second JPEG with its own GPS position, stay in the file.
2. **Metadata after the first scan kept.** Application segments and comments between scans or after the scan stay.
3. **Fill bytes and bare markers refused.** A file with `FF FF` fill bytes, or a marker with no length (TEM, RST) before the scan, throws "Malformed JPEG segment", though the format allows them.
4. **No end of image accepted.** A file that stops without an end of image is returned as it is.
5. **File name in the export.** The picked file's name goes into the draft (`photos[].name`) and so into `contributions.json`.
6. **No second clean at export.** Stored bytes are written unchanged; a photo stored with metadata leaves with it. The page cleans before storing, so this depends on that single path.

Findings 1–2 matter only if a browser's encoder writes such bytes. This was not checked against any real browser.

## Not checked

- Real phone or camera files, and what a real browser's encoder writes.
- Pictures themselves: no decoding, no pixel checks.
- ICC profile contents beyond the segment being removed.
- Other lanes' files were read, not changed.
