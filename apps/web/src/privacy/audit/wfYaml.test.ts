import { describe, expect, it } from "vitest";
import { get, items, keys, lineOfKey, parseYaml, splitKey, stripComment, text, texts, unquote, type YNode } from "./wfYaml";

const root = (src: string): YNode => parseYaml(src).root;
const problems = (src: string): string[] => parseYaml(src).problems.map((p) => `${p.line}: ${p.message}`);

describe("stripComment", () => {
  it("removes a comment at the start or after a blank", () => {
    expect(stripComment("# all comment")).toBe("");
    expect(stripComment("a: 1 # note")).toBe("a: 1 ");
    expect(stripComment("a: 1\t# note")).toBe("a: 1\t");
  });

  it("keeps a # that is part of a word, a URL fragment or a colour", () => {
    expect(stripComment("a: b#c")).toBe("a: b#c");
    expect(stripComment("url: https://x/y#z")).toBe("url: https://x/y#z");
  });

  it("keeps a # inside single or double quotes", () => {
    expect(stripComment(`a: "x # y" # real`)).toBe(`a: "x # y" `);
    expect(stripComment(`a: 'x # y' # real`)).toBe(`a: 'x # y' `);
  });

  it("follows an escaped quote inside double quotes", () => {
    expect(stripComment(`a: "x \\" # y" # real`)).toBe(`a: "x \\" # y" `);
  });

  it("does not take an apostrophe inside a word for a quote", () => {
    expect(stripComment("name: don't # note")).toBe("name: don't ");
  });

  it("gives the text back when there is no comment, and for empty text", () => {
    expect(stripComment("a: 1")).toBe("a: 1");
    expect(stripComment("")).toBe("");
  });
});

describe("unquote", () => {
  it("reads single quotes, where two quotes make one", () => {
    expect(unquote("'a''b'")).toBe("a'b");
    expect(unquote("''")).toBe("");
  });

  it("reads double quotes and their escapes", () => {
    expect(unquote('"a\\nb"')).toBe("a\nb");
    expect(unquote('"a\\tb"')).toBe("a\tb");
    expect(unquote('"q\\"q"')).toBe('q"q');
    expect(unquote('"b\\\\s"')).toBe("b\\s");
    expect(unquote('"\\u00e9"')).toBe("\u00e9");
    expect(unquote('"\\/"')).toBe("/");
  });

  it("keeps an escape it does not know, as written", () => {
    expect(unquote('"a\\qb"')).toBe("a\\qb");
    expect(unquote('"\\u12"')).toBe("\\u12");
  });
});

describe("splitKey", () => {
  const ok: Array<[string, string, string]> = [
    ["a: 1", "a", "1"],
    ["a:", "a", ""],
    ["runs-on: ubuntu-latest", "runs-on", "ubuntu-latest"],
    ["node-version: 22", "node-version", "22"],
    ["run: echo \"a: b\"", "run", 'echo "a: b"'],
    ["name: Check out access-main", "name", "Check out access-main"],
    ['"quoted key": v', "quoted key", "v"],
    ["'single': v", "single", "v"],
    ["key   : v", "key", "v"],
    ["${{ matrix.x }}: v", "${{ matrix.x }}", "v"],
    ["a: b: c", "a", "b: c"],
    ["url: https://x/y", "url", "https://x/y"],
  ];
  for (const [line, key, rest] of ok) {
    it(`splits ${JSON.stringify(line)}`, () => {
      expect(splitKey(line)).toEqual({ key, rest });
    });
  }

  for (const line of ["https://x/y", "plain text", "[a, b]", "{a: b}", "| text", "> text", ": v", "a:b", '"unclosed: v', ""]) {
    it(`gives null for ${JSON.stringify(line)}`, () => {
      expect(splitKey(line)).toBeNull();
    });
  }
});

