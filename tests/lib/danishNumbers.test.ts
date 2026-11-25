import { describe, expect, it } from 'vitest';
import { numberToDanish } from '../../src/lib/danishNumbers';

const primaries: Array<[number, string]> = [
  [0, 'nul'], [1, 'en'], [7, 'syv'], [11, 'elleve'], [16, 'seksten'],
  [20, 'tyve'], [21, 'enogtyve'], [23, 'treogtyve'], [30, 'tredive'],
  [40, 'fyrre'], [50, 'halvtreds'], [60, 'tres'], [70, 'halvfjerds'],
  [80, 'firs'], [90, 'halvfems'], [97, 'syvoghalvfems'],
  [100, 'et hundrede'], [176, 'et hundrede seksoghalvfjerds'],
  [598, 'fem hundrede otteoghalvfems'], [1000, 'et tusind'],
  [1291, 'et tusind to hundrede enoghalvfems'],
  [8355, 'otte tusind tre hundrede femoghalvtreds'],
  [1000000, 'en million'],
];

describe('numberToDanish', () => {
  it.each(primaries)('%i -> %s', (n, p) => {
    expect(numberToDanish(n).primary).toBe(p);
  });

  it('accepted variants', () => {
    expect(numberToDanish(1).accepted).toEqual(expect.arrayContaining(['en', 'et', 'én']));
    expect(numberToDanish(100).accepted).toEqual(expect.arrayContaining(['et hundrede', 'hundrede', 'en hundrede']));
    expect(numberToDanish(176).accepted).toContain('hundrede og seksoghalvfjerds');
    expect(numberToDanish(1000).accepted).toEqual(expect.arrayContaining(['et tusinde', 'tusinde', 'en tusind']));
    expect(numberToDanish(8355).accepted).toContain('otte tusinde tre hundrede femoghalvtreds');
    expect(numberToDanish(1291).accepted).toContain('et tusind to hundrede og enoghalvfems');
  });

  it('accepts og inside the thousands part', () => {
    expect(numberToDanish(110000).accepted).toContain('et hundrede og ti tusind');
    const r = numberToDanish(101000);
    expect(r.primary).toBe('et hundrede et tusind');
    expect(r.accepted).toContain('et hundrede og et tusind');
    const c = numberToDanish(176598);
    expect(c.accepted).toContain('et hundrede og seksoghalvfjerds tusind fem hundrede og otteoghalvfems');
    expect(new Set(c.accepted).size).toBe(c.accepted.length);
  });

  it('accepted contains primary and no duplicates', () => {
    for (const n of [0, 1, 21, 100, 176, 1000, 1291, 8355, 20000, 1000000]) {
      const { primary, accepted } = numberToDanish(n);
      expect(accepted).toContain(primary);
      expect(new Set(accepted).size).toBe(accepted.length);
    }
  });

  it('throws on invalid input', () => {
    expect(() => numberToDanish(-1)).toThrow();
    expect(() => numberToDanish(1.5)).toThrow();
    expect(() => numberToDanish(1000001)).toThrow();
  });
});
