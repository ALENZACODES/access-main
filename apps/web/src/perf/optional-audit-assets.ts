/**
 * The narrow-screen audit is an optional diagnostic screen, not part of the
 * essential offline shell. Its own hashed JS chunk loads on first visit and
 * Workbox keeps that chunk for later offline use.
 *
 * Keep the glob, runtime route and install guard aligned. Never exclude the
 * recovery centre or an offline pack from the initial app installation.
 */
export const ON_DEMAND_AUDIT_GLOB = "**/NarrowAuditPage-*.js";

/** Workbox matches hashed audit bundles on root and sub-path deployments. */
export const ON_DEMAND_AUDIT_URL_PATTERN =
  /\/assets\/NarrowAuditPage-[A-Za-z0-9_-]+\.js$/;

/** Called by the build guard on paths relative to web/dist. */
export function isOnDemandAuditAsset(relativePath: string): boolean {
  return /^assets\/NarrowAuditPage-[A-Za-z0-9_-]+\.js$/.test(relativePath);
}