describe("block maps", () => {
  it("reads keys with plain values, in order, with their lines", () => {
    const r = root("name: CI\nruns-on: x\n");
    expect(keys(r)).toEqual(["name", "runs-on"]);
    expect(text(get(r, "name"))).toBe("CI");
    expect(lineOfKey(r, "runs-on")).toBe(2);
  });

  it("reads nested maps by indentation", () => {
    const r = root("a:\n  b:\n    c: 1\n  d: 2\ne: 3\n");
    expect(text(get(get(get(r, "a"), "b"), "c"))).toBe("1");
    expect(text(get(get(r, "a"), "d"))).toBe("2");
    expect(text(get(r, "e"))).toBe("3");
  });

  it("gives a null node for a key with nothing after it", () => {
    expect(get(root("a:\nb: 1\n"), "a")).toMatchObject({ kind: "null" });
    expect(get(root("a:\n"), "a")).toMatchObject({ kind: "null" });
  });

  it("reads a key written as on and does not turn it into a boolean", () => {
    expect(keys(root("on:\n  push:\n"))).toEqual(["on"]);
    expect(keys(get(root("on:\n  push:\n"), "on"))).toEqual(["push"]);
  });

  it("reads quoted values without their quotes and marks them quoted", () => {
    const r = root(`a: "x y"\nb: 'it''s'\nc: plain\n`);
    expect(get(r, "a")).toMatchObject({ text: "x y", quoted: true });
    expect(get(r, "b")).toMatchObject({ text: "it's", quoted: true });
    expect(get(r, "c")).toMatchObject({ text: "plain", quoted: false });
  });

  it("keeps a value that has a colon inside, and a URL", () => {
    const r = root("a: x: y\nb: https://example.com:8080/p?q=1\n");
    expect(text(get(r, "a"))).toBe("x: y");
    expect(text(get(r, "b"))).toBe("https://example.com:8080/p?q=1");
  });

  it("ignores comments and blank lines", () => {
    const r = root("# top\n\na: 1 # one\n\n  # indented comment\nb: 2\n");
    expect(keys(r)).toEqual(["a", "b"]);
    expect(text(get(r, "a"))).toBe("1");
  });

  it("reads a template expression as plain text", () => {
    expect(text(get(root("ref: ${{ steps.maps.outputs.sha }}\n"), "ref"))).toBe("${{ steps.maps.outputs.sha }}");
  });
});

describe("block lists", () => {
  it("reads a list of plain items", () => {
    expect(texts(get(root("a:\n  - x\n  - y\n"), "a"))).toEqual(["x", "y"]);
  });

  it("reads a list written at the same indent as its key", () => {
    const r = root("a:\n- x\n- y\nb: 1\n");
    expect(texts(get(r, "a"))).toEqual(["x", "y"]);
    expect(text(get(r, "b"))).toBe("1");
  });

  it("reads a list of maps, with the first key on the dash line", () => {
    const r = root("steps:\n  - uses: a@v1\n    with:\n      k: v\n  - run: echo hi\n    name: say\n");
    const s = items(get(r, "steps"));
    expect(s).toHaveLength(2);
    expect(text(get(s[0], "uses"))).toBe("a@v1");
    expect(text(get(get(s[0], "with"), "k"))).toBe("v");
    expect(text(get(s[1], "run"))).toBe("echo hi");
    expect(text(get(s[1], "name"))).toBe("say");
  });

  it("gives each item of a list the line it starts on", () => {
    const s = items(get(root("a:\n  - x: 1\n  - x: 2\n"), "a"));
    expect(s.map((n) => n.line)).toEqual([2, 3]);
  });

  it("reads a dash with the item on the next lines", () => {
    const r = root("a:\n  -\n    k: v\n  -\n");
    const s = items(get(r, "a"));
    expect(text(get(s[0], "k"))).toBe("v");
    expect(s[1]).toMatchObject({ kind: "null" });
  });

  it("reads a map that follows a list at the same level", () => {
    const r = root("a:\n  - x\nb: 1\n");
    expect(texts(get(r, "a"))).toEqual(["x"]);
    expect(text(get(r, "b"))).toBe("1");
  });

  it("reads a list at the top of the file", () => {
    expect(texts(root("- a\n- b\n"))).toEqual(["a", "b"]);
  });

  it("reads quoted items", () => {
    expect(texts(root(`- "a b"\n- 'c'\n`))).toEqual(["a b", "c"]);
  });
});

