# Contributions: offline exports only

The contribution screen stores drafts and sanitized JPEG photos in a dedicated
IndexedDB database. The only way to take contributions off the device is to
explicitly export JSON, GeoJSON or a ZIP containing both formats and photos.
The ZIP uses uncompressed entries for compatibility and requires no service.

Import accepts JSON drafts or GeoJSON created by the screen. Import cannot
restore photos from JSON alone; photo references without local bytes are
removed. Preserve the ZIP to keep the images. Review all files before sharing.

No issue template, issue ingest script, GitHub URL, background upload, network
submission or API endpoint is implemented. This is intentional: offline export
is the entire contribution handoff. There is no moderator or public submission
pipeline in this lane.

The host router owns route registration. Mount the named `ContributePage`
export at `/contribute` and `/contribute/event`. No router files are changed.
