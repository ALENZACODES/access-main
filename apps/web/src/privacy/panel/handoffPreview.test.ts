import { describe, expect, it } from "vitest";
import { describeLink, type LinkDescription } from "./handoffLink";
import { describeMetres, precisionMetres, previewLink } from "./handoffPreview";
import { lintCopy, type Locale } from "./copyLint";

const LOCALES: readonly Locale[] = ["en", "fr"];
const link = (href: string): LinkDescription => {
  const r = describeLink(href);
  if (!r.ok) throw new Error(`${href}: ${r.problem}`);
  return r.link;
};
const en = (href: string): string => previewLink("en", link(href));
const fr = (href: string): string => previewLink("fr", link(href));

describe("precisionMetres", () => {
  it("is about 111 km for a whole degree and a tenth of that for each decimal place", () => {
    expect(precisionMetres(0)).toBeCloseTo(111_320, 5);
    expect(precisionMetres(1)).toBeCloseTo(11_132, 5);
    expect(precisionMetres(5)).toBeCloseTo(1.1132, 5);
    expect(precisionMetres(6)).toBeCloseTo(0.11132, 5);
  });
  it("refuses a negative number and a fraction", () => {
    expect(() => precisionMetres(-1)).toThrow(RangeError);
    expect(() => precisionMetres(1.5)).toThrow(RangeError);
    expect(() => precisionMetres(Number.NaN)).toThrow(RangeError);
  });
});

describe("describeMetres", () => {
  it("writes metres to two figures with a no-break space and the singular for one", () => {
    expect(describeMetres("en", 1.1132)).toBe("1.1 metres");
    expect(describeMetres("en", 1)).toBe("1 metre");
    expect(describeMetres("en", 11.132)).toBe("11 metres");
    expect(describeMetres("en", 111.32)).toBe("110 metres");
    expect(describeMetres("en", 0.11132)).toBe("0.1 metres");
  });
  it("writes kilometres from 1000 metres, with the singular for exactly one", () => {
    expect(describeMetres("en", 1000)).toBe("1 kilometre");
    expect(describeMetres("en", 1113.2)).toBe("1.1 kilometres");
    expect(describeMetres("en", 11_132)).toBe("11 kilometres");
    expect(describeMetres("en", 111_320)).toBe("111 kilometres");
  });
  it("uses a decimal comma and the short units in French", () => {
    expect(describeMetres("fr", 1.1132)).toBe("1,1 m");
    expect(describeMetres("fr", 1113.2)).toBe("1,1 km");
    expect(describeMetres("fr", 111_320)).toBe("111 km");
  });
});

describe("an email", () => {
  it("says a draft with no address, a subject and some text", () => {
    expect(en("mailto:?subject=Hi&body=Line%20one%0D%0ALine%20two")).toBe("An email draft with no address to send it to, a subject, 18 characters of text on 2 lines.");
    expect(fr("mailto:?subject=Hi&body=Line%20one%0D%0ALine%20two")).toBe("Un brouillon de courriel sans adresse de destinataire, avec un objet, avec 18 caractères de texte sur 2 lignes.");
  });
  it("says no subject and no text", () => {
    expect(en("mailto:?to=a@example.org")).toBe("An email draft for 1 address, no subject, no text.");
    expect(fr("mailto:a@example.org")).toBe("Un brouillon de courriel pour 1 adresse, sans objet, sans texte.");
  });
  it("uses the singular for one character and one line", () => {
    expect(en("mailto:?body=x")).toContain("1 character of text on 1 line");
    expect(fr("mailto:?body=x")).toContain("1 caractère de texte sur 1 ligne");
  });
  it("counts the addresses in copy and the extra fields", () => {
    const text = en("mailto:a@example.org?cc=b@example.org&bcc=c@example.org&x-a=1&x-b=2");
    expect(text).toContain(", and 2 addresses in copy");
    expect(text).toContain(", and 2 extra fields");
    expect(fr("mailto:?cc=b@example.org&x-a=1")).toContain(", et 1 adresse en copie, et 1 champ de plus");
  });
  it("never repeats the address, the subject or the text", () => {
    const text = en("mailto:secret@example.org?subject=PrivateSubject&body=PrivateBody");
    for (const word of ["secret", "example.org", "PrivateSubject", "PrivateBody"]) expect(text).not.toContain(word);
  });
});

describe("a phone link", () => {
  it("says how many digits and whether there is a country code or an extension", () => {
    expect(en("tel:4165550100")).toBe("A call to a number with 10 digits.");
    expect(en("tel:+14165550100;ext=2")).toBe("A call to a number with 11 digits, with a country code, with an extension.");
    expect(fr("tel:+14165550100")).toBe("Un appel à un numéro de 11 chiffres, avec l’indicatif du pays.");
    expect(fr("tel:4165550100;ext=2")).toBe("Un appel à un numéro de 10 chiffres, avec un poste.");
  });
  it("uses the singular for no digit as French does, and never repeats the digits", () => {
    expect(en("tel:911")).toBe("A call to a number with 3 digits.");
    expect(en("tel:4165550100")).not.toContain("416");
  });
});

describe("a map link", () => {
  it("says how precisely the place is written and about how close that is", () => {
    expect(en("geo:43.65320,-79.38320")).toBe("A place on a map, written to 5 decimal places, to within about 1.1 metres.");
    expect(fr("geo:43.65320,-79.38320")).toBe("Un lieu sur une carte, écrit avec 5 décimales, à environ 1,1 m près.");
  });
  it("says a coarse place as a large distance", () => {
    expect(en("geo:43,-79")).toBe("A place on a map, written to 0 decimal places, to within about 111 kilometres.");
    expect(en("geo:43.6,-79.4")).toContain("1 decimal place,");
    expect(en("geo:43.6,-79.4")).toContain("11 kilometres");
  });
  it("never repeats the coordinates", () => {
    expect(en("geo:43.65320,-79.38320")).not.toMatch(/43|79/);
  });
});

describe("a text message", () => {
  it("says who it is for and how long the text is", () => {
    expect(en("sms:+14165550100?body=Hi")).toBe("A text message for 1 number, 2 characters of text.");
    expect(fr("sms:+14165550100,4165550101?body=Hi")).toBe("Un message texte pour 2 numéros, 2 caractères de texte.");
    expect(en("sms:?body=x")).toBe("A text message with no one to send it to, 1 character of text.");
    expect(fr("sms:4165550100")).toBe("Un message texte pour 1 numéro, sans texte.");
  });
});

describe("every sentence", () => {
  const links = ["mailto:?subject=a&body=b", "mailto:a@example.org?cc=b@example.org&x-y=1", "tel:+14165550100;ext=1", "geo:1.1,2.2", "geo:1.123456,2", "sms:5551234?body=x", "sms:?body=%0A"];
  it("passes the copy lint in both languages", () => {
    for (const l of LOCALES) for (const href of links) expect(lintCopy(l, previewLink(l, link(href))), `${l} ${href}`).toEqual([]);
  });
  it("ends with a full stop and has no double space", () => {
    for (const l of LOCALES) {
      for (const href of links) {
        const t = previewLink(l, link(href));
        expect(t.endsWith("."), t).toBe(true);
        expect(t).not.toMatch(/ {2}/);
      }
    }
  });
  it("never says verified, safe, private or secure", () => {
    for (const l of LOCALES) for (const href of links) expect(previewLink(l, link(href))).not.toMatch(/verified|vérif|\bsafe|\bsecure|sécuris|\bprivate|privé/i);
  });
});
