import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { configFile } from "./pwaFixture";
import { bytesOf, loadPwa, PWA_CONFIG_PATH, PWA_PUBLIC_DIR, readConfigText } from "./pwaFiles";

function tree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "pwa-"));
  for (const [path, text] of Object.entries(files)) {
    const full = join(root, path);
    mkdirSync(join(full, ".."), { recursive: true });
    writeFileSync(full, text, "latin1");
  }
  return root;
}

describe("bytesOf", () => {
  it("keeps every byte", () => expect(Array.from(bytesOf("\u0000\u0001ÿ\u0089PNG"))).toEqual([0, 1, 255, 137, 80, 78, 71]));
  it("keeps only the low byte of a character that is wider", () => expect(Array.from(bytesOf("Ł"))).toEqual([0x41]));
  it("is empty for no text", () => expect(bytesOf("").length).toBe(0));
});

describe("readConfigText", () => {
  it("reads the text of the configuration", () => expect(readConfigText(tree({ [PWA_CONFIG_PATH]: "x" }))).toBe("x"));
  it("is null when the file is not there, or is a folder", () => {
    expect(readConfigText(tree({}))).toBeNull();
    expect(readConfigText(tree({ [`${PWA_CONFIG_PATH}/inner`]: "x" }))).toBeNull();
  });
});

describe("loadPwa", () => {
  const png = "\u0089PNG\r\n\u001a\n";
  it("reads the configuration and the files it names", () => {
    const root = tree({
      [PWA_CONFIG_PATH]: configFile(),
      [`${PWA_PUBLIC_DIR}/favicon.svg`]: "<svg/>",
      [`${PWA_PUBLIC_DIR}/icons/icon-192.png`]: png,
      [`${PWA_PUBLIC_DIR}/icons/icon-512.png`]: png,
    });
    const l = loadPwa(root);
    expect(l.config.found).toBe(true);
    expect([...l.files.keys()]).toEqual(["favicon.svg", "icons/icon-192.png", "icons/icon-512.png"]);
    expect(Array.from(l.files.get("icons/icon-192.png") ?? [])).toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
  it("gives null for a named file that is not there", () => {
    const l = loadPwa(tree({ [PWA_CONFIG_PATH]: configFile(), [`${PWA_PUBLIC_DIR}/favicon.svg`]: "<svg/>" }));
    expect(l.files.get("favicon.svg")).not.toBeNull();
    expect(l.files.get("icons/icon-192.png")).toBeNull();
  });
  it("gives a configuration with no call when the file is not there", () => {
    const l = loadPwa(tree({}));
    expect(l.config.found).toBe(false);
    expect(l.files.size).toBe(0);
  });
  it("does not read a file outside the public folder that a path with .. names", () => {
    const root = tree({ [PWA_CONFIG_PATH]: configFile().replace('"favicon.svg"', '"../../../../secret.txt"'), "secret.txt": "x" });
    expect(loadPwa(root).files.get("../../../../secret.txt")).toBeNull();
  });
});
