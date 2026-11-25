// The privacy panel's two import inputs check the size of the chosen file before the file is read. A file over the
// limit is refused with the same message as before, without its text being read, and without the passphrase being used.

import { describe, expect, it } from "vitest";
import { createPrivacyController, type ControllerDeps, type PrivacyController } from "./controller";
import { FIXTURE, PREFIX } from "./fixtures.test-util";
import { MAX_IMPORT_BYTES } from "./importData";
import { mountPrivacyPanel, type ActionTarget, type PanelEvent, type PanelRoot } from "./mount";
import { MAX_PROTECTED_BYTES } from "./protectedBackup";
import { createMemoryStorage } from "./storage";
import { PANEL_STRINGS } from "./strings";

const NOW = new Date(2026, 10, 21, 9, 0, 0);
const CRYPTO = { crypto: globalThis.crypto, protectedIterations: 1000, minProtectedIterations: 1000 } as const;

interface FakeFile {
  size?: number;
  text(): Promise<string>;
  reads: number;
}

const fakeFile = (size: number | undefined, text = "{}", fail = false): FakeFile => {
  const f: FakeFile = {
    ...(size === undefined ? {} : { size }),
    reads: 0,
    text: () => {
      f.reads += 1;
      return fail ? Promise.reject(new Error("unreadable")) : Promise.resolve(text);
    },
  };
  return f;
};

class FakeRoot implements PanelRoot {
  innerHTML = "";
  focused: string[] = [];
  passphrase = "";
  private handlers = new Map<string, Array<(e: PanelEvent) => void>>();
  addEventListener(type: "click" | "change", handler: (e: PanelEvent) => void): void {
    this.handlers.set(type, [...(this.handlers.get(type) ?? []), handler]);
  }
  querySelector(selector: string): { focus(): void; value?: string } | null {
    if (selector === "[data-protected-pass]") return { focus: () => undefined, value: this.passphrase };
    return { focus: () => this.focused.push(selector) };
  }
  choose(marker: "data-import-file" | "data-protected-file", files: ArrayLike<FakeFile> | null): void {
    const event: PanelEvent = {
      target: { closest: (selector: string): ActionTarget | null => (selector === `[${marker}]` ? { getAttribute: () => null, files } : null) },
    };
    for (const h of this.handlers.get("change") ?? []) h(event);
  }
}

function setup(patch: Partial<ControllerDeps> = {}) {
  const storage = createMemoryStorage({ [`${PREFIX}a`]: "1" });
  const controller: PrivacyController = createPrivacyController({ storage, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...CRYPTO, ...patch });
  const root = new FakeRoot();
  mountPrivacyPanel(root, controller);
  return { root, controller, storage };
}

/** Waits until the condition holds, polling for at most two seconds, so a slow decrypt is waited for rather than guessed at. */
async function until(done: () => boolean): Promise<void> {
  for (let i = 0; i < 200 && !done(); i += 1) await new Promise((r) => setTimeout(r, 10));
}

const settle = async (): Promise<void> => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

describe("the limits", () => {
  it("are the ones the copy talks about: 1 MB for a data file, a little more for a protected one", () => {
    expect(MAX_IMPORT_BYTES).toBe(1_000_000);
    expect(MAX_PROTECTED_BYTES).toBe(1_500_000);
    expect(PANEL_STRINGS.en.status({ kind: "import-problem", code: "too-large" })).toBe("That file is too large. The limit is 1 MB.");
  });
});

