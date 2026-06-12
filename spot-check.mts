/* Spot-check: print the actual crossing edge pairs for representative
   notations flagged by sweep-check, to confirm they are genuine proper
   crossings (not collinear-detector artifacts). */
import { applyOmni } from './src/lib/conway-operators';

function makeCanonicalQuad() {
  const vertices: number[] = [];
  for (let i = 0; i < 4; i++) {
    const a = (2 * Math.PI * i) / 4;
    vertices.push(Math.cos(a), Math.sin(a), 0);
  }
  return { vertices, faces: [[0, 1, 2, 3]] };
}

function findCrossings(mesh: { vertices: number[]; faces: number[][] }) {
  const { vertices, faces } = mesh;
  const edgeSet = new Set<string>();
  const edges: [number, number][] = [];
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i], b = face[(i + 1) % face.length];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!edgeSet.has(key)) { edgeSet.add(key); edges.push([a, b]); }
    }
  }
  const EPS = 1e-10;
  const cross2d = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;
  const out: string[] = [];
  for (let i = 0; i < edges.length && out.length < 4; i++) {
    const [a1, b1] = edges[i];
    const p1x = vertices[a1 * 3], p1y = vertices[a1 * 3 + 1];
    const p2x = vertices[b1 * 3], p2y = vertices[b1 * 3 + 1];
    for (let j = i + 1; j < edges.length && out.length < 4; j++) {
      const [a2, b2] = edges[j];
      if (a1 === a2 || a1 === b2 || b1 === a2 || b1 === b2) continue;
      const p3x = vertices[a2 * 3], p3y = vertices[a2 * 3 + 1];
      const p4x = vertices[b2 * 3], p4y = vertices[b2 * 3 + 1];
      const d1 = cross2d(p4x - p3x, p4y - p3y, p1x - p3x, p1y - p3y);
      const d2 = cross2d(p4x - p3x, p4y - p3y, p2x - p3x, p2y - p3y);
      const d3 = cross2d(p2x - p1x, p2y - p1y, p3x - p1x, p3y - p1y);
      const d4 = cross2d(p2x - p1x, p2y - p1y, p4x - p1x, p4y - p1y);
      const f = (n: number) => n.toFixed(3);
      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        out.push(`PROPER  (${f(p1x)},${f(p1y)})-(${f(p2x)},${f(p2y)}) x (${f(p3x)},${f(p3y)})-(${f(p4x)},${f(p4y)}) |d|min=${Math.min(...[d1,d2,d3,d4].map(Math.abs)).toExponential(1)}`);
      } else if (Math.abs(d1) <= EPS && Math.abs(d2) <= EPS && Math.abs(d3) <= EPS && Math.abs(d4) <= EPS) {
        const dx = p2x - p1x, dy = p2y - p1y;
        const len2 = dx * dx + dy * dy;
        if (len2 < EPS) continue;
        const t3 = ((p3x - p1x) * dx + (p3y - p1y) * dy) / len2;
        const t4 = ((p4x - p1x) * dx + (p4y - p1y) * dy) / len2;
        const lo = Math.min(t3, t4), hi = Math.max(t3, t4);
        if (lo < 1 - EPS && hi > EPS && hi - lo > EPS) {
          out.push(`COLLIN  (${f(p1x)},${f(p1y)})-(${f(p2x)},${f(p2y)}) x (${f(p3x)},${f(p3y)})-(${f(p4x)},${f(p4y)}) t∈[${lo.toFixed(2)},${hi.toFixed(2)}]`);
        }
      }
    }
  }
  return out;
}

const quad = makeCanonicalQuad();
const cases: Array<[string, [number, number, number]]> = [
  ['E-E,E-vf,vf-vf', [0.5, 0.3, 0.5]],
  ['E-E,E-vf,vf-vf', [0.5, 0.7, 0.5]],
  ['ve1-ve1,ve-vf,vf-vf', [0.5, 0.3, 0.5]],   // sweep says crossing below 0.25-ish? probe both sides
  ['ve1-ve1,ve-vf,vf-vf', [0.5, 0.2, 0.5]],
  ['ve1-ve1,ve-vf,vf-vf', [0.5, 0.7, 0.5]],
  ['E-vf,fe-vf,fe-fe', [0.5, 0.8, 0.5]],      // transition at 0.75
  ['E-vf,fe-vf,fe-fe', [0.5, 0.7, 0.5]],
  ['E-E,E-fe,F-fe,fe-fe', [0.5, 0.5, 0.08]],  // islands at 0.08, 0.22, 0.6 on diag — try per-coordinate
  ['E-E,E-fe,F-fe,fe-fe', [0.08, 0.08, 0.08]],
  ['E-E,E-fe,F-fe,fe-fe', [0.22, 0.22, 0.22]],
  ['E-E,E-fe,F-fe,fe-fe', [0.6, 0.6, 0.6]],
];

for (const [notation, [tVe, tVf, tFe]] of cases) {
  try {
    const found = findCrossings(applyOmni(quad, notation, tVe, tVf, tFe));
    console.log(`${notation} @ (${tVe},${tVf},${tFe}): ${found.length ? '' : 'clean'}`);
    for (const line of found) console.log(`   ${line}`);
  } catch (e) {
    console.log(`${notation} @ (${tVe},${tVf},${tFe}): THREW ${(e as Error).message}`);
  }
}
