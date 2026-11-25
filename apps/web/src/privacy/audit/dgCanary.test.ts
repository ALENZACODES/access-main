import { describe, expect, it } from "vitest";
import { CANARY, MAX_MESSAGE, judge, probe, sweep, variantsOf, type Outcome } from "./dgCanary";

const threw = (e: unknown): Outcome => probe(() => {
  throw e;
});

describe("variantsOf", () => {
  it("gives ten forms, each named once, each holding the canary in any case", () => {
    const v = variantsOf();
    expect(v).toHaveLength(10);
    expect(new Set(v.map((x) => x.name)).size).toBe(10);
    for (const x of v) expect(x.text.toLowerCase()).toContain(CANARY);
  });
  it("includes a control character, a line break, a bidirectional mark and an emoji", () => {
    const all = variantsOf().map((x) => x.text).join("");
    expect(all).toContain("\n");
    expect(all).toContain(String.fromCodePoint(1));
    expect(all).toContain(String.fromCodePoint(0x202e));
    expect(all).toContain(String.fromCodePoint(0x1f600));
  });
  it("makes the long form at least as long as asked", () => expect(variantsOf(CANARY, 1000).find((x) => x.name === "too long")?.text.length).toBeGreaterThanOrEqual(1000));
  it("uses the canary it is given", () => {
    for (const x of variantsOf("abc")) expect(x.text.toLowerCase()).toContain("abc");
  });
  it("gives the form with spaces around it", () => expect(variantsOf().find((x) => x.name === "with spaces around it")?.text).toBe(`  ${CANARY}  `));
});

describe("probe", () => {
  it("returns the value when the call does not throw", () => expect(probe(() => 42)).toEqual({ threw: false, name: "", message: "", leaked: [], returned: 42 }));
  it("reports the name and message of an error", () => {
    const o = threw(new TypeError("Invalid label"));
    expect(o).toMatchObject({ threw: true, name: "TypeError", message: "Invalid label", leaked: [] });
  });
  it("finds the canary in the message, in any case", () => {
    expect(threw(new Error(`bad ${CANARY}`)).leaked).toEqual(["message"]);
    expect(threw(new Error(`bad ${CANARY.toUpperCase()}`)).leaked).toEqual(["message"]);
  });
  it("finds the canary in the name of an error", () => {
    const e = new Error("x");
    e.name = `E${CANARY}`;
    expect(threw(e).leaked).toEqual(["name"]);
  });
  it("finds the canary in the cause, and not in the message", () => expect(threw(new Error("x", { cause: new Error(CANARY) })).leaked).toEqual(["cause"]));
  it("finds the canary in a cause that is a text", () => expect(threw(new Error("x", { cause: CANARY })).leaked).toEqual(["cause"]));
  it("follows a chain of causes a few steps", () => expect(threw(new Error("x", { cause: new Error("y", { cause: new Error(CANARY) }) })).leaked).toEqual(["cause"]));
  it("reports a thrown text as not an Error, with the text as the message", () => {
    const o = threw("plain");
    expect(o).toMatchObject({ threw: true, name: "", message: "plain" });
  });
  it("finds the canary in a thrown text, an object or a number", () => {
    expect(threw(CANARY).leaked).toEqual(["message"]);
    expect(threw({ field: CANARY }).leaked).toEqual(["text"]);
    expect(threw(7).leaked).toEqual([]);
  });
  it("does not fail on a thrown value that cannot be written", () => {
    const loop: Record<string, unknown> = {};
    loop["self"] = loop;
    expect(() => threw(loop)).not.toThrow();
    expect(threw(null).threw).toBe(true);
  });
  it("uses the canary it is given", () => expect(probe(() => { throw new Error("has needle in it"); }, "NEEDLE").leaked).toEqual(["message"]));
  it("does not look in the stack, which repeats the message anyway", () => {
    const e = new Error("fine");
    e.stack = `Error: fine\n at ${CANARY}`;
    expect(threw(e).leaked).toEqual([]);
  });
});

describe("judge", () => {
  const ok: Outcome = { threw: true, name: "TypeError", message: "Invalid label", leaked: [], returned: undefined };
  it("accepts a call that did not throw", () => expect(judge({ threw: false, name: "", message: "", leaked: [], returned: 1 })).toEqual({ ok: true, problems: [] }));
  it("accepts a short error that holds no canary", () => expect(judge(ok)).toEqual({ ok: true, problems: [] }));
  it("finds something that is not an Error", () => expect(judge({ ...ok, name: "" }).problems).toEqual(["something that is not an Error was thrown"]));
  it("finds a canary in the error, and says where", () => {
    expect(judge({ ...ok, leaked: ["message"] }).problems).toEqual(["the canary is in the message of the error"]);
    expect(judge({ ...ok, leaked: ["message", "cause"] }).problems).toEqual(["the canary is in the message and the cause of the error"]);
  });
  it("finds a message that is too long, at the limit and above it", () => {
    expect(judge({ ...ok, message: "x".repeat(MAX_MESSAGE) }).ok).toBe(true);
    expect(judge({ ...ok, message: "x".repeat(MAX_MESSAGE + 1) }).problems).toEqual([`the message is ${MAX_MESSAGE + 1} characters`]);
  });
  it("finds an empty message", () => expect(judge({ ...ok, message: "" }).problems).toEqual(["the message is empty"]));
  it("gives every problem", () => expect(judge({ ...ok, name: "", message: "", leaked: ["name"] }).problems).toHaveLength(3));
});

describe("sweep", () => {
  it("is empty for a call that does not throw, and for one that throws a clean error", () => {
    expect(sweep(() => 1)).toEqual([]);
    expect(sweep(() => {
      throw new TypeError("Invalid label");
    })).toEqual([]);
  });
  it("names the form and the problem for each leak", () => {
    const r = sweep((v) => {
      throw new Error(`bad ${v.text.slice(0, 20)}`);
    });
    expect(r.length).toBeGreaterThan(5);
    expect(r[0]).toBe("plain: the canary is in the message of the error");
  });
  it("calls the function once for each form", () => {
    let n = 0;
    sweep(() => {
      n += 1;
    });
    expect(n).toBe(10);
  });
  it("uses the forms it is given", () => expect(sweep((v) => { throw new Error(v.text); }, [{ name: "mine", text: CANARY }])).toEqual(["mine: the canary is in the message of the error"]));
});