describe("a data file over the limit", () => {
  it("is refused without being read", async () => {
    const { root } = setup();
    const f = fakeFile(MAX_IMPORT_BYTES + 1);
    root.choose("data-import-file", [f]);
    await settle();
    expect(f.reads).toBe(0);
    expect(root.innerHTML).toContain("That file is too large. The limit is 1 MB.");
    expect(root.focused.at(-1)).toBe("[data-privacy-status]");
  });

  it("is refused at the next byte over, and a file of exactly the limit is read", async () => {
    const at = setup();
    const exact = fakeFile(MAX_IMPORT_BYTES);
    at.root.choose("data-import-file", [exact]);
    await settle();
    expect(exact.reads).toBe(1);
    const over = setup();
    const more = fakeFile(MAX_IMPORT_BYTES + 1);
    over.root.choose("data-import-file", [more]);
    await settle();
    expect(more.reads).toBe(0);
  });

  it("is refused in French in French", async () => {
    const { root, controller } = setup();
    controller.dispatch({ type: "set-locale", locale: "fr" });
    root.choose("data-import-file", [fakeFile(5_000_000)]);
    await settle();
    expect(root.innerHTML).toContain("Ce fichier est trop gros. La limite est de 1 Mo.".replace(" ", " ").replace("1 Mo", "1 Mo"));
  });

  it("leaves nothing waiting to be confirmed and changes nothing stored", async () => {
    const { root, controller, storage } = setup();
    root.choose("data-import-file", [fakeFile(MAX_IMPORT_BYTES * 10)]);
    await settle();
    expect(controller.getState().importPending).toBe(false);
    expect(controller.getState().status).toEqual({ kind: "import-problem", code: "too-large" });
    expect(storage.getItem(`${PREFIX}a`)).toBe("1");
    expect(storage.length).toBe(1);
  });

  it("does not leave an earlier waiting import in place", async () => {
    const { root, controller } = setup();
    const good = JSON.stringify({ format: "access-local-data", version: 1, exportedAt: NOW.toISOString(), items: { [`${PREFIX}b`]: "2" } });
    root.choose("data-import-file", [fakeFile(good.length, good)]);
    await settle();
    root.choose("data-import-file", [fakeFile(MAX_IMPORT_BYTES + 1)]);
    await settle();
    expect(controller.getState().importPending).toBe(false);
  });
});

describe("a data file within the limit", () => {
  it("is read, then handled by the same rules as before", async () => {
    const { root, controller } = setup();
    const f = fakeFile(10, "not json");
    root.choose("data-import-file", [f]);
    await settle();
    expect(f.reads).toBe(1);
    expect(controller.getState().status).toEqual({ kind: "import-problem", code: "not-json" });
  });

  it("is read when the browser gives no size", async () => {
    const { root, controller } = setup();
    const f = fakeFile(undefined, "not json");
    root.choose("data-import-file", [f]);
    await settle();
    expect(f.reads).toBe(1);
    expect(controller.getState().status).toEqual({ kind: "import-problem", code: "not-json" });
  });

  it("is still stopped by the length of its text when the size it gave was wrong", async () => {
    const { root, controller } = setup();
    const big = "x".repeat(MAX_IMPORT_BYTES + 10);
    root.choose("data-import-file", [fakeFile(5, big)]);
    await settle();
    expect(controller.getState().status).toEqual({ kind: "import-problem", code: "too-large" });
  });

  it("says it could not be read when reading fails", async () => {
    const { root, controller } = setup();
    root.choose("data-import-file", [fakeFile(10, "", true)]);
    await settle();
    expect(controller.getState().importPending).toBe(false);
    expect(controller.getState().status?.kind).toBe("import-problem");
  });

  it("does nothing when no file was chosen", async () => {
    const { root, controller } = setup();
    const before = controller.getState().status;
    root.choose("data-import-file", []);
    root.choose("data-import-file", null);
    await settle();
    expect(controller.getState().status).toEqual(before);
  });
});

describe("a protected file over the limit", () => {
  it("is refused without being read", async () => {
    const { root, controller } = setup();
    root.passphrase = "correct horse battery staple";
    const f = fakeFile(MAX_PROTECTED_BYTES + 1);
    root.choose("data-protected-file", [f]);
    await settle();
    expect(f.reads).toBe(0);
    expect(controller.getState().status).toEqual({ kind: "protected-problem", code: "too-large" });
    expect(root.innerHTML).toContain("That file is too large.");
  });

  it("is refused even with no passphrase typed, so the size is judged first", async () => {
    const { root, controller } = setup();
    root.passphrase = "";
    const f = fakeFile(MAX_PROTECTED_BYTES * 2);
    root.choose("data-protected-file", [f]);
    await settle();
    expect(f.reads).toBe(0);
    expect(controller.getState().status).toEqual({ kind: "protected-problem", code: "too-large" });
  });

  it("is refused in French in French", async () => {
    const { root, controller } = setup();
    controller.dispatch({ type: "set-locale", locale: "fr" });
    root.choose("data-protected-file", [fakeFile(MAX_PROTECTED_BYTES + 1)]);
    await settle();
    expect(root.innerHTML).toContain("Ce fichier est trop gros.");
  });

  it("is refused when there is no storage, as unavailable, not as too large", async () => {
    const c = createPrivacyController({ storage: null, prefix: PREFIX, inventory: FIXTURE, now: () => NOW, ...CRYPTO });
    const root = new FakeRoot();
    mountPrivacyPanel(root, c);
    const f = fakeFile(MAX_PROTECTED_BYTES + 1);
    root.choose("data-protected-file", [f]);
    await settle();
    expect(f.reads).toBe(0);
    expect(c.getState().status).toEqual({ kind: "unavailable" });
  });

  it("does not record a protected import in the activity log", async () => {
    const { root, storage } = setup({ logActivity: true });
    root.choose("data-protected-file", [fakeFile(MAX_PROTECTED_BYTES + 1)]);
    await settle();
    expect([...Array(storage.length).keys()].map((i) => storage.key(i)).some((k) => (k ?? "").includes("activity"))).toBe(false);
  });
});

