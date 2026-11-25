import { numberToDanish } from "./danishNumbers";

const HOURS = [
  "tolv", "et", "to", "tre", "fire", "fem",
  "seks", "syv", "otte", "ni", "ti", "elleve",
];

const hourWord = (h: number): string => HOURS[((h % 12) + 12) % 12]!;

function forms(h: number, m: number): string[] {
  const cur = hourWord(h);
  const next = hourWord(h + 1);
  switch (m) {
    case 0: return [cur];
    case 5: return [`fem minutter over ${cur}`];
    case 10: return [`ti minutter over ${cur}`];
    case 15: return [`kvart over ${cur}`];
    case 20: return [`tyve minutter over ${cur}`, `ti minutter i halv ${next}`];
    // p.29 clock counts 25 from the hour; p.30 adds the around-the-half form.
    case 25: return [`fem minutter i halv ${next}`, `femogtyve minutter over ${cur}`];
    case 30: return [`halv ${next}`];
    case 35: return [`fem minutter over halv ${next}`, `femogtyve minutter i ${next}`];
    case 40: return [`tyve minutter i ${next}`, `ti minutter over halv ${next}`];
    case 45: return [`kvart i ${next}`];
    case 50: return [`ti minutter i ${next}`];
    default: return [`fem minutter i ${next}`];
  }
}

export function timeToDanish(h: number, m: number): { primary: string; accepted: string[] } {
  if (!Number.isInteger(h) || h < 0 || h > 23) throw new RangeError(`hour out of range: ${h}`);
  if (!Number.isInteger(m) || m < 0 || m > 55 || m % 5 !== 0) {
    throw new RangeError(`minute out of range: ${m}`);
  }
  const base = forms(h, m);
  const withShort = base.flatMap((f) =>
    f.includes("minutter") ? [f, f.replace("minutter ", "")] : [f],
  );
  // p.30 digital time: hours and minutes read as numbers ("otte femten", "tyve nul ni").
  const digitalHours = new Set([hourWord(h)]);
  if (h === 0 || h > 12) digitalHours.add(numberToDanish(h).primary);
  const digitalMin = m === 0 ? "nul nul" : m < 10 ? `nul ${numberToDanish(m).primary}` : numberToDanish(m).primary;
  const digital = [...digitalHours].map((hw) => `${hw} ${digitalMin}`);
  const accepted = new Set<string>();
  for (const f of [...withShort, ...digital]) {
    accepted.add(f);
    accepted.add(`klokken er ${f}`);
    accepted.add(`den er ${f}`);
    accepted.add(`klokken ${f}`);
    accepted.add(`kl. ${f}`);
  }
  return { primary: base[0]!, accepted: [...accepted] };
}

export function timeToDigits(h: number, m: number): string {
  const hh = h % 12 === 0 ? 12 : h % 12;
  return `${hh}:${String(m).padStart(2, "0")}`;
}
