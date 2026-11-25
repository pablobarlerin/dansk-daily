const UNITS = [
  'nul', 'en', 'to', 'tre', 'fire', 'fem', 'seks', 'syv', 'otte', 'ni',
  'ti', 'elleve', 'tolv', 'tretten', 'fjorten', 'femten', 'seksten', 'sytten', 'atten', 'nitten',
];
const TENS = ['', '', 'tyve', 'tredive', 'fyrre', 'halvtreds', 'tres', 'halvfjerds', 'firs', 'halvfems'];

function below100(n: number): string {
  if (n < 20) return UNITS[n]!;
  const t = Math.floor(n / 10);
  const u = n % 10;
  return u === 0 ? TENS[t]! : `${UNITS[u]}og${TENS[t]}`;
}

/** Groups of a number below 1000, e.g. 176 -> ["et hundrede", "seksoghalvfjerds"]. */
function groups999(n: number): string[] {
  const out: string[] = [];
  const h = Math.floor(n / 100);
  const r = n % 100;
  if (h > 0) out.push(h === 1 ? 'et hundrede' : `${UNITS[h]} hundrede`);
  if (r > 0) out.push(below100(r));
  return out;
}

const withOg = (gs: string[], og: boolean): string[] =>
  og && gs.length > 1 ? [...gs.slice(0, -1), `og ${gs[gs.length - 1]}`] : gs;

function groupsOf(n: number, ogInner: boolean): string[] {
  if (n === 1000000) return ['en million'];
  const t = Math.floor(n / 1000);
  const out: string[] = [];
  if (t > 0) {
    if (t === 1) out.push('et tusind');
    else {
      const inner = groups999(t);
      // "et" rather than "en" when 1 closes the thousands count.
      inner[inner.length - 1] = inner[inner.length - 1]!.replace(/^en$/, 'et');
      out.push(`${withOg(inner, ogInner).join(' ')} tusind`);
    }
  }
  out.push(...groups999(n % 1000));
  return out.length ? out : ['nul'];
}

export function numberToDanish(n: number): { primary: string; accepted: string[] } {
  if (!Number.isInteger(n) || n < 0 || n > 1000000) {
    throw new RangeError(`numberToDanish: unsupported value ${n}`);
  }
  const primary = groupsOf(n, false).join(' ');
  const accepted = new Set<string>([primary]);

  for (const ogInner of [false, true]) {
    const groups = groupsOf(n, ogInner);
    for (const og of [false, true]) {
      const base = withOg(groups, og).join(' ');
      for (const dropEt of [false, true]) {
        for (const en of [false, true]) {
          for (const tusinde of [false, true]) {
            let s = base;
            if (dropEt) s = s.replace(/^et (hundrede|tusind)/, '$1');
            if (en) s = s.replace(/\bet (hundrede|tusind)/g, 'en $1');
            if (tusinde) s = s.replace(/\btusind\b/g, 'tusinde');
            accepted.add(s);
          }
        }
      }
    }
  }

  if (n === 1) {
    accepted.add('et');
    accepted.add('én');
  }
  if (n === 1000000) accepted.add('én million');
  return { primary, accepted: [...accepted] };
}
