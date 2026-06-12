/* Empirical check of the t=0.5 half-split assumption (review point 4).
   For every OMNI_VALID_OPERATORS combo, on the canonical quad:
   - replicate halfRange's 2-sample probe (0.49 / 0.51, others at 0.5)
   - fine-sweep each param (others at 0.5) and the all-equal diagonal
   - report any notation where crossings occur INSIDE the range the
     shipped logic would allow, or where the valid set is not a clean
     half-interval split at 0.5. */
import {
  applyOmni,
  hasMeshEdgeCrossings,
  OMNI_VALID_OPERATORS,
  operatorHasInherentCrossings,
} from './src/lib/conway-operators';

function makeCanonicalQuad() {
  const vertices: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (2 * Math.PI * i) / 4;
    vertices.push(Math.cos(a), Math.sin(a), 0);
  }
  return { vertices, faces: [[0, 1, 2, 3]] };
}

const quad = makeCanonicalQuad();

function clean(notation: string, tVe: number, tVf: number, tFe: number): boolean | 'ERR' {
  try {
    return !hasMeshEdgeCrossings(applyOmni(quad, notation, tVe, tVf, tFe));
  } catch {
    return 'ERR';
  }
}

const STEP = 0.02;
const ts: number[] = [];
for (let t = 0.02; t <= 0.981; t += STEP) ts.push(Number(t.toFixed(3)));

type Anomaly = { notation: string; bang: boolean; kind: string; detail: string };
const anomalies: Anomaly[] = [];
const notations = [...new Set(OMNI_VALID_OPERATORS.map((atoms: readonly string[]) => atoms.join(',')))];

let cleanSplits = 0;
for (const notation of notations) {
  const bang = notation.includes('!');
  for (let p = 0 as 0 | 1 | 2 | 3; p <= 3; p++) {
    const at = (t: number): [number, number, number] =>
      p === 3 ? [t, t, t] : ([0, 1, 2].map((i) => (i === p ? t : 0.5)) as [number, number, number]);

    // shipped 2-sample logic
    const lo = clean(notation, ...at(0.49));
    const hi = clean(notation, ...at(0.51));
    let allowed: [number, number];
    if (p === 3) {
      // operatorHasInherentCrossings: inherent iff both sides cross
      allowed = lo === false && hi === false ? [NaN, NaN] : [0.01, 0.99];
    } else {
      if (lo === true && hi === false) allowed = [0.01, 0.5];
      else if (lo === false && hi === true) allowed = [0.5, 0.99];
      else allowed = [0.01, 0.99];
    }

    const results = ts.map((t) => ({ t, ok: clean(notation, ...at(t)) }));
    const errs = results.filter((r) => r.ok === 'ERR');
    if (errs.length) {
      anomalies.push({ notation, bang, kind: 'ERROR', detail: `param ${p}: applyOmni threw at t=${errs[0].t}` });
      continue;
    }
    // crossings inside the allowed range?
    const leaked = results.filter((r) => !r.ok && r.t > allowed[0] && r.t < allowed[1]);
    // transitions located away from 0.5?
    const transitions: number[] = [];
    for (let i = 1; i < results.length; i++) {
      if (results[i].ok !== results[i - 1].ok) transitions.push((results[i].t + results[i - 1].t) / 2);
    }
    const offCenter = transitions.filter((x) => Math.abs(x - 0.5) > 0.03);
    if (leaked.length && !Number.isNaN(allowed[0])) {
      anomalies.push({
        notation, bang,
        kind: p === 3 ? 'DIAG-LEAK' : 'LEAK',
        detail: `param ${['tVe', 'tVf', 'tFe', 'diag'][p]}: shipped logic allows [${allowed}], but crossings at t=${leaked.slice(0, 6).map((r) => r.t).join(',')}${leaked.length > 6 ? '…' : ''} (transitions at ${transitions.map((x) => x.toFixed(2)).join(',') || 'none'})`,
      });
    } else if (offCenter.length) {
      anomalies.push({
        notation, bang, kind: 'OFF-CENTER',
        detail: `param ${['tVe', 'tVf', 'tFe', 'diag'][p]}: transition(s) at ${transitions.map((x) => x.toFixed(2)).join(',')} (no leak: allowed=[${allowed}])`,
      });
    } else {
      cleanSplits++;
    }
  }
  // sanity: exported inherent check agrees with diagonal probe
  const inh = operatorHasInherentCrossings(notation);
  const diagAll = ts.every((t) => clean(notation, t, t, t) === false);
  if (inh && !diagAll) {
    anomalies.push({ notation, bang, kind: 'INHERENT-FP', detail: 'flagged inherent, but some diagonal t is clean' });
  }
}

console.log(`notations: ${notations.length}, sweeps clean: ${cleanSplits}, anomalies: ${anomalies.length}`);
const byKind = new Map<string, Anomaly[]>();
for (const a of anomalies) byKind.set(a.kind, [...(byKind.get(a.kind) ?? []), a]);
for (const [kind, list] of byKind) {
  const nonBang = list.filter((a) => !a.bang);
  console.log(`\n== ${kind}: ${list.length} (${nonBang.length} without bang atoms) ==`);
  for (const a of [...nonBang, ...list.filter((a) => a.bang)].slice(0, 15)) {
    console.log(`  [${a.bang ? 'bang' : 'pure'}] ${a.notation} :: ${a.detail}`);
  }
}