describe("a protected file within the limit", () => {
  it("is read, and a wrong passphrase gives the usual answer", async () => {
    const { root, controller } = setup();
    root.passphrase = "correct horse battery staple";
    const f = fakeFile(100, "not a protected file");
    root.choose("data-protected-file", [f]);
    await until(() => controller.getState().status?.kind === "protected-problem");
    expect(f.reads).toBe(1);
    expect(controller.getState().status?.kind).toBe("protected-problem");
    expect((controller.getState().status as { code: string }).code).not.toBe("too-large");
  });

  it("round-trips: a file protected here opens here, and is then read once", async () => {
    const { controller } = setup();
    const prepared = await controller.dispatchAsync({ type: "protected-export", passphrase: "correct horse battery staple", confirm: "correct horse battery staple" });
    const text = prepared.lastExport?.text ?? "";
    expect(text.length).toBeGreaterThan(10);
    expect(text.length).toBeLessThan(MAX_PROTECTED_BYTES);
    const second = setup();
    second.root.passphrase = "correct horse battery staple";
    const f = fakeFile(text.length, text);
    second.root.choose("data-protected-file", [f]);
    await until(() => second.controller.getState().status?.kind === "import-ready");
    expect(f.reads).toBe(1);
    expect(second.controller.getState().importPending).toBe(true);
    expect(second.controller.getState().status, JSON.stringify(second.controller.getState().status)).toMatchObject({ kind: "import-ready" });
  });
});

describe("the controller on its own", () => {
  it("refuses an import-load over the limit by its size, without parsing the text", () => {
    const { controller } = setup();
    const s = controller.dispatch({ type: "import-load", text: "this is never parsed", size: MAX_IMPORT_BYTES + 1 });
    expect(s.status).toEqual({ kind: "import-problem", code: "too-large" });
    expect(s.importPending).toBe(false);
  });

  it("treats a size at the limit, a zero size and no size as no reason to refuse", () => {
    for (const size of [MAX_IMPORT_BYTES, 0, undefined]) {
      const { controller } = setup();
      const s = controller.dispatch({ type: "import-load", text: "not json", ...(size === undefined ? {} : { size }) });
      expect(s.status, String(size)).toEqual({ kind: "import-problem", code: "not-json" });
    }
  });

  it("still measures the text itself, whatever size it is given", () => {
    const { controller } = setup();
    const s = controller.dispatch({ type: "import-load", text: "x".repeat(MAX_IMPORT_BYTES + 1), size: 3 });
    expect(s.status).toEqual({ kind: "import-problem", code: "too-large" });
  });

  it("refuses a protected-import over the limit by its size, before it asks the browser to decrypt", async () => {
    let used = 0;
    const crypto = { ...globalThis.crypto, subtle: new Proxy(globalThis.crypto.subtle, { get: (t, k) => { used += 1; return Reflect.get(t, k, t); } }) } as unknown as Crypto;
    const { controller } = setup({ crypto });
    const s = await controller.dispatchAsync({ type: "protected-import", text: "ignored", passphrase: "correct horse battery staple", size: MAX_PROTECTED_BYTES + 1 });
    expect(s.status).toEqual({ kind: "protected-problem", code: "too-large" });
    expect(used).toBe(0);
  });

  it("does not refuse a protected-import at the limit by size alone", async () => {
    const { controller } = setup();
    const s = await controller.dispatchAsync({ type: "protected-import", text: "nonsense", passphrase: "correct horse battery staple", size: MAX_PROTECTED_BYTES });
    expect(s.status?.kind).toBe("protected-problem");
    expect((s.status as { code: string }).code).not.toBe("too-large");
  });
});
