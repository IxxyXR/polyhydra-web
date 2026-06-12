/* Contract-accurate check of the slider-restriction feature.
   The design contract (per IxxyXR):
   - operators whose crossings are trivially fixable by slider restriction
     form a class where the valid range is always one of the two halves of
     [0,1] split at 0.5;
   - operators outside that class are left unconstrained (live crossing
     warning covers them) or flagged inherent.
   This verifies exactly that, using the shipped exports:
   1. Whenever getOperatorParamRanges restricts a param to a half-interval,
      sweep the INTERIOR of that half: any crossing = contract violation.
      The 0.5 endpoint is reported separately.
   2. Whenever operatorHasInherentCrossings flags a notation, scan a coarse
      3D parameter grid for any clean point: finding one = false "inherent". */
import {
  OMNI_VALID_OPERATORS,
  operatorHasInherentCrossings,
  operatorPatchHasCrossings,
  getOperatorParamRanges,
} from './src/lib/conway-operators';

function clean(notation: string, tVe: number, tVf: number, tFe: number): boolean | 'ERR' {
  try {
    return !operatorPatchHasCrossings(notation, tVe, tVf, tFe);
  } catch {
    return 'ERR';
  }
}

const notations = [...new Set(OMNI_VALID_OPERATORS.map((atoms: readonly string[]) => atoms.join(',')))];
const PARAMS = ['tVe', 'tVf', 'tFe'] as const;

let restrictedSweeps = 0;
let inherentCount = 0;
const interiorViolations: string[] = [];
const endpointViolations: string[] = [];
const inherentFalsePositives: string[] = [];

for (const notation of notations) {
  const bang = notation.includes('!') ? 'bang' : 'pure';

  const inherent = operatorHasInherentCrossings(notation);
  if (inherent) {
    inherentCount++;
    // scan coarse 3D grid for any clean point
    outer: for (let a = 0.05; a < 0.96; a += 0.09) {
      for (let b = 0.05; b < 0.96; b += 0.09) {
        for (let c = 0.05; c < 0.96; c += 0.09) {
          if (clean(notation, a, b, c) === true) {
            inherentFalsePositives.push(
              `[${bang}] ${notation}: flagged inherent but clean at (${a.toFixed(2)},${b.toFixed(2)},${c.toFixed(2)})`);
            break outer;
          }
        }
      }
    }
    continue; // App.tsx skips getOperatorParamRanges for inherent ops
  }

  const ranges = getOperatorParamRanges(notation);
  for (let p = 0 as 0 | 1 | 2; p <= 2; p++) {
    const [lo, hi] = ranges[PARAMS[p]];
    const isHalf = (lo === 0.01 && hi === 0.49) || (lo === 0.51 && hi === 0.99);
    if (!isHalf) continue;
    restrictedSweeps++;
    const at = (t: number): [number, number, number] =>
      [0, 1, 2].map((i) => (i === p ? t : 0.5)) as [number, number, number];
    // interior of the allowed half, fine-grained
    const bad: number[] = [];
    for (let t = lo + 0.005; t < hi - 0.0049; t += 0.005) {
      const tt = Number(t.toFixed(4));
      if (clean(notation, ...at(tt)) === false) bad.push(tt);
    }
    if (bad.length) {
      interiorViolations.push(
        `[${bang}] ${notation} ${PARAMS[p]}: allowed [${lo},${hi}] but crossings at t=${bad.slice(0, 8).join(',')}${bad.length > 8 ? `… (${bad.length} samples)` : ''}`);
    }
    // both endpoints are reachable by the slider — verify they are clean
    for (const t of [lo, hi]) {
      if (clean(notation, ...at(t)) === false) {
        endpointViolations.push(`[${bang}] ${notation} ${PARAMS[p]}: allowed [${lo},${hi}], crossing at the t=${t} endpoint`);
      }
    }
  }
}

console.log(`notations: ${notations.length}`);
console.log(`flagged inherent: ${inherentCount}, false positives: ${inherentFalsePositives.length}`);
console.log(`half-interval restrictions issued: ${restrictedSweeps}`);
console.log(`interior violations (crossings inside the allowed half): ${interiorViolations.length}`);
console.log(`t=0.5 endpoint violations: ${endpointViolations.length}`);
for (const [title, list] of [
  ['INHERENT FALSE POSITIVES', inherentFalsePositives],
  ['INTERIOR VIOLATIONS', interiorViolations],
  ['ENDPOINT VIOLATIONS', endpointViolations],
] as const) {
  if (!list.length) continue;
  console.log(`\n== ${title} (${list.length}) ==`);
  for (const line of list.slice(0, 25)) console.log(`  ${line}`);
}