describe("block text", () => {
  it("reads a literal block, keeping its line breaks and one at the end", () => {
    const r = root("run: |\n  echo a\n  echo b\nnext: 1\n");
    expect(text(get(r, "run"))).toBe("echo a\necho b\n");
    expect(text(get(r, "next"))).toBe("1");
  });

  it("keeps indentation deeper than the block's own, and a # inside", () => {
    const r = root("run: |\n  if x; then\n    echo # not a comment\n  fi\n");
    expect(text(get(r, "run"))).toBe("if x; then\n  echo # not a comment\nfi\n");
  });

  it("strips the last break with |- and keeps all trailing breaks with |+", () => {
    expect(text(get(root("a: |-\n  x\n\nb: 1\n"), "a"))).toBe("x");
    expect(text(get(root("a: |+\n  x\n\nb: 1\n"), "a"))).toBe("x\n\n");
  });

  it("folds lines with a space, and a blank line into a break, with >", () => {
    expect(text(get(root("a: >\n  one\n  two\n\n  three\n"), "a"))).toBe("one two\nthree\n");
    expect(text(get(root("a: >-\n  one\n  two\n"), "a"))).toBe("one two");
  });

  it("ends the block at the first line that is not indented more than its key", () => {
    const r = root("steps:\n  - run: |\n      a\n      b\n  - run: c\n");
    const s = items(get(r, "steps"));
    expect(text(get(s[0], "run"))).toBe("a\nb\n");
    expect(text(get(s[1], "run"))).toBe("c");
  });

  it("reads a block that is a list item", () => {
    const s = items(root("- |\n  a\n  b\n- c\n"));
    expect(text(s[0])).toBe("a\nb\n");
    expect(text(s[1])).toBe("c");
  });

  it("reads an empty block as empty text", () => {
    expect(text(get(root("a: |\nb: 1\n"), "a"))).toBe("");
  });

  it("keeps a blank line inside the block", () => {
    expect(text(get(root("a: |\n  x\n\n  y\n"), "a"))).toBe("x\n\ny\n");
  });
});

describe("flow lists and maps on one line", () => {
  it("reads a list of plain, quoted and numeric items", () => {
    expect(texts(get(root(`a: [1, 2, "x, y", 'z']\n`), "a"))).toEqual(["1", "2", "x, y", "z"]);
  });

  it("reads an empty list and an empty map", () => {
    expect(items(get(root("a: []\n"), "a"))).toEqual([]);
    expect(keys(get(root("a: {}\n"), "a"))).toEqual([]);
  });

  it("reads a map, and a list inside a map", () => {
    const n = get(root("a: {x: 1, y: [2, 3], z: \"q\"}\n"), "a");
    expect(keys(n)).toEqual(["x", "y", "z"]);
    expect(texts(get(n, "y"))).toEqual(["2", "3"]);
    expect(text(get(n, "z"))).toBe("q");
  });

  it("reads a list as an item of a block list", () => {
    expect(texts(get(items(root("- [a, b]\n"))[0], "x"))).toEqual([]);
    expect(items(items(root("- [a, b]\n"))[0])).toHaveLength(2);
  });

  it("reports a list that is not closed on its line, and does not read past it", () => {
    expect(problems("a: [x, y\nb: 1\n")).toEqual(["1: a flow list is not closed on its line"]);
  });

  it("reports text after a flow collection", () => {
    expect(problems("a: [x] y\n")).toEqual(["1: text after a flow collection"]);
  });
});

describe("what is not read, and said so", () => {
  it("reports an anchor, an alias and a tag, and keeps the text", () => {
    expect(problems("a: &x 1\n")).toEqual(["1: an anchor is not read"]);
    expect(problems("a: *x\n")).toEqual(["1: an alias is not read"]);
    expect(problems("a: !!str 1\n")).toEqual(["1: a tag is not read"]);
    expect(text(get(root("a: &x 1\n"), "a"))).toBe("&x 1");
  });

  it("reports a tab in the indentation", () => {
    expect(problems("a:\n\tb: 1\n")).toContain("2: tab in indentation");
  });

  it("reports a key written twice", () => {
    expect(problems("a: 1\nb: 2\na: 3\n")).toEqual(["3: the key a is written twice"]);
  });

  it("reports more than one document", () => {
    expect(problems("a: 1\n---\nb: 2\n")).toContain("2: more than one document");
  });

  it("does not report a single leading document marker", () => {
    expect(problems("---\na: 1\n")).toEqual([]);
    expect(problems("---\na: 1\n...\n")).toEqual([]);
  });

  it("reports a quoted text that is not closed, and text after a quoted text", () => {
    expect(problems('a: "oops\n')).toEqual(["1: a quoted text is not closed on its line"]);
    expect(problems('a: "x" y\n')).toEqual(["1: text after a quoted text"]);
  });

  it("reports a list inside a list on one line", () => {
    expect(problems("- - a\n")).toEqual(["1: a list inside a list on one line is not read"]);
  });

  it("reports a line that is not a key where a key is expected", () => {
    expect(problems("a: 1\n  stray\nb: 2\n")).toEqual(["2: unexpected indentation"]);
    expect(problems("a: 1\nstray\n")).toEqual(["2: expected a key"]);
  });

  it("reports an indented line that cannot be placed", () => {
    expect(problems("a:\n    b: 1\n  c: 2\n")).not.toEqual([]);
  });
});

