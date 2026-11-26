import { describe, expect, it } from "vitest";
import { blankNonCode, findPhotoSites, findPhotoWrites, storesFileName, unsanitisedWrites } from "./phRepo";

const f = (path: string, text: string) => ({ path, text });

describe("blankNonCode", () => {
  it("keeps the length and the lines", () => {
    const t = 'a("x"); // sanitisePhoto(\n/* b\n c */ d';
    const b = blankNonCode(t);
    expect(b.length).toBe(t.length);
    expect(b.split("\n").length).toBe(3);
  });
  it("blanks a comment and the inside of a string", () => {
    expect(blankNonCode('x("sanitisePhoto(") // sanitisePhoto(')).not.toContain("sanitisePhoto");
  });
  it("blanks a block comment over several lines", () => expect(blankNonCode("/* sanitisePhoto(\nmore */ ok")).toContain("ok"));
  it("keeps code", () => expect(blankNonCode("await sanitisePhoto(file);")).toBe("await sanitisePhoto(file);"));
  it("stops a string at the end of the line", () => expect(blankNonCode("a(\"b\nsanitisePhoto(")).toContain("sanitisePhoto("));
  it("reads an escaped quote as inside the string", () => expect(blankNonCode('"a\\"sanitisePhoto("')).not.toContain("sanitisePhoto"));
});

describe("findPhotoWrites", () => {
  it("finds each kind of write, with its line", () => {
    const w = findPhotoWrites([f("a.ts", "x\ndb.photos.put(1);\ndb.photos . bulkAdd([]);")]);
    expect(w).toEqual([{ path: "a.ts", line: 2, call: "put" }, { path: "a.ts", line: 3, call: "bulkAdd" }]);
  });
  it("does not count a read or a delete", () => expect(findPhotoWrites([f("a.ts", "db.photos.get(1); db.photos.delete(1);")])).toEqual([]));
  it("does not count a write in a comment", () => expect(findPhotoWrites([f("a.ts", "// db.photos.put(1)")])).toEqual([]));
});

describe("findPhotoSites", () => {
  it("finds the picture functions by name and line, sorted", () => {
    const s = findPhotoSites([f("b.ts", "exportZip(a);\nsanitisePhoto(f);"), f("a.ts", "createImageBitmap(x)")]);
    expect(s.map((x) => `${x.path}:${x.line}:${x.name}`)).toEqual(["a.ts:1:createImageBitmap", "b.ts:1:exportZip", "b.ts:2:sanitisePhoto"]);
  });
  it("does not count an import or a name without a call", () => expect(findPhotoSites([f("a.ts", 'import { sanitisePhoto } from "./p";')])).toEqual([]));
});

describe("unsanitisedWrites", () => {
  it("passes a file that cleans before it writes", () => expect(unsanitisedWrites([f("a.ts", "const d = await sanitisePhoto(x);\ndb.photos.put(d);")])).toEqual([]));
  it("fails a file that writes and never cleans", () => expect(unsanitisedWrites([f("a.ts", "db.photos.put(raw);")])).toHaveLength(1));
  it("fails a file that cleans only after it writes", () => expect(unsanitisedWrites([f("a.ts", "db.photos.put(raw);\nawait sanitisePhoto(x);")])).toHaveLength(1));
  it("does not take a call in another file as cleaning", () => expect(unsanitisedWrites([f("a.ts", "db.photos.put(raw);"), f("b.ts", "sanitisePhoto(x);")])).toHaveLength(1));
  it("does not take a comment as cleaning", () => expect(unsanitisedWrites([f("a.ts", "// sanitisePhoto(x)\ndb.photos.put(raw);")])).toHaveLength(1));
});

describe("storesFileName", () => {
  it("sees the original name kept in data", () => {
    expect(storesFileName("{ id, name: p.name.slice(0, 200) }")).toBe(true);
    expect(storesFileName("{ name: file.name }")).toBe(true);
  });
  it("does not see a name that is made", () => expect(storesFileName("{ name: `photo-${n}` }")).toBe(false));
  it("does not see it in a comment", () => expect(storesFileName("// name: file.name")).toBe(false));
});
