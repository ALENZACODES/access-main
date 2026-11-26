import { describe, expect, it } from "vitest";
import contentText from "../../public/packs/toronto/content.json?raw";
import { hasReading, readNotice, withoutStationPrefix } from "./elevatorRead";
import { parseElevatorNotices } from "./packElevators";
import { lcg } from "./placeFixtures";

const shipped = parseElevatorNotices((JSON.parse(contentText) as { elevator_status: unknown[] }).elevator_status).notices;
const read = (text: string | null, station: string | null = null, lang: "en" | "fr" | null = null) => readNotice({ text, station, textLanguage: lang });

describe("the three shipped notices", () => {
  it("reads Cedarvale", () => {
    expect(readNotice(shipped[0]!)).toEqual({
      elevator: "ELV02-B", state: "out-of-service", cause: "maintenance",
      between: "Line 5 platform, Line 1 northbound platform/east concourse, and upper concourse",
    });
  });
  it("reads Pape and keeps its between phrase whole", () => {
    expect(readNotice(shipped[1]!)).toEqual({
      elevator: "8D1L", state: "out-of-service", cause: "maintenance",
      between: "Pape Ave entrance, concourse and Line 2 westbound platform",
    });
  });
  it("reads Finch, which names no elevator", () => {
    expect(readNotice(shipped[2]!)).toEqual({
      elevator: null, state: "out-of-service", cause: "maintenance",
      between: "GO and YRT bus platform and fares concourse",
    });
  });
});

describe("the station prefix", () => {
  it("is removed only when it is the station's own name followed by a colon", () => {
    expect(withoutStationPrefix("Pape: Elevator 8D1L out of service", "Pape")).toBe("Elevator 8D1L out of service");
    expect(withoutStationPrefix("pape:Elevator 1 out of service", "Pape")).toBe("Elevator 1 out of service");
    expect(withoutStationPrefix("Pape Ave: Elevator out of service", "Pape")).toBe("Pape Ave: Elevator out of service");
    expect(withoutStationPrefix("Elevator out of service", "Pape")).toBe("Elevator out of service");
    expect(withoutStationPrefix("  Pape: x  ", null)).toBe("Pape: x");
  });
  it("lets a notice be read with no prefix at all", () => {
    expect(read("Elevator 9 out of service").elevator).toBe("9");
  });
  it("does not read a notice that carries another station's prefix", () => {
    expect(read("Finch: Elevator 3 out of service", "Pape")).toEqual({ elevator: null, state: null, cause: null, between: null });
  });
});

describe("the elevator label", () => {
  it("needs a digit, so a plain word is never a label", () => {
    for (const w of ["is", "ALL", "the", "two", "main"]) expect(read(`Elevator ${w} out of service`).elevator, w).toBeNull();
  });
  it("is read in capitals", () => {
    expect(read("Elevator elv02-b out of service").elevator).toBe("ELV02-B");
  });
  it("is read beside the word is", () => {
    expect(read("Elevator 12 is out of service")).toMatchObject({ elevator: "12", state: "out-of-service" });
    expect(read("Elevator is out of service")).toMatchObject({ elevator: null, state: "out-of-service" });
  });
  it("allows a dash and up to 19 characters", () => {
    expect(read("Elevator A-1-B out of service").elevator).toBe("A-1-B");
    expect(read(`Elevator ${"1".repeat(19)} out of service`).elevator).toBe("1".repeat(19));
    expect(read(`Elevator ${"1".repeat(20)} out of service`).state).toBeNull();
  });
});

describe("state and reason", () => {
  it("reads out of service with no place and no reason", () => {
    expect(read("Elevator 4 out of service")).toEqual({ elevator: "4", state: "out-of-service", cause: null, between: null });
  });
  it("reads a reason only when the notice gives it", () => {
    expect(read("Elevator 4 out of service while we perform maintenance")).toMatchObject({ cause: "maintenance", between: null });
    expect(read("Elevator 4 out of service between A and B")).toMatchObject({ cause: null, between: "A and B" });
  });
  it("does not read any other reason", () => {
    expect(read("Elevator 4 out of service while we perform repairs")).toEqual({ elevator: null, state: null, cause: null, between: null });
  });
  it("reads back in service in three wordings", () => {
    for (const w of ["back in service", "returned to service", "in service again"]) {
      expect(read(`Elevator 5 is ${w}.`), w).toEqual({ elevator: "5", state: "back-in-service", cause: null, between: null });
    }
  });
  it("gives no reason for a notice that says back in service", () => {
    expect(read("Elevator 5 back in service while we perform maintenance").state).toBeNull();
  });
  it("is not case sensitive, and takes a final full stop", () => {
    expect(read("ELEVATOR 7 OUT OF SERVICE BETWEEN THE LOBBY AND PLATFORM.")).toMatchObject({ elevator: "7", state: "out-of-service", between: "THE LOBBY AND PLATFORM" });
  });
  it("copes with extra spaces", () => {
    expect(read("Elevator   7   out  of service")).toEqual({ elevator: null, state: null, cause: null, between: null });
    expect(read("  Elevator 7 out of service  ").state).toBe("out-of-service");
  });
});

