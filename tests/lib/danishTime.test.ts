import { describe, expect, it } from "vitest";
import { timeToDanish, timeToDigits } from "../../src/lib/danishTime";

describe("timeToDanish primary", () => {
  const cases: [number, number, string][] = [
    [3, 0, "tre"],
    [15, 0, "tre"],
    [3, 5, "fem minutter over tre"],
    [3, 10, "ti minutter over tre"],
    [3, 15, "kvart over tre"],
    [3, 20, "tyve minutter over tre"],
    [3, 25, "fem minutter i halv fire"],
    [3, 30, "halv fire"],
    [3, 35, "fem minutter over halv fire"],
    [3, 40, "tyve minutter i fire"],
    [3, 45, "kvart i fire"],
    [3, 50, "ti minutter i fire"],
    [3, 55, "fem minutter i fire"],
    [12, 30, "halv et"],
    [0, 0, "tolv"],
    [13, 0, "et"],
    [11, 45, "kvart i tolv"],
  ];
  for (const [h, m, want] of cases) {
    it(`${h}:${m} -> ${want}`, () => {
      expect(timeToDanish(h, m).primary).toBe(want);
    });
  }
});

describe("timeToDanish accepted", () => {
  it("includes primary and prefixes", () => {
    const a = timeToDanish(3, 30).accepted;
    expect(a).toContain("halv fire");
    expect(a).toContain("klokken er halv fire");
    expect(a).toContain("den er halv fire");
  });
  it("drops 'minutter'", () => {
    const a = timeToDanish(3, 5).accepted;
    expect(a).toContain("fem over tre");
    expect(a).toContain("klokken er fem over tre");
  });
  it("alternates for :20 and :40", () => {
    const a = timeToDanish(3, 20).accepted;
    expect(a).toContain("ti minutter i halv fire");
    expect(a).toContain("tyve over tre");
    expect(a).toContain("ti i halv fire");
    expect(timeToDanish(3, 40).accepted).toContain("ti minutter over halv fire");
  });
  it("book p.29 clock: :25 and :35 counted from the hour", () => {
    expect(timeToDanish(8, 25).accepted).toContain("femogtyve minutter over otte");
    expect(timeToDanish(8, 25).accepted).toContain("den er femogtyve over otte");
    expect(timeToDanish(8, 35).accepted).toContain("femogtyve minutter i ni");
    expect(timeToDanish(8, 35).accepted).toContain("klokken er femogtyve i ni");
  });
  it("book p.30: 'klokken'/'kl.' without 'er'", () => {
    const a = timeToDanish(8, 15).accepted;
    expect(a).toContain("klokken kvart over otte");
    expect(a).toContain("kl. kvart over otte");
  });
  it("book p.30: digital time read as numbers", () => {
    expect(timeToDanish(8, 15).accepted).toContain("otte femten");
    expect(timeToDanish(11, 30).accepted).toContain("kl. elleve tredive");
    expect(timeToDanish(13, 0).accepted).toContain("tretten nul nul");
    expect(timeToDanish(1, 45).accepted).toContain("et femogfyrre");
    expect(timeToDanish(20, 5).accepted).toContain("tyve nul fem");
    expect(timeToDanish(3, 5).accepted).toContain("den er tre nul fem");
    expect(timeToDanish(3, 5).primary).toBe("fem minutter over tre");
  });
  it("has no duplicates", () => {
    for (let h = 0; h < 24; h++)
      for (let m = 0; m < 60; m += 5) {
        const a = timeToDanish(h, m).accepted;
        expect(new Set(a).size).toBe(a.length);
      }
  });
  it("throws on bad input", () => {
    expect(() => timeToDanish(24, 0)).toThrow(RangeError);
    expect(() => timeToDanish(-1, 0)).toThrow(RangeError);
    expect(() => timeToDanish(3, 7)).toThrow(RangeError);
    expect(() => timeToDanish(3, 60)).toThrow(RangeError);
  });
});

describe("timeToDigits", () => {
  it("formats 12-hour", () => {
    expect(timeToDigits(15, 30)).toBe("3:30");
    expect(timeToDigits(0, 5)).toBe("12:05");
    expect(timeToDigits(12, 0)).toBe("12:00");
  });
});
