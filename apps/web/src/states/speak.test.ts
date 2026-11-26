import { describe, expect, it, vi } from "vitest";
import { MAX_CHUNK_CHARS, SPEECH_RATES, canSpeak, chunkForSpeech, isSpeechRate, makeReader, pickVoice, type SpeechLike, type UtteranceLike } from "./speak";

function fakeSpeech(voices: { lang: string; name: string }[] = []) {
  const spoken: UtteranceLike[] = [];
  const speech: SpeechLike = { speak: (u) => void spoken.push(u), cancel: vi.fn(), getVoices: () => voices };
  return { speech, spoken };
}
const make = (text: string): UtteranceLike => ({ text, lang: "", rate: 1, voice: null, onend: null, onerror: null });

describe("chunkForSpeech", () => {
  it("keeps a short script in one piece", () => {
    expect(chunkForSpeech(["Hello there.", "How are you?"])).toEqual(["Hello there. How are you?"]);
  });
  it("starts a new piece when the next sentence would not fit", () => {
    const a = "a".repeat(100) + ".";
    const b = "b".repeat(100) + ".";
    expect(chunkForSpeech([a, b])).toEqual([a, b]);
  });
  it("never makes a piece longer than the limit", () => {
    const long = Array.from({ length: 80 }, (_, i) => `word${i}`).join(" ") + ".";
    const out = chunkForSpeech([long, long]);
    for (const c of out) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
    expect(out.join(" ").replace(/\s+/g, " ")).toBe(`${long} ${long}`);
  });
  it("cuts a word longer than the limit rather than looping", () => {
    const out = chunkForSpeech(["x".repeat(400)]);
    expect(out.join("")).toBe("x".repeat(400));
    for (const c of out) expect(c.length).toBeLessThanOrEqual(MAX_CHUNK_CHARS);
  });
  it("drops empty lines and tidies whitespace", () => {
    expect(chunkForSpeech(["", "  a   b  ", "   "])).toEqual(["a b"]);
    expect(chunkForSpeech([])).toEqual([]);
  });
  it("splits on sentence ends but not on a number's point", () => {
    expect(chunkForSpeech(["Version 1.5 is out. Next."], 20)).toEqual(["Version 1.5 is out.", "Next."]);
  });
});

describe("pickVoice", () => {
  const voices = [{ lang: "en-US", name: "A" }, { lang: "fr-FR", name: "B" }, { lang: "fr_CA", name: "C" }, { lang: "en-CA", name: "D" }];
  it("prefers the Canadian voice", () => {
    expect(pickVoice(voices, "fr")!.name).toBe("C");
    expect(pickVoice(voices, "en")!.name).toBe("D");
  });
  it("falls back to any voice of the language", () => {
    expect(pickVoice(voices.slice(0, 2), "fr")!.name).toBe("B");
    expect(pickVoice(voices.slice(0, 2), "en")!.name).toBe("A");
  });
  it("gives null when there is none", () => {
    expect(pickVoice([{ lang: "de-DE", name: "X" }], "en")).toBeNull();
    expect(pickVoice([], "fr")).toBeNull();
  });
});

describe("rates", () => {
  it("are ordered slow to fast", () => {
    expect(SPEECH_RATES.slow).toBeLessThan(SPEECH_RATES.normal);
    expect(SPEECH_RATES.normal).toBeLessThan(SPEECH_RATES.fast);
  });
  it("is recognised only for the three names", () => {
    expect(isSpeechRate("slow")).toBe(true);
    expect(isSpeechRate("fastest")).toBe(false);
    expect(isSpeechRate(1)).toBe(false);
  });
});

describe("canSpeak", () => {
  it("is false without a speech object", () => {
    expect(canSpeak(null)).toBe(false);
    expect(canSpeak(undefined)).toBe(false);
    expect(canSpeak({} as SpeechLike)).toBe(false);
  });
  it("is true for one with speak and cancel", () => {
    expect(canSpeak(fakeSpeech().speech)).toBe(true);
  });
});

describe("makeReader", () => {
  it("does nothing without speech", () => {
    const done = vi.fn();
    expect(makeReader(null, make).start(["Hello."], "en", "normal", done)).toBe(false);
    expect(done).not.toHaveBeenCalled();
  });
  it("does nothing for no text", () => {
    const { speech, spoken } = fakeSpeech();
    expect(makeReader(speech, make).start(["  "], "en", "normal", vi.fn())).toBe(false);
    expect(spoken).toHaveLength(0);
  });
  it("speaks one piece at a time, in order, and says when it is done", () => {
    const { speech, spoken } = fakeSpeech([{ lang: "en-CA", name: "D" }]);
    const done = vi.fn();
    const a = "a".repeat(150) + ".";
    const b = "b".repeat(150) + ".";
    expect(makeReader(speech, make).start([a, b], "en", "slow", done)).toBe(true);
    expect(spoken).toHaveLength(1);
    expect(spoken[0]!.text).toBe(a);
    expect(spoken[0]!.rate).toBe(SPEECH_RATES.slow);
    expect(spoken[0]!.lang).toBe("en-CA");
    spoken[0]!.onend!();
    expect(spoken).toHaveLength(2);
    expect(done).not.toHaveBeenCalled();
    spoken[1]!.onend!();
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("uses the French default language when there is no voice", () => {
    const { speech, spoken } = fakeSpeech();
    makeReader(speech, make).start(["Bonjour."], "fr", "normal", vi.fn());
    expect(spoken[0]!.lang).toBe("fr-CA");
    expect(spoken[0]!.voice).toBeNull();
  });
  it("stops at once and does not go on to the next piece", () => {
    const { speech, spoken } = fakeSpeech();
    const reader = makeReader(speech, make);
    const done = vi.fn();
    reader.start(["a".repeat(150) + ".", "b".repeat(150) + "."], "en", "normal", done);
    reader.stop();
    spoken[0]!.onend!();
    expect(spoken).toHaveLength(1);
    expect(done).not.toHaveBeenCalled();
    expect(speech.cancel).toHaveBeenCalled();
  });
  it("starting again drops the old reading", () => {
    const { speech, spoken } = fakeSpeech();
    const reader = makeReader(speech, make);
    const first = vi.fn();
    reader.start(["a".repeat(150) + ".", "b".repeat(150) + "."], "en", "normal", first);
    const old = spoken[0]!;
    reader.start(["Fresh."], "en", "normal", vi.fn());
    old.onend!();
    expect(spoken.map((u) => u.text)).toEqual(["a".repeat(150) + ".", "Fresh."]);
    expect(first).not.toHaveBeenCalled();
  });
  it("calls done when the voice fails", () => {
    const { speech, spoken } = fakeSpeech();
    const done = vi.fn();
    makeReader(speech, make).start(["Hello."], "en", "normal", done);
    spoken[0]!.onerror!();
    expect(done).toHaveBeenCalledTimes(1);
  });
  it("ignores an error from a reading that was stopped", () => {
    const { speech, spoken } = fakeSpeech();
    const reader = makeReader(speech, make);
    const done = vi.fn();
    reader.start(["Hello."], "en", "normal", done);
    reader.stop();
    spoken[0]!.onerror!();
    expect(done).not.toHaveBeenCalled();
  });
  it("can stop when there is no speech", () => {
    expect(() => makeReader(undefined, make).stop()).not.toThrow();
  });
});