describe("the between phrase", () => {
  it("is cut at the reason and not before", () => {
    expect(read("Elevator 1 out of service between Lobby and Level 2 while we perform maintenance").between).toBe("Lobby and Level 2");
  });
  it("keeps slashes, commas and the word and", () => {
    expect(read("Elevator 1 out of service between Line 1/Line 2 platform, concourse, and upper level").between).toBe("Line 1/Line 2 platform, concourse, and upper level");
  });
  it("loses a trailing full stop but keeps one inside", () => {
    expect(read("Elevator 1 out of service between St. Clair and the lobby.").between).toBe("St. Clair and the lobby");
  });
  it("leaves the notice unread when the word between has nothing after it", () => {
    expect(hasReading(read("Elevator 1 out of service between "))).toBe(false);
  });
});

describe("French notices", () => {
  it("reads an out-of-service notice", () => {
    expect(read("Ascenseur 8D1L hors service entre l’entrée et la mezzanine", null, "fr")).toEqual({
      elevator: "8D1L", state: "out-of-service", cause: null, between: "l’entrée et la mezzanine",
    });
  });
  it("reads a reason when it is one of the known wordings", () => {
    expect(read("Ascenseur 2 hors service entre A et B pour entretien", null, "fr")).toMatchObject({ cause: "maintenance", between: "A et B" });
    expect(read("Ascenseur 2 hors service en raison d’un entretien", null, "fr").cause).toBe("maintenance");
    expect(read("Ascenseur 2 hors service pendant travaux d'entretien", null, "fr").cause).toBe("maintenance");
    expect(read("Ascenseur 2 hors service pour réparations", null, "fr").state).toBeNull();
  });
  it("reads back in service", () => {
    expect(read("Ascenseur 3 de nouveau en service", null, "fr")).toMatchObject({ elevator: "3", state: "back-in-service" });
  });
  it("reads a French notice even when the language is not given", () => {
    expect(read("Ascenseur 3 hors service").state).toBe("out-of-service");
  });
  it("reads an English notice even when the language says French", () => {
    expect(read("Elevator 3 out of service", null, "fr").state).toBe("out-of-service");
  });
  it("takes the station prefix with a French colon spacing", () => {
    expect(read("Pape : Ascenseur 3 hors service", "Pape", "fr").state).toBeNull();
    expect(read("Pape: Ascenseur 3 hors service", "Pape", "fr").state).toBe("out-of-service");
  });
});

describe("what is not read", () => {
  it("gives an empty reading for no words", () => {
    expect(read(null)).toEqual({ elevator: null, state: null, cause: null, between: null });
    expect(read("")).toEqual({ elevator: null, state: null, cause: null, between: null });
    expect(read("Pape:", "Pape")).toEqual({ elevator: null, state: null, cause: null, between: null });
  });
  it("gives an empty reading for words that fit no known form", () => {
    for (const s of ["Escalator 3 out of service", "Elevator 3 is temporarily unavailable", "Elevator 3 out of service until further notice", "Out of service", "Elevator", "Planned work this weekend"]) {
      expect(hasReading(read(s)), s).toBe(false);
    }
  });
  it("does not read a notice that holds extra words after the form", () => {
    expect(read("Elevator 3 out of service. Use the stairs.").state).toBeNull();
  });
  it("does not read words in the middle of a longer notice", () => {
    expect(read("Note: Elevator 3 out of service").state).toBeNull();
  });
});

describe("hasReading", () => {
  it("is true when any part was read", () => {
    expect(hasReading({ elevator: "1", state: null, cause: null, between: null })).toBe(true);
    expect(hasReading({ elevator: null, state: "out-of-service", cause: null, between: null })).toBe(true);
    expect(hasReading({ elevator: null, state: null, cause: "maintenance", between: null })).toBe(true);
    expect(hasReading({ elevator: null, state: null, cause: null, between: "x" })).toBe(true);
  });
  it("is false for nothing", () => {
    expect(hasReading({ elevator: null, state: null, cause: null, between: null })).toBe(false);
  });
});

describe("the reader is safe on any text", () => {
  it("never throws on 3000 random strings and always gives a complete reading", () => {
    const words = ["Elevator", "Ascenseur", "out", "of", "service", "hors", "between", "entre", "while", "we", "perform", "maintenance", "8D1L", "ELV02-B", ".", ":", "back", "in", "and", "Pape", "\n", "\u00a0"];
    const rnd = lcg(61);
    for (let i = 0; i < 3000; i++) {
      const n = Math.floor(rnd() * 14);
      let s = "";
      for (let k = 0; k < n; k++) s += words[Math.floor(rnd() * words.length)] + (rnd() < 0.8 ? " " : "");
      const r = read(s, rnd() < 0.3 ? "Pape" : null, rnd() < 0.5 ? "fr" : "en");
      expect(Object.keys(r).sort()).toEqual(["between", "cause", "elevator", "state"]);
      if (r.state === null) expect(r).toEqual({ elevator: null, state: null, cause: null, between: null });
    }
  });
  it("is quick on long awkward text", () => {
    const t0 = performance.now();
    for (const s of ["Elevator ".repeat(60), `Elevator 1 out of service between ${"a ".repeat(250)}`, `Elevator ${"1".repeat(19)} ${"out of service ".repeat(30)}`, " ".repeat(600), "Ascenseur ".repeat(60)]) {
      for (let i = 0; i < 30; i++) read(s);
    }
    expect(performance.now() - t0).toBeLessThan(1500);
  });
});
