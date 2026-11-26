import { describe, expect, it } from "vitest";
import { foldPlaceName, nameBlock } from "./placeNameKey";

describe("foldPlaceName", () => {
  it("drops case, accents and punctuation", () => {
    expect(foldPlaceName("Café Étoile!")).toBe("cafe etoile");
    expect(foldPlaceName("  Alpha,   Hall. ")).toBe("alpha hall");
  });
  it("reads & as and", () => {
    expect(foldPlaceName("Fish & Chips")).toBe("fish and chips");
    expect(foldPlaceName("Fish and Chips")).toBe(foldPlaceName("Fish & Chips"));
  });
  it("drops a leading article in either language but not a later one", () => {
    expect(foldPlaceName("The Library")).toBe("library");
    expect(foldPlaceName("Le Café")).toBe("cafe");
    expect(foldPlaceName("L’Étoile")).toBe("etoile");
    expect(foldPlaceName("Cafe de la Paix")).toBe("cafe de la paix");
  });
  it("keeps a name that is only an article", () => {
    expect(foldPlaceName("The")).toBe("the");
  });
  it("drops company endings", () => {
    expect(foldPlaceName("Alpha Hall Inc.")).toBe("alpha hall");
    expect(foldPlaceName("Alpha Hall Ltée")).toBe("alpha hall");
  });
  it("makes spelling variants one", () => {
    expect(foldPlaceName("Saint Paul Church")).toBe(foldPlaceName("St Paul Church"));
    expect(foldPlaceName("Mount Pleasant")).toBe(foldPlaceName("Mt. Pleasant"));
    expect(foldPlaceName("Community Centre")).toBe(foldPlaceName("Community Center"));
    expect(foldPlaceName("McDonald’s")).toBe("mcdonald s");
  });
  it("gives an empty key for an empty or symbol-only name", () => {
    expect(foldPlaceName("")).toBe("");
    expect(foldPlaceName("—!?")).toBe("");
  });
  it("does not change its input", () => {
    const n = "The Café";
    foldPlaceName(n);
    expect(n).toBe("The Café");
  });
  it("is stable when applied twice", () => {
    for (const n of ["The Saint Café & Bar Inc.", "Le Théâtre", "Mount Royal Centre"]) expect(foldPlaceName(foldPlaceName(n))).toBe(foldPlaceName(n));
  });
});

describe("nameBlock", () => {
  it("is the first two letters of the first word with letters", () => {
    expect(nameBlock("alpha hall")).toBe("al");
    expect(nameBlock("12 alpha")).toBe("al");
    expect(nameBlock("42 7")).toBe("");
    expect(nameBlock("")).toBe("");
  });
});
