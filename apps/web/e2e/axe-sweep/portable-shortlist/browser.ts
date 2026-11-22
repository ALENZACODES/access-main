import { createHash } from "node:crypto";
import { expect, type Locator, type Page } from "@playwright/test";

export type Language = "en" | "fr";
export interface FixturePlace {
  id: string;
  name: string;
  address?: string;
  category?: string;
  wheelchair?: string;
  wheelchair_description?: string;
  provenance?: {
    source_name: string;
    licence: string;
    source_url: string;
    retrieved_at: string;
    tier: number;
  };
  lat?: number;
  lon?: number;
}

// Exercise folding, punctuation and non-ASCII text in all the file formats.
// The second place intentionally has neither a source nor a position.
export function samplePlaces(): [FixturePlace, FixturePlace, FixturePlace] {
  return [
    {
      id: "sample/41",
      name: "Atelier des Érables, entrée « ouest » & cour",
      address: "24, rue du Parc; bureau B",
      category: "studio",
      wheelchair: "limited",
      wheelchair_description: "Sonner à la deuxième porte.",
      lat: 43.6543219,
      lon: -79.3812375,
      provenance: {
        source_name: "Sample pack publisher",
        licence: "ODbL-1.0",
        source_url: "https://example.org/places?id=41&edition=a",
        retrieved_at: "2026-01-09",
        tier: 1,
      },
    },
    { id: "sample-41", name: "Room <B> & Annex" },
    {
      id: "sample-north",
      name: "North Hall",
      category: "hall",
      lat: 44.0,
      lon: -80.0,
      wheelchair: "yes",
    },
  ];
}

/** Install an existing pack as it would be found on a returning device.
 * Let the app create its own IndexedDB schema. Change only the pack record.
 * A cold reload then exercises the normal repository and /places entry point.
 */
export async function openWithPack(page: Page, places: readonly FixturePlace[], language: Language) {
  await page.goto("/");
  const button = page.getByRole("button", { name: language === "fr" ? "Français" : "English", exact: true });
  await button.click();
  await expect(page.locator("html")).toHaveAttribute("lang", language);
  await replacePack(page, places);
  await page.goto("/places");
  await expect(page.getByRole("button", { name: /Move your list to another device|Transférer votre liste vers un autre appareil/ })).toBeVisible();
}

export async function replacePack(page: Page, places: readonly FixturePlace[]) {
  const schema = "offline-pack-1.0.0";
  const content = {
    schema_version: schema,
    pack_id: "toronto",
    places,
    help_numbers: [],
    elevator_status: [],
    journeys: [],
  };
  const bytes = Buffer.from(JSON.stringify(content));
  const pack = {
    pack_id: "toronto",
    stored_at: "2026-01-12T12:00:00Z",
    content,
    manifest: {
      schema_version: schema,
      pack_id: "toronto",
      title: { en: "Test pack", fr: "Pack de test" },
      built_at: "2026-01-12",
      content_path: "/packs/toronto/content.json",
      size_bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      source_dates: [],
      counts: { places: places.length, help_numbers: 0, elevator_status: 0, journeys: 0 },
    },
  };
  await storeDevicePack(page, pack);
}

export async function storeDevicePack(page: Page, pack: { pack_id: string }) {
  await expect.poll(() => page.evaluate(async () => {
    const databases = await indexedDB.databases();
    return databases.some((db) => db.name === "access-app" && Number(db.version) > 0);
  })).toBe(true);
  await page.evaluate((value) => new Promise<void>((resolve, reject) => {
    const request = indexedDB.open("access-app");
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      try {
        const tx = database.transaction("packs", "readwrite");
        tx.onabort = () => { database.close(); reject(tx.error ?? new Error("Pack transaction aborted")); };
        tx.oncomplete = () => { database.close(); resolve(); };
        tx.objectStore("packs").put(value);
      } catch (error) {
        database.close();
        reject(error);
      }
    };
  }), pack);
}

export function placeToggle(page: Page, name: string): Locator {
  const card = page.locator("li.pack-place").filter({ has: page.getByRole("heading", { name, exact: true }) });
  return card.getByRole("button", { name: /^(Add to list|Remove from list|Ajouter à la liste|Retirer de la liste) / });
}

export async function selectPlace(page: Page, place: Pick<FixturePlace, "name">) {
  const toggle = placeToggle(page, place.name);
  await expect(toggle).toHaveAttribute("aria-pressed", "false");
  await toggle.focus();
  await toggle.press("Space");
  await expect(toggle).toHaveAttribute("aria-pressed", "true");
}

export function listRegion(page: Page) {
  return page.getByRole("region", { name: /^(Your list|Votre liste) \(/ });
}

export function comparisonRows(page: Page) {
  return listRegion(page).getByRole("region", { name: /^(Comparison table|Tableau de comparaison)$/ })
    .getByRole("rowheader");
}

/** Listen before pressing Enter. Read the actual completed download as strict UTF-8. */
export async function downloadText(page: Page, trigger: Locator, filename: string) {
  await trigger.focus();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    trigger.press("Enter"),
  ]);
  expect(download.suggestedFilename()).toBe(filename);
  expect(await download.failure()).toBeNull();
  const stream = await download.createReadStream();
  if (!stream) throw new Error("Browser returned no download stream");
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(Buffer.from(chunk));
  const bytes = Buffer.concat(chunks);
  expect(bytes.length).toBeGreaterThan(0);
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function storedList(page: Page): Promise<unknown> {
  return page.evaluate(() => JSON.parse(localStorage.getItem("app.pack-shortlist.v1") ?? "[]") as unknown);
}

export async function openTransfer(page: Page) {
  const trigger = page.getByRole("button", { name: /^(Move your list to another device|Transférer votre liste vers un autre appareil|Hide moving your list|Masquer le transfert de la liste)$/ });
  await trigger.focus();
  await trigger.press("Enter");
  await expect(trigger).toHaveAttribute("aria-expanded", "true");
  const panelId = await trigger.getAttribute("aria-controls");
  if (!panelId) throw new Error("List transfer disclosure has no associated panel");
  const panel = page.locator("[data-list-transfer] > div");
  await expect(panel).toHaveAttribute("id", panelId);
  return panel;
}

export async function denyClipboardWrites(page: Page) {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: () => Promise.reject(new DOMException("Clipboard unavailable", "NotAllowedError")),
      },
    });
  });
}
