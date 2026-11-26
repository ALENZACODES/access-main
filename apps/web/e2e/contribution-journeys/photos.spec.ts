import { expect, test, type Page } from "@playwright/test";
import type { Draft } from "../../../../packages/contribute/src/schema";
import { readStoredZip } from "./exportedFiles";

async function png(page: Page, name: string) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 14;
    canvas.height = 10;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Expected real canvas");
    context.fillStyle = "royalblue";
    context.fillRect(2, 2, 10, 6);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  if (!encoded) throw new Error("Could not create sample image");
  return { name, mimeType: "image/png", buffer: Buffer.from(encoded, "base64") };
}

async function addField(page: Page) {
  await page.getByLabel("Field name", { exact: true }).fill("entrance_width_cm");
  await page.getByLabel("Observed value", { exact: true }).fill("92");
  await page.getByRole("button", { name: "Add or update field", exact: true }).click();
}

async function database(page: Page) {
  return page.evaluate(async () => {
    function result<T>(request: IDBRequest<T>): Promise<T> {
      return new Promise((resolve, reject) => {
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
    }
    const db = await result(indexedDB.open("access-contributions-local"));
    try {
      const tx = db.transaction(["drafts", "photos"], "readonly");
      const [drafts, rows] = await Promise.all([
        result<Draft[]>(tx.objectStore("drafts").getAll()),
        result<Array<{ id: string; draftId: string; data: Blob }>>(tx.objectStore("photos").getAll()),
      ]);
      const photos = await Promise.all(rows.map(async row => ({
        id: row.id,
        draftId: row.draftId,
        type: row.data.type,
        bytes: [...new Uint8Array(await row.data.arrayBuffer())],
      })));
      return { drafts, photos };
    } finally {
      db.close();
    }
  });
}

// Control exactly one decode while still using Chromium's real decoder and encoder.
async function holdNextDecode(page: Page) {
  await page.evaluate(() => {
    const decode = window.createImageBitmap;
    const wait = new Promise<void>(resolve => {
      window.addEventListener("photo-test-release", () => resolve(), { once: true });
    });
    window.createImageBitmap = (async (source: Blob, options?: ImageBitmapOptions) => {
      window.createImageBitmap = decode;
      await wait;
      return decode(source, options);
    }) as typeof createImageBitmap;
  });
}

async function finishDecode(page: Page) {
  await page.evaluate(() => new Promise<void>(resolve => {
    const close = ImageBitmap.prototype.close;
    ImageBitmap.prototype.close = function () {
      ImageBitmap.prototype.close = close;
      close.call(this);
      // Let the session consume the sanitizer result before reading the editor again.
      setTimeout(resolve, 0);
    };
    window.dispatchEvent(new Event("photo-test-release"));
  }));
}

function fileInput(page: Page) {
  return page.getByLabel("Add photos", { exact: true });
}

function saveButton(page: Page) {
  return page.getByRole("button", { name: "Save on this device", exact: true });
}

async function zipFromEditor(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export ZIP (JSON, GeoJSON and photos)", exact: true }).click();
  return readStoredZip(await download);
}

test.beforeEach(async ({ page }) => {
  await page.goto("/contribute");
  await expect(fileInput(page)).toBeVisible();
});

test("an invalid draft can prepare a photo without creating an orphan if the tab reloads", async ({ page }) => {
  await fileInput(page).setInputFiles(await png(page, "ramp.png"));
  await expect(page.getByText("Photos in this draft: 1", { exact: true })).toBeVisible();
  await expect(saveButton(page)).toBeDisabled();
  expect(await database(page)).toEqual({ drafts: [], photos: [] });

  await page.reload();
  await expect(page.getByText("Photos in this draft: 0", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Delete: photo/ })).toHaveCount(0);
  expect(await database(page)).toEqual({ drafts: [], photos: [] });
});

test("a slow photo keeps its selected licence and preserves a field and note typed during decode", async ({ page }) => {
  await page.getByRole("combobox", { name: "Photo licence", exact: true }).selectOption("CC BY-SA 4.0");
  await holdNextDecode(page);
  await fileInput(page).setInputFiles(await png(page, "landing.png"));
  await expect(fileInput(page)).toBeDisabled();
  await addField(page);
  await page.getByRole("textbox", { name: "Notes (optional)", exact: true }).fill("Second visit at noon");
  await page.getByRole("combobox", { name: "Photo licence", exact: true }).selectOption("CC BY 4.0");
  await expect(saveButton(page)).toBeDisabled();

  await finishDecode(page);
  await expect(saveButton(page)).toBeEnabled();
  await expect(page.getByText("Photos in this draft: 1", { exact: true })).toBeVisible();
  expect(await database(page)).toEqual({ drafts: [], photos: [] });

  await saveButton(page).click();
  await expect(page.getByText("Draft saved locally", { exact: true })).toBeVisible();
  const { drafts, photos } = await database(page);
  expect(drafts).toHaveLength(1);
  expect(drafts[0]).toMatchObject({
    note: "Second visit at noon",
    changes: { entrance_width_cm: { value: 92 } },
    photos: [{ name: "landing.png", licence: "CC BY-SA 4.0", mime: "image/jpeg" }],
  });
  expect(photos).toHaveLength(1);
  expect(photos[0]).toMatchObject({
    id: drafts[0]?.photos[0]?.id,
    draftId: drafts[0]?.id,
    type: "image/jpeg",
  });
  expect(photos[0]?.bytes.slice(0, 2)).toEqual([255, 216]);
  expect(photos[0]?.bytes.slice(-2)).toEqual([255, 217]);
});

test("switching away while an image decodes discards the old bytes and status", async ({ page }) => {
  await holdNextDecode(page);
  await fileInput(page).setInputFiles(await png(page, "discarded.png"));
  await expect(fileInput(page)).toBeDisabled();

  await page.getByRole("button", { name: "New draft", exact: true }).click();
  await page.getByRole("button", { name: "Discard and start new draft", exact: true }).click();
  await expect(fileInput(page)).toBeEnabled();
  await page.getByRole("textbox", { name: "Notes (optional)", exact: true }).fill("New draft after switching");
  await finishDecode(page);

  await expect(page.getByText("Photos in this draft: 0", { exact: true })).toBeVisible();
  await expect(page.getByText(/Photos ready\./)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Notes (optional)", exact: true })).toHaveValue("New draft after switching");
  await addField(page);
  await saveButton(page).click();
  await expect(page.getByText("Draft saved locally", { exact: true })).toBeVisible();
  const snapshot = await database(page);
  expect(snapshot.drafts).toHaveLength(1);
  expect(snapshot.drafts[0]?.photos).toEqual([]);
  expect(snapshot.photos).toEqual([]);
});

test("a corrupt sibling rejects the batch and the same valid file can immediately retry", async ({ page }) => {
  const good = await png(page, "curb.png");
  await fileInput(page).setInputFiles([
    good,
    { name: "corrupt.png", mimeType: "image/png", buffer: Buffer.from("damaged image") },
  ]);
  await expect(page.getByText(/Could not prepare these photos/)).toBeVisible();
  await expect(fileInput(page)).toBeEnabled();
  await expect(fileInput(page)).toHaveValue("");
  await expect(page.getByText("Photos in this draft: 0", { exact: true })).toBeVisible();
  expect(await database(page)).toEqual({ drafts: [], photos: [] });

  await fileInput(page).setInputFiles(good);
  await expect(page.getByText("Photos in this draft: 1", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Delete: photo, curb.png", exact: true })).toBeVisible();
});

test("the 20-photo cap rejects an oversized batch and leaves existing photos intact", async ({ page }) => {
  const file = await png(page, "doorway.png");
  await fileInput(page).setInputFiles(file);
  await expect(page.getByText("Photos in this draft: 1", { exact: true })).toBeVisible();

  const extra = Array.from({ length: 20 }, (_, index) => ({ ...file, name: `door-${index}.png` }));
  await fileInput(page).setInputFiles(extra);
  await expect(page.getByText("A draft can contain up to 20 photos.", { exact: true })).toBeVisible();
  await expect(page.getByText("Photos in this draft: 1", { exact: true })).toBeVisible();
  await expect(fileInput(page)).toBeEnabled();

  await fileInput(page).setInputFiles(extra.slice(1));
  await expect(page.getByText("Photos in this draft: 20", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Delete: photo,/ })).toHaveCount(20);
  expect(await database(page)).toEqual({ drafts: [], photos: [] });
});

test("ZIP includes staged JPEG bytes and the same licensed reference before and after Save", async ({ page }) => {
  await addField(page);
  const input = await png(page, "entry.png");
  await fileInput(page).setInputFiles(input);
  await expect(page.getByText("Photos in this draft: 1", { exact: true })).toBeVisible();

  const before = await zipFromEditor(page);
  const [draft] = JSON.parse(before.get("contributions.json")!.toString()) as Draft[];
  const photo = draft?.photos[0];
  expect(photo).toMatchObject({ name: "entry.png", licence: "CC BY 4.0", mime: "image/jpeg" });
  const path = `photos/${draft?.id}/${photo?.id}.jpg`;
  expect([...before.keys()]).toEqual(["contributions.json", "contributions.geojson", path]);
  const image = before.get(path);
  expect(image?.subarray(0, 2)).toEqual(Buffer.from([255, 216]));
  expect(image).not.toEqual(input.buffer);
  expect(await database(page)).toEqual({ drafts: [], photos: [] });

  await saveButton(page).click();
  await expect(page.getByText("Draft saved locally", { exact: true })).toBeVisible();
  const saved = await database(page);
  expect(saved.drafts).toEqual([draft]);
  expect(saved.photos[0]?.bytes).toEqual([...(image ?? [])]);
  expect(await zipFromEditor(page)).toEqual(before);
});

test("removing an attachment changes the exported draft immediately and the saved bytes only on Save", async ({ page }) => {
  await addField(page);
  await fileInput(page).setInputFiles(await png(page, "lift.png"));
  const remove = page.getByRole("button", { name: "Delete: photo, lift.png", exact: true });
  await expect(remove).toBeVisible();
  await saveButton(page).click();
  await expect(page.getByText("Draft saved locally", { exact: true })).toBeVisible();
  const original = await database(page);

  await remove.click();
  await expect(remove).toHaveCount(0);
  const without = await zipFromEditor(page);
  expect([...without.keys()]).toEqual(["contributions.json", "contributions.geojson"]);
  expect(await database(page)).toEqual(original);

  await page.getByRole("button", { name: /^Edit: draft 1,/ }).click();
  await page.getByRole("button", { name: "Discard and open draft", exact: true }).click();
  await expect(remove).toBeVisible();
  expect(await database(page)).toEqual(original);

  await remove.click();
  await saveButton(page).click();
  await expect(page.getByText("Draft saved locally", { exact: true })).toBeVisible();
  const final = await database(page);
  expect(final.photos).toEqual([]);
  expect(final.drafts[0]).toEqual({ ...original.drafts[0], photos: [] });
});

test("French readers get a localized retry message without losing an earlier attachment", async ({ page }) => {
  await page.getByRole("button", { name: "Français", exact: true }).click();
  const input = page.getByLabel("Ajouter des photos", { exact: true });
  await expect(input).toBeVisible();
  await input.setInputFiles(await png(page, "entree.png"));
  await expect(page.getByText("Photos dans ce brouillon: 1", { exact: true })).toBeVisible();

  await input.setInputFiles({ name: "texte.txt", mimeType: "text/plain", buffer: Buffer.from("note") });
  await expect(page.getByText(/Impossible de préparer ces photos/)).toBeVisible();
  await expect(input).toBeEnabled();
  await expect(page.getByRole("button", { name: /^Supprimer\s: photo, entree.png$/ })).toBeVisible();
  expect(await database(page)).toEqual({ drafts: [], photos: [] });
});

test("a legacy draft exports unusual and case-colliding IDs with distinct paths and a readable index", async ({ page }) => {
  await addField(page);
  await fileInput(page).setInputFiles(await png(page, "visible-name.png"));
  await expect(page.getByText("Photos in this draft: 1", { exact: true })).toBeVisible();
  await saveButton(page).click();
  await expect(page.getByText("Draft saved locally", { exact: true })).toBeVisible();
  const snapshot = await database(page);
  const old = snapshot.drafts[0];
  const oldRef = old?.photos[0];
  const jpeg = snapshot.photos[0]?.bytes;
  if (!old || !oldRef || !jpeg) throw new Error("Missing prepared photo");
  const ids = ["Lobby", "lobby", "Étage / ouest", "CON.txt", "west."];
  const legacy: Draft = {
    ...old,
    id: "Audit / visite",
    photos: ids.map(id => ({ ...oldRef, id })),
  };
  // Older local records can use arbitrary identifiers within the version-one schema.
  await page.evaluate(({ draft, data }) => new Promise<void>((resolve, reject) => {
    const open = indexedDB.open("access-contributions-local");
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const db = open.result;
      const tx = db.transaction(["drafts", "photos"], "readwrite");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
      tx.objectStore("drafts").clear();
      tx.objectStore("photos").clear();
      tx.objectStore("drafts").put(draft);
      for (const ref of draft.photos) {
        tx.objectStore("photos").put({
          id: ref.id,
          draftId: draft.id,
          data: new Blob([new Uint8Array(data)], { type: "image/jpeg" }),
        });
      }
    };
  }), { draft: legacy, data: jpeg });

  await page.reload();
  await page.getByRole("button", { name: /^Edit: draft 1,/ }).click();
  const files = await zipFromEditor(page);
  expect(JSON.parse(files.get("contributions.json")!.toString())).toEqual([legacy]);
  const index = JSON.parse(files.get("photo-paths.json")!.toString()) as Array<{
    draftId: string;
    photoId: string;
    path: string;
  }>;
  expect(index.map(row => row.photoId)).toEqual(ids);
  expect(new Set(index.map(row => row.path.toLowerCase())).size).toBe(ids.length);
  for (const row of index) {
    expect(row.draftId).toBe(legacy.id);
    expect(row.path).toMatch(/^photos\/~\d+\/(Lobby|~\d+)\.jpg$/);
    expect(files.get(row.path)).toEqual(Buffer.from(jpeg));
  }
  expect(files.size).toBe(ids.length + 3);
});
