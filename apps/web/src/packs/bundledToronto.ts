import type { PackContent } from "@access/shared";
import { downloadPack, fetchManifest } from "../offline/download.ts";
import { getPack } from "../storage/repository.ts";

// A deep link can arrive before a regional pack has been installed. Read the
// shipped snapshot on demand and verify it using the same checks as an install.
// Visiting a detail never writes a pack or replaces the person's saved copy.
let bundled: Promise<PackContent | null> | undefined;

export async function torontoContent(): Promise<PackContent | null> {
  const saved = await getPack("toronto");
  if (saved) return saved.content;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  const fetchLocal = (path: string, init?: RequestInit) => fetch(`${base}${path}`, init);
  bundled ??= fetchManifest(fetchLocal)
    .then((manifest) => downloadPack(manifest, { fetcher: fetchLocal, nowIso: new Date().toISOString() }))
    .then((pack) => pack.content)
    .catch(() => {
      bundled = undefined;
      return null;
    });
  return bundled;
}