describe("the whole reader", () => {
  it("gives a null root for an empty file, and for one of only comments", () => {
    expect(root("")).toMatchObject({ kind: "null" });
    expect(root("# nothing\n\n")).toMatchObject({ kind: "null" });
    expect(problems("")).toEqual([]);
  });

  it("reads Windows line endings the same as Unix ones", () => {
    expect(parseYaml("a: 1\r\nb:\r\n  - x\r\n")).toEqual(parseYaml("a: 1\nb:\n  - x\n"));
  });

  it("reads a text that is only a scalar", () => {
    expect(root("hello\n")).toMatchObject({ kind: "scalar", text: "hello" });
  });

  it("never throws, whatever the text", () => {
    const awful = ["{{{{", "[[[[", "- - - -", ":", "::", "a: [", "a: {", "\"", "'", "|", "a: |", "- |", "&", "*", "!", "\t\t", "a:\n\t- b", "a: 'x\nb: \"y", "}]", "a: }", "-\n-\n-"];
    for (const t of awful) expect(() => parseYaml(t), JSON.stringify(t)).not.toThrow();
  });

  it("does not stall on a very long line or very deep nesting", () => {
    const start = Date.now();
    parseYaml(`a: ${"x".repeat(100000)}`);
    parseYaml(`a: ${"[".repeat(2000)}`);
    parseYaml(Array.from({ length: 400 }, (_, i) => `${"  ".repeat(i)}k${i}:`).join("\n"));
    expect(Date.now() - start).toBeLessThan(3000);
  });
});

describe("the accessors", () => {
  const r = root("a:\n  b: 1\nl:\n  - x\n  - y: 1\ns: t\n");

  it("gives undefined for a missing key, or a key asked of something that is not a map", () => {
    expect(get(r, "zzz")).toBeUndefined();
    expect(get(get(r, "s"), "x")).toBeUndefined();
    expect(get(undefined, "a")).toBeUndefined();
    expect(lineOfKey(undefined, "a")).toBeUndefined();
    expect(lineOfKey(r, "zzz")).toBeUndefined();
  });

  it("gives text only for a scalar", () => {
    expect(text(get(r, "s"))).toBe("t");
    expect(text(get(r, "a"))).toBeNull();
    expect(text(undefined)).toBeNull();
  });

  it("lists keys and items, and nothing for the wrong kind", () => {
    expect(keys(r)).toEqual(["a", "l", "s"]);
    expect(keys(get(r, "s"))).toEqual([]);
    expect(items(get(r, "l"))).toHaveLength(2);
    expect(items(get(r, "a"))).toEqual([]);
    expect(items(undefined)).toEqual([]);
  });

  it("lists the texts of a list, leaves out items that are not text, and treats a scalar as a list of one", () => {
    expect(texts(get(r, "l"))).toEqual(["x"]);
    expect(texts(get(r, "s"))).toEqual(["t"]);
    expect(texts(get(r, "a"))).toEqual([]);
    expect(texts(undefined)).toEqual([]);
  });
});

describe("the workflow files in the tree", () => {
  it("are read with no problem", async () => {
    const { loadWorkflowFiles } = await import("./wfFiles");
    const root0 = new URL("../../../../../", import.meta.url).pathname;
    const files = loadWorkflowFiles(root0);
    expect(files.length).toBeGreaterThanOrEqual(6);
    for (const f of files) expect(parseYaml(f.text).problems, f.path).toEqual([]);
  });
});
