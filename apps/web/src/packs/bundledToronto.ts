/** The Toronto pack shipped at /packs/toronto, used when a route id matches a record in that file. */

export interface BundledPlace {
  id: string;
  name: string;
}

export interface BundledHelp {
  id: string;
  name: { en: string; fr: string };
}

interface PackFile {
  places?: Array<{ id?: unknown; name?: unknown }>;
  help_numbers?: Array<{ id?: unknown; name?: unknown }>;
}

let pending: Promise<PackFile | null> | undefined;

function packUrl(): string {
  const base = import.meta.env.BASE_URL ?? "/";
  const prefix = base.endsWith("/") ? base : `${base}/`;
  return `${prefix}packs/toronto/content.json`;
}

async function loadPack(): Promise<PackFile | null> {
  pending ??= (async () => {
    try {
      const response = await fetch(packUrl());
      if (!response.ok) return null;
      return (await response.json()) as PackFile;
    } catch {
      return null;
    }
  })();
  return pending;
}

function bilingualName(value: unknown): { en: string; fr: string } | null {
  if (typeof value === "string" && value.trim()) return { en: value, fr: value };
  if (value && typeof value === "object") {
    const record = value as { en?: unknown; fr?: unknown };
    const en = typeof record.en === "string" ? record.en.trim() : "";
    const fr = typeof record.fr === "string" ? record.fr.trim() : "";
    if (en && fr) return { en, fr };
  }
  return null;
}

export async function bundledPlace(id: string): Promise<BundledPlace | null> {
  if (!id) return null;
  const pack = await loadPack();
  const row = pack?.places?.find((place) => place.id === id);
  const name = bilingualName(row?.name);
  return row && typeof row.id === "string" && name ? { id: row.id, name: name.en } : null;
}

export async function bundledHelp(id: string): Promise<BundledHelp | null> {
  if (!id) return null;
  const pack = await loadPack();
  const row = pack?.help_numbers?.find((item) => item.id === id);
  const name = bilingualName(row?.name);
  return row && typeof row.id === "string" && name ? { id: row.id, name } : null;
}
