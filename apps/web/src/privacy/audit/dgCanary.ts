// A canary is text that no code of the App writes. A behaviour audit puts it into every slot where a person can type,
// calls the code, and looks for it in what comes back: the message of an error that is thrown must never repeat what
// a person typed, because that message may be shown in a notice, kept in a log or sent by a tool that reports errors.

/** The text put into a slot. It holds no character that any validator of the App would treat as a separator. */
export const CANARY = "zq7canary";

/** Forms of the canary a person could type that a validator may reject: too long, with a control character, and so on. */
export interface Variant {
  name: string;
  text: string;
}

const cp = (n: number): string => String.fromCodePoint(n);

export function variantsOf(canary: string = CANARY, longLength = 5000): Variant[] {
  return [
    { name: "plain", text: canary },
    { name: "with a line break", text: `${canary}\n${canary}` },
    { name: "with a control character", text: `${canary}${cp(1)}${canary}` },
    { name: "with a no-break space", text: `${canary}${cp(0xa0)}${canary}` },
    { name: "with a bidirectional mark", text: `${canary}${cp(0x202e)}${canary}` },
    { name: "with an emoji", text: `${canary}${cp(0x1f600)}` },
    { name: "with quotes and braces", text: `${canary}"'{}[]` },
    { name: "too long", text: canary.repeat(Math.ceil(longLength / canary.length)) },
    { name: "with spaces around it", text: `  ${canary}  ` },
    { name: "in capitals", text: canary.toUpperCase() },
  ];
}

export interface Outcome {
  /** True when the call threw. */
  threw: boolean;
  /** The error's name and message when it threw, with the text of a non-Error that was thrown. */
  name: string;
  message: string;
  /** Where the canary was found: the message, the name, the cause or the text of the whole error. */
  leaked: Array<"message" | "name" | "cause" | "text">;
  /** The value returned when it did not throw. */
  returned: unknown;
}

const lower = (s: string): string => s.toLowerCase();

/** Everything an error can carry as text, apart from its stack. */
function carried(e: unknown, seen = 0): string[] {
  if (e instanceof Error) {
    const c = (e as { cause?: unknown }).cause;
    return [e.name, e.message, ...(seen < 3 && c !== undefined ? carried(c, seen + 1) : [])];
  }
  return [typeof e === "string" ? e : safeString(e)];
}

function safeString(v: unknown): string {
  try {
    return typeof v === "object" && v !== null ? JSON.stringify(v) : String(v);
  } catch {
    return "";
  }
}

/** Calls the function and reports where, if anywhere, the canary shows in what it threw. */
export function probe(call: () => unknown, canary: string = CANARY): Outcome {
  const needle = lower(canary);
  try {
    return { threw: false, name: "", message: "", leaked: [], returned: call() };
  } catch (e) {
    const name = e instanceof Error ? e.name : "";
    const message = e instanceof Error ? e.message : typeof e === "string" ? e : "";
    const leaked: Outcome["leaked"] = [];
    if (lower(message).includes(needle)) leaked.push("message");
    if (lower(name).includes(needle)) leaked.push("name");
    if (e instanceof Error && (e as { cause?: unknown }).cause !== undefined && carried((e as { cause?: unknown }).cause).some((t) => lower(t).includes(needle))) leaked.push("cause");
    if (carried(e).some((t) => lower(t).includes(needle)) && leaked.length === 0) leaked.push("text");
    return { threw: true, name, message, leaked, returned: undefined };
  }
}

/** Longest message an error from the App may have: a name of a field and a short reason, not a copy of any input. */
export const MAX_MESSAGE = 120;

export interface Verdict {
  ok: boolean;
  problems: string[];
}

/** Judges an outcome. A call that threw must throw an Error, with a short message that does not hold the canary. */
export function judge(o: Outcome): Verdict {
  const problems: string[] = [];
  if (!o.threw) return { ok: true, problems };
  if (o.name === "") problems.push("something that is not an Error was thrown");
  if (o.leaked.length > 0) problems.push(`the canary is in the ${o.leaked.join(" and the ")} of the error`);
  if (o.message.length > MAX_MESSAGE) problems.push(`the message is ${o.message.length} characters`);
  if (o.message === "") problems.push("the message is empty");
  return { ok: problems.length === 0, problems };
}

/** Runs the call once for each variant and gives every verdict that is not ok, with the variant it came from. */
export function sweep(call: (v: Variant) => unknown, variants: readonly Variant[] = variantsOf()): string[] {
  const out: string[] = [];
  for (const v of variants) {
    const verdict = judge(probe(() => call(v)));
    for (const p of verdict.problems) out.push(`${v.name}: ${p}`);
  }
  return out;
}
