import { applyOperator, Mesh } from './conway-operators';

export type RadialPolyType =
  | 'Tetrahedron' | 'Cube' | 'Octahedron' | 'Dodecahedron' | 'Icosahedron'
  | 'TruncatedTetrahedron'
  | 'Cuboctahedron' | 'TruncatedCube' | 'TruncatedOctahedron' | 'Rhombicuboctahedron' | 'TruncatedCuboctahedron' | 'SnubCube'
  | 'Icosidodecahedron' | 'TruncatedDodecahedron' | 'TruncatedIcosahedron' | 'Rhombicosidodecahedron' | 'TruncatedIcosidodecahedron' | 'SnubDodecahedron'
  | 'TriakisTetrahedron' | 'RhombicDodecahedron' | 'TriakisOctahedron' | 'TetrakisHexahedron'
  | 'DeltoidalIcositetrahedron' | 'DisdyakisDodecahedron' | 'PentagonalIcositetrahedron'
  | 'RhombicTriacontahedron' | 'TriakisIcosahedron' | 'PentakisDodecahedron'
  | 'DeltoidalHexecontahedron' | 'DisdyakisTriacontahedron' | 'PentagonalHexecontahedron'
  | 'Prism' | 'Antiprism' | 'Trapezohedron'
  | 'Pyramid' | 'Dipyramid'
  | 'ElongatedPyramid' | 'ElongatedDipyramid'
  | 'GyroelongatedPyramid' | 'GyroelongatedDipyramid'
  | 'Cupola' | 'ElongatedCupola' | 'GyroelongatedCupola'
  | 'OrthoBicupola' | 'GyroBicupola'
  | 'ElongatedOrthoBicupola' | 'ElongatedGyroBicupola'
  | 'GyroelongatedBicupola';

export const RADIAL_SOLID_NAMES: Record<RadialPolyType, string> = {
  Tetrahedron: 'Tetrahedron',
  Cube: 'Cube',
  Octahedron: 'Octahedron',
  Dodecahedron: 'Dodecahedron',
  Icosahedron: 'Icosahedron',
  TruncatedTetrahedron: 'Truncated Tetrahedron',
  Cuboctahedron: 'Cuboctahedron',
  TruncatedCube: 'Truncated Cube',
  TruncatedOctahedron: 'Truncated Octahedron',
  Rhombicuboctahedron: 'Rhombicuboctahedron',
  TruncatedCuboctahedron: 'Truncated Cuboctahedron',
  SnubCube: 'Snub Cube',
  Icosidodecahedron: 'Icosidodecahedron',
  TruncatedDodecahedron: 'Truncated Dodecahedron',
  TruncatedIcosahedron: 'Truncated Icosahedron',
  Rhombicosidodecahedron: 'Rhombicosidodecahedron',
  TruncatedIcosidodecahedron: 'Truncated Icosidodecahedron',
  SnubDodecahedron: 'Snub Dodecahedron',
  TriakisTetrahedron: 'Triakis Tetrahedron',
  RhombicDodecahedron: 'Rhombic Dodecahedron',
  TriakisOctahedron: 'Triakis Octahedron',
  TetrakisHexahedron: 'Tetrakis Hexahedron',
  DeltoidalIcositetrahedron: 'Deltoidal Icositetrahedron',
  DisdyakisDodecahedron: 'Disdyakis Dodecahedron',
  PentagonalIcositetrahedron: 'Pentagonal Icositetrahedron',
  RhombicTriacontahedron: 'Rhombic Triacontahedron',
  TriakisIcosahedron: 'Triakis Icosahedron',
  PentakisDodecahedron: 'Pentakis Dodecahedron',
  DeltoidalHexecontahedron: 'Deltoidal Hexecontahedron',
  DisdyakisTriacontahedron: 'Disdyakis Triacontahedron',
  PentagonalHexecontahedron: 'Pentagonal Hexecontahedron',
  Prism: 'Prism',
  Antiprism: 'Antiprism',
  Trapezohedron: 'Trapezohedron',
  Pyramid: 'Pyramid',
  Dipyramid: 'Dipyramid',
  ElongatedPyramid: 'Elongated Pyramid',
  ElongatedDipyramid: 'Elongated Dipyramid',
  GyroelongatedPyramid: 'Gyroelongated Pyramid',
  GyroelongatedDipyramid: 'Gyroelongated Dipyramid',
  Cupola: 'Cupola',
  ElongatedCupola: 'Elongated Cupola',
  GyroelongatedCupola: 'Gyroelongated Cupola',
  OrthoBicupola: 'Orthobicupola',
  GyroBicupola: 'Gyrobicupola',
  ElongatedOrthoBicupola: 'Elongated Orthobicupola',
  ElongatedGyroBicupola: 'Elongated Gyrobicupola',
  GyroelongatedBicupola: 'Gyroelongated Bicupola',
};

export const RADIAL_SHAPE_GROUPS: { name: string; types: RadialPolyType[] }[] = [
  { name: 'Platonic Solids', types: ['Tetrahedron', 'Cube', 'Octahedron', 'Dodecahedron', 'Icosahedron'] },
  { name: 'Archimedean Solids', types: [
    'TruncatedTetrahedron',
    'Cuboctahedron',
    'TruncatedCube',
    'TruncatedOctahedron',
    'Rhombicuboctahedron',
    'TruncatedCuboctahedron',
    'SnubCube',
    'Icosidodecahedron',
    'TruncatedDodecahedron',
    'TruncatedIcosahedron',
    'Rhombicosidodecahedron',
    'TruncatedIcosidodecahedron',
    'SnubDodecahedron',
  ] },
  { name: 'Catalan Solids', types: [
    'TriakisTetrahedron',
    'RhombicDodecahedron',
    'TriakisOctahedron',
    'TetrakisHexahedron',
    'DeltoidalIcositetrahedron',
    'DisdyakisDodecahedron',
    'PentagonalIcositetrahedron',
    'RhombicTriacontahedron',
    'TriakisIcosahedron',
    'PentakisDodecahedron',
    'DeltoidalHexecontahedron',
    'DisdyakisTriacontahedron',
    'PentagonalHexecontahedron',
  ] },
  { name: 'Prisms', types: ['Prism', 'Antiprism', 'Trapezohedron'] },
  { name: 'Pyramids', types: ['Pyramid', 'Dipyramid', 'ElongatedPyramid', 'ElongatedDipyramid', 'GyroelongatedPyramid', 'GyroelongatedDipyramid'] },
  { name: 'Cupolae', types: ['Cupola', 'ElongatedCupola', 'GyroelongatedCupola', 'OrthoBicupola', 'GyroBicupola', 'ElongatedOrthoBicupola', 'ElongatedGyroBicupola', 'GyroelongatedBicupola'] },
];

export const RADIAL_TYPES_WITH_SIDES = new Set<RadialPolyType>([
  'Prism',
  'Antiprism',
  'Trapezohedron',
  'Pyramid',
  'Dipyramid',
  'ElongatedPyramid',
  'ElongatedDipyramid',
  'GyroelongatedPyramid',
  'GyroelongatedDipyramid',
  'Cupola',
  'ElongatedCupola',
  'GyroelongatedCupola',
  'OrthoBicupola',
  'GyroBicupola',
  'ElongatedOrthoBicupola',
  'ElongatedGyroBicupola',
  'GyroelongatedBicupola',
]);

// --- vector helpers ---
type V3 = [number, number, number];
function v3(arr: number[], i: number): V3 { return [arr[i*3], arr[i*3+1], arr[i*3+2]]; }
function add(a: V3, b: V3): V3 { return [a[0]+b[0], a[1]+b[1], a[2]+b[2]]; }
function sub(a: V3, b: V3): V3 { return [a[0]-b[0], a[1]-b[1], a[2]-b[2]]; }
function scale(a: V3, s: number): V3 { return [a[0]*s, a[1]*s, a[2]*s]; }
function dot(a: V3, b: V3): number { return a[0]*b[0]+a[1]*b[1]+a[2]*b[2]; }
function cross(a: V3, b: V3): V3 { return [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]]; }
function norm(a: V3): V3 { const l = Math.sqrt(dot(a,a)); return l > 1e-10 ? scale(a, 1/l) : [0,1,0]; }

// --- normal correction ---
function fixNormals(vertices: number[], faces: number[][]): number[][] {
  const nv = vertices.length / 3;
  const mc: V3 = [0, 0, 0];
  for (let i = 0; i < nv; i++) {
    mc[0] += vertices[i*3]; mc[1] += vertices[i*3+1]; mc[2] += vertices[i*3+2];
  }
  mc[0] /= nv; mc[1] /= nv; mc[2] /= nv;

  return faces.map(face => {
    if (face.length < 3) return face;
    const n0 = cross(sub(v3(vertices, face[1]), v3(vertices, face[0])), sub(v3(vertices, face[2]), v3(vertices, face[0])));
    const fc: V3 = [0, 0, 0];
    for (const vi of face) { const p = v3(vertices, vi); fc[0]+=p[0]; fc[1]+=p[1]; fc[2]+=p[2]; }
    fc[0] /= face.length; fc[1] /= face.length; fc[2] /= face.length;
    return dot(n0, sub(fc, mc)) >= 0 ? face : [...face].reverse();
  });
}

function centerAndNormalize(mesh: Mesh, targetRadius = 1.5): Mesh {
  const centered = [...mesh.vertices];
  const vertexCount = centered.length / 3;
  if (vertexCount === 0) {
    return { vertices: centered, faces: mesh.faces.map((face) => [...face]) };
  }

  let cx = 0;
  let cy = 0;
  let cz = 0;
  for (let i = 0; i < centered.length; i += 3) {
    cx += centered[i];
    cy += centered[i + 1];
    cz += centered[i + 2];
  }
  cx /= vertexCount;
  cy /= vertexCount;
  cz /= vertexCount;

  let maxRadius = 0;
  for (let i = 0; i < centered.length; i += 3) {
    centered[i] -= cx;
    centered[i + 1] -= cy;
    centered[i + 2] -= cz;
    maxRadius = Math.max(maxRadius, Math.hypot(centered[i], centered[i + 1], centered[i + 2]));
  }

  if (maxRadius > 1e-9) {
    const scaleFactor = targetRadius / maxRadius;
    for (let i = 0; i < centered.length; i += 1) {
      centered[i] *= scaleFactor;
    }
  }

  return {
    vertices: centered,
    faces: mesh.faces.map((face) => [...face]),
    faceValues: mesh.faceValues ? [...mesh.faceValues] : undefined,
  };
}

function computeFaceCentroid(mesh: Mesh, face: number[]): Vec3 {
  const centroid: Vec3 = [0, 0, 0];
  for (const vertexIndex of face) {
    const vertex = v3(mesh.vertices, vertexIndex);
    centroid[0] += vertex[0];
    centroid[1] += vertex[1];
    centroid[2] += vertex[2];
  }
  const scaleFactor = 1 / face.length;
  return [centroid[0] * scaleFactor, centroid[1] * scaleFactor, centroid[2] * scaleFactor];
}

function computeFaceNormalRaw(mesh: Mesh, face: number[]): Vec3 {
  const centroid = computeFaceCentroid(mesh, face);
  let normal: Vec3 = [0, 0, 0];
  for (let i = 0; i < face.length; i += 1) {
    const a = sub(v3(mesh.vertices, face[i]), centroid);
    const b = sub(v3(mesh.vertices, face[(i + 1) % face.length]), centroid);
    normal = add(normal, cross(a, b));
  }
  return normal;
}

function computeVertexNormal(mesh: Mesh, incidentFaces: number[][]): Vec3 {
  let normal: Vec3 = [0, 0, 0];
  for (const face of incidentFaces) {
    normal = add(normal, computeFaceNormalRaw(mesh, face));
  }
  return norm(normal);
}

function buildAlternatedSolid(base: Mesh, operators: string[], keepColor = 0): Mesh {
  const source = buildDerivedSolid(base, operators);
  const adjacency = Array.from({ length: source.vertices.length / 3 }, () => new Set<number>());
  const incidentFaces = Array.from({ length: source.vertices.length / 3 }, () => [] as number[][]);

  for (const face of source.faces) {
    for (let i = 0; i < face.length; i += 1) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      adjacency[a].add(b);
      adjacency[b].add(a);
      incidentFaces[a].push(face);
    }
  }

  const colors = new Array(adjacency.length).fill(-1);
  for (let start = 0; start < colors.length; start += 1) {
    if (colors[start] !== -1) {
      continue;
    }
    colors[start] = 0;
    const queue = [start];
    for (let index = 0; index < queue.length; index += 1) {
      const current = queue[index];
      for (const neighbor of adjacency[current]) {
        if (colors[neighbor] === -1) {
          colors[neighbor] = 1 - colors[current];
          queue.push(neighbor);
        } else if (colors[neighbor] === colors[current]) {
          throw new Error('Alternation requires a bipartite vertex graph.');
        }
      }
    }
  }

  const keptVertices: number[] = [];
  const indexMap = new Map<number, number>();
  for (let vertexIndex = 0; vertexIndex < colors.length; vertexIndex += 1) {
    if (colors[vertexIndex] !== keepColor) {
      continue;
    }
    indexMap.set(vertexIndex, keptVertices.length / 3);
    const vertex = v3(source.vertices, vertexIndex);
    keptVertices.push(vertex[0], vertex[1], vertex[2]);
  }

  const faces: number[][] = [];

  for (const face of source.faces) {
    const filtered = face.filter((vertexIndex) => colors[vertexIndex] === keepColor);
    if (filtered.length < 3) {
      continue;
    }
    faces.push(filtered.map((vertexIndex) => indexMap.get(vertexIndex) as number));
  }

  for (let vertexIndex = 0; vertexIndex < colors.length; vertexIndex += 1) {
    if (colors[vertexIndex] === keepColor) {
      continue;
    }

    const neighbors = [...adjacency[vertexIndex]].filter((neighbor) => colors[neighbor] === keepColor);
    if (neighbors.length < 3) {
      continue;
    }

    const center = v3(source.vertices, vertexIndex);
    const normal = computeVertexNormal(source, incidentFaces[vertexIndex]);
    const fallbackAxis: Vec3 = Math.abs(normal[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const tangent = norm(cross(fallbackAxis, normal));
    const bitangent = norm(cross(normal, tangent));

    neighbors.sort((a, b) => {
      const da = sub(v3(source.vertices, a), center);
      const db = sub(v3(source.vertices, b), center);
      const angleA = Math.atan2(dot(da, bitangent), dot(da, tangent));
      const angleB = Math.atan2(dot(db, bitangent), dot(db, tangent));
      return angleA - angleB;
    });

    faces.push(neighbors.map((neighbor) => indexMap.get(neighbor) as number));
  }

  return centerAndNormalize({ vertices: keptVertices, faces });
}

// --- geometry helpers ---
function ring(n: number, radius: number, y: number, angleOffset = 0): V3[] {
  return Array.from({length: n}, (_, k) => {
    const a = 2 * Math.PI * k / n + angleOffset;
    return [radius * Math.cos(a), y, radius * Math.sin(a)] as V3;
  });
}
function flatten(verts: V3[]): number[] { return verts.flatMap(v => v); }
function mod(i: number, n: number): number { return ((i % n) + n) % n; }

// --- shape parameter helpers ---
function sideLen(n: number) { return 2 * Math.sin(Math.PI / n); }
function antiprismH(n: number) { return sideLen(n) * Math.sqrt(0.75); }
function pyramidH(n: number) {
  const cn = Math.max(3, Math.min(5, n));
  const s = sideLen(cn);
  return Math.sqrt(Math.max(0, s * s - 1));
}
function cupolaH(n: number) {
  const cn = Math.max(3, Math.min(5, n));
  const bs = 2 * Math.sin(Math.PI / (cn * 2));
  const ir2n = bs / (2 * Math.tan(Math.PI / (cn * 2)));
  const irn  = bs / (2 * Math.tan(Math.PI / cn));
  const dr = ir2n - irn;
  return Math.sqrt(Math.max(0, bs * bs - dr * dr));
}
function cupolaR(n: number) {
  const bs = 2 * Math.sin(Math.PI / (n * 2));
  return bs / (Math.sin(Math.PI / n) * 2);
}

// --- dual computation (for Trapezohedron) ---
function computeDual(verts: number[], faces: number[][]): { vertices: number[]; faces: number[][] } {
  const nv = verts.length / 3;
  const centroids: V3[] = faces.map(face => {
    const s: V3 = [0, 0, 0];
    for (const vi of face) { const p = v3(verts, vi); s[0]+=p[0]; s[1]+=p[1]; s[2]+=p[2]; }
    return scale(s, 1 / face.length);
  });

  const vFaces: number[][] = Array.from({length: nv}, () => []);
  faces.forEach((face, fi) => face.forEach(vi => vFaces[vi].push(fi)));

  const dualFaces: number[][] = [];
  for (let vi = 0; vi < nv; vi++) {
    const inc = vFaces[vi];
    if (inc.length < 3) continue;
    const vp = v3(verts, vi);
    const n_ = norm(vp);
    const up: V3 = Math.abs(n_[1]) < 0.9 ? [0,1,0] : [1,0,0];
    const right = norm(cross(up, n_));
    const fwd   = norm(cross(n_, right));
    const sorted = inc
      .map(fi => { const d = sub(centroids[fi], vp); return { fi, a: Math.atan2(dot(d, fwd), dot(d, right)) }; })
      .sort((a, b) => a.a - b.a)
      .map(x => x.fi);
    dualFaces.push(sorted);
  }
  return { vertices: centroids.flatMap(c => c), faces: dualFaces };
}

// --- shape builders ---

function makePrism(n: number, h?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? sideLen(n);
  const B = ring(n, 1, 0);
  const T = ring(n, 1, height);
  const vertices = flatten([...B, ...T]);
  const faces: number[][] = [
    Array.from({length: n}, (_, k) => n - 1 - k),         // bottom reversed
    Array.from({length: n}, (_, k) => n + k),               // top
    ...Array.from({length: n}, (_, k) => [k, mod(k+1,n), n+mod(k+1,n), n+k]),
  ];
  return { vertices, faces };
}

function makeAntiprism(n: number, h?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? antiprismH(n);
  const B = ring(n, 1, 0);
  const T = ring(n, 1, height, Math.PI / n);
  const vertices = flatten([...B, ...T]);
  const faces: number[][] = [
    Array.from({length: n}, (_, k) => n - 1 - k),
    Array.from({length: n}, (_, k) => n + k),
    ...Array.from({length: n}, (_, k) => [
      [k, mod(k+1,n), n+k],
      [n+k, mod(k+1,n), n+mod(k+1,n)],
    ]).flat(),
  ];
  return { vertices, faces };
}

function makeTrapezohedron(n: number): { vertices: number[]; faces: number[][] } {
  const { vertices, faces } = makeAntiprism(n);
  return computeDual(vertices, faces);
}

function makePyramid(n: number, h?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? pyramidH(n);
  const B = ring(n, 1, 0);
  const apex: V3 = [0, height, 0];
  const vertices = flatten([...B, apex]);
  const faces: number[][] = [
    Array.from({length: n}, (_, k) => n - 1 - k),
    ...Array.from({length: n}, (_, k) => [k, mod(k+1,n), n]),
  ];
  return { vertices, faces };
}

function makeDipyramid(n: number, h?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? pyramidH(n);
  const E = ring(n, 1, 0);
  const vertices = flatten([...E, [0, height, 0] as V3, [0, -height, 0] as V3]);
  const top = n, bot = n + 1;
  const faces: number[][] = Array.from({length: n}, (_, k) => [
    [k, mod(k+1,n), top],
    [mod(k+1,n), k, bot],
  ]).flat();
  return { vertices, faces };
}

function makeCupola(n: number, h?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? cupolaH(n);
  const capR = cupolaR(n);
  const capOff = Math.PI / (2 * n);
  const B = ring(2*n, 1, 0);
  const T = ring(n, capR, height, capOff);
  const vertices = flatten([...B, ...T]);
  const bm = (i: number) => mod(i, 2*n);
  const tm = (i: number) => 2*n + mod(i, n);
  const faces: number[][] = [
    Array.from({length: 2*n}, (_, k) => 2*n - 1 - k),
    Array.from({length: n}, (_, k) => tm(k)),
    ...Array.from({length: n}, (_, k) => [
      [bm(2*k), bm(2*k+1), tm(k)],
      [bm(2*k+1), bm(2*k+2), tm(k+1), tm(k)],
    ]).flat(),
  ];
  return { vertices, faces };
}

function makeElongatedPyramid(n: number, h?: number, capH?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? sideLen(n);
  const capHeight = capH ?? pyramidH(n);
  const B = ring(n, 1, 0);
  const T = ring(n, 1, height);
  const apex: V3 = [0, height + capHeight, 0];
  const vertices = flatten([...B, ...T, apex]);
  const faces: number[][] = [
    Array.from({length: n}, (_, k) => n - 1 - k),
    ...Array.from({length: n}, (_, k) => [k, mod(k+1,n), n+mod(k+1,n), n+k]),
    ...Array.from({length: n}, (_, k) => [n+k, n+mod(k+1,n), 2*n]),
  ];
  return { vertices, faces };
}

function makeElongatedDipyramid(n: number, h?: number, capH?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? sideLen(n);
  const capHeight = capH ?? pyramidH(n);
  const B = ring(n, 1, -height/2);
  const T = ring(n, 1, height/2);
  const vertices = flatten([...B, ...T, [0, height/2+capHeight, 0] as V3, [0, -height/2-capHeight, 0] as V3]);
  const tApex = 2*n, bApex = 2*n+1;
  const faces: number[][] = [
    ...Array.from({length: n}, (_, k) => [k, n+k, n+mod(k+1,n), mod(k+1,n)]),
    ...Array.from({length: n}, (_, k) => [n+k, n+mod(k+1,n), tApex]),
    ...Array.from({length: n}, (_, k) => [mod(k+1,n), k, bApex]),
  ];
  return { vertices, faces };
}

function makeGyroelongatedPyramid(n: number, h?: number, capH?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? antiprismH(n);
  const capHeight = capH ?? pyramidH(n);
  const B = ring(n, 1, 0);
  const T = ring(n, 1, height, Math.PI / n);
  const apex: V3 = [0, height + capHeight, 0];
  const vertices = flatten([...B, ...T, apex]);
  const faces: number[][] = [
    Array.from({length: n}, (_, k) => n - 1 - k),
    ...Array.from({length: n}, (_, k) => [
      [k, mod(k+1,n), n+k],
      [n+k, mod(k+1,n), n+mod(k+1,n)],
    ]).flat(),
    ...Array.from({length: n}, (_, k) => [n+k, n+mod(k+1,n), 2*n]),
  ];
  return { vertices, faces };
}

function makeGyroelongatedDipyramid(n: number, h?: number, capH?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? antiprismH(n);
  const capHeight = capH ?? pyramidH(n);
  const B = ring(n, 1, -height/2);
  const T = ring(n, 1, height/2, Math.PI / n);
  const vertices = flatten([...B, ...T, [0, height/2+capHeight, 0] as V3, [0, -height/2-capHeight, 0] as V3]);
  const tApex = 2*n, bApex = 2*n+1;
  const faces: number[][] = [
    ...Array.from({length: n}, (_, k) => [
      [k, mod(k+1,n), n+k],
      [n+k, mod(k+1,n), n+mod(k+1,n)],
    ]).flat(),
    ...Array.from({length: n}, (_, k) => [n+k, n+mod(k+1,n), tApex]),
    ...Array.from({length: n}, (_, k) => [mod(k+1,n), k, bApex]),
  ];
  return { vertices, faces };
}

function makeElongatedCupola(n: number, h?: number, capH?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? sideLen(2*n);
  const capHeight = capH ?? cupolaH(n);
  const capR = cupolaR(n);
  const capOff = Math.PI / (2*n);
  const Bm = ring(2*n, 1, 0);
  const Mm = ring(2*n, 1, height);
  const Tm = ring(n, capR, height + capHeight, capOff);
  const vertices = flatten([...Bm, ...Mm, ...Tm]);
  const bm = (i: number) => mod(i, 2*n);
  const mm = (i: number) => 2*n + mod(i, 2*n);
  const tm = (i: number) => 4*n + mod(i, n);
  const faces: number[][] = [
    Array.from({length: 2*n}, (_, k) => 2*n - 1 - k),
    Array.from({length: n}, (_, k) => tm(k)),
    ...Array.from({length: 2*n}, (_, k) => [bm(k), bm(k+1), mm(k+1), mm(k)]),
    ...Array.from({length: n}, (_, k) => [
      [mm(2*k), mm(2*k+1), tm(k)],
      [mm(2*k+1), mm(2*k+2), tm(k+1), tm(k)],
    ]).flat(),
  ];
  return { vertices, faces };
}

function makeBicupola(n: number, capH: number, gyro: boolean): { vertices: number[]; faces: number[][] } {
  const capR = cupolaR(n);
  const topOff = Math.PI / (2*n);
  const botOff = gyro ? 3 * Math.PI / (2*n) : Math.PI / (2*n);
  const Mm = ring(2*n, 1, 0);
  const Tm = ring(n, capR,  capH, topOff);
  const Bm = ring(n, capR, -capH, botOff);
  const vertices = flatten([...Mm, ...Tm, ...Bm]);
  const mm = (i: number) => mod(i, 2*n);
  const tm = (i: number) => 2*n + mod(i, n);
  const bm = (i: number) => 3*n + mod(i, n);
  const topFaces = Array.from({length: n}, (_, k) => [
    [mm(2*k), mm(2*k+1), tm(k)],
    [mm(2*k+1), mm(2*k+2), tm(k+1), tm(k)],
  ]).flat();
  const botFaces = gyro
    ? Array.from({length: n}, (_, k) => [
        [mm(2*k+1), mm(2*k+2), bm(k)],
        [mm(2*k+2), mm(2*k+3), bm(k+1), bm(k)],
      ]).flat()
    : Array.from({length: n}, (_, k) => [
        [mm(2*k), mm(2*k+1), bm(k)],
        [mm(2*k+1), mm(2*k+2), bm(k+1), bm(k)],
      ]).flat();
  const faces: number[][] = [
    Array.from({length: n}, (_, k) => tm(k)),
    Array.from({length: n}, (_, k) => bm(k)),
    ...topFaces,
    ...botFaces,
  ];
  return { vertices, faces };
}

function makeElongatedBicupola(n: number, h: number, capH: number, gyro: boolean): { vertices: number[]; faces: number[][] } {
  const capR = cupolaR(n);
  const topOff = Math.PI / (2*n);
  const botOff = gyro ? 3 * Math.PI / (2*n) : Math.PI / (2*n);
  const Bm = ring(2*n, 1, 0);
  const Um = ring(2*n, 1, h);
  const Tm = ring(n, capR, h + capH, topOff);
  const Cm = ring(n, capR, -capH, botOff);
  const vertices = flatten([...Bm, ...Um, ...Tm, ...Cm]);
  const bm = (i: number) => mod(i, 2*n);
  const um = (i: number) => 2*n + mod(i, 2*n);
  const tm = (i: number) => 4*n + mod(i, n);
  const cm = (i: number) => 5*n + mod(i, n);
  const topFaces = Array.from({length: n}, (_, k) => [
    [um(2*k), um(2*k+1), tm(k)],
    [um(2*k+1), um(2*k+2), tm(k+1), tm(k)],
  ]).flat();
  const botFaces = gyro
    ? Array.from({length: n}, (_, k) => [
        [bm(2*k+1), bm(2*k+2), cm(k)],
        [bm(2*k+2), bm(2*k+3), cm(k+1), cm(k)],
      ]).flat()
    : Array.from({length: n}, (_, k) => [
        [bm(2*k), bm(2*k+1), cm(k)],
        [bm(2*k+1), bm(2*k+2), cm(k+1), cm(k)],
      ]).flat();
  const faces: number[][] = [
    Array.from({length: n}, (_, k) => tm(k)),
    Array.from({length: n}, (_, k) => cm(k)),
    ...Array.from({length: 2*n}, (_, k) => [bm(k), bm(k+1), um(k+1), um(k)]),
    ...topFaces,
    ...botFaces,
  ];
  return { vertices, faces };
}

function makeGyroelongatedCupola(n: number, h?: number, capH?: number): { vertices: number[]; faces: number[][] } {
  const height = h ?? antiprismH(2*n);
  const capHeight = capH ?? cupolaH(n);
  const capR = cupolaR(n);
  const antiOff = Math.PI / (2*n);
  const Bm = ring(2*n, 1, 0);
  const Tm = ring(2*n, 1, height, antiOff);
  const Cm = ring(n, capR, height + capHeight, 0);
  const vertices = flatten([...Bm, ...Tm, ...Cm]);
  const bm = (i: number) => mod(i, 2*n);
  const tm = (i: number) => 2*n + mod(i, 2*n);
  const cm = (i: number) => 4*n + mod(i, n);
  const faces: number[][] = [
    Array.from({length: 2*n}, (_, k) => 2*n - 1 - k),
    Array.from({length: n}, (_, k) => cm(k)),
    ...Array.from({length: 2*n}, (_, k) => [
      [bm(k), bm(k+1), tm(k)],
      [tm(k), bm(k+1), tm(k+1)],
    ]).flat(),
    ...Array.from({length: n}, (_, k) => [
      [tm(2*k-1), tm(2*k), cm(k)],
      [tm(2*k), tm(2*k+1), cm(k+1), cm(k)],
    ]).flat(),
  ];
  return { vertices, faces };
}

function makeGyroelongatedBicupola(n: number, h?: number, capH?: number, capGyro = false): { vertices: number[]; faces: number[][] } {
  const height = h ?? antiprismH(2*n);
  const capHeight = capH ?? cupolaH(n);
  const capR = cupolaR(n);
  const antiOff = Math.PI / (2*n);
  const botOff = capGyro ? 3 * Math.PI / (2*n) : Math.PI / (2*n);
  const Bm = ring(2*n, 1, 0);
  const Tm = ring(2*n, 1, height, antiOff);
  const Cm = ring(n, capR, height + capHeight, 0);
  const Dm = ring(n, capR, -capHeight, botOff);
  const vertices = flatten([...Bm, ...Tm, ...Cm, ...Dm]);
  const bm = (i: number) => mod(i, 2*n);
  const tm = (i: number) => 2*n + mod(i, 2*n);
  const cm = (i: number) => 4*n + mod(i, n);
  const dm = (i: number) => 5*n + mod(i, n);
  const botFaces = capGyro
    ? Array.from({length: n}, (_, k) => [
        [bm(2*k+1), bm(2*k+2), dm(k)],
        [bm(2*k+2), bm(2*k+3), dm(k+1), dm(k)],
      ]).flat()
    : Array.from({length: n}, (_, k) => [
        [bm(2*k), bm(2*k+1), dm(k)],
        [bm(2*k+1), bm(2*k+2), dm(k+1), dm(k)],
      ]).flat();
  const faces: number[][] = [
    Array.from({length: n}, (_, k) => cm(k)),
    Array.from({length: n}, (_, k) => dm(k)),
    ...Array.from({length: 2*n}, (_, k) => [
      [bm(k), bm(k+1), tm(k)],
      [tm(k), bm(k+1), tm(k+1)],
    ]).flat(),
    ...Array.from({length: n}, (_, k) => [
      [tm(2*k-1), tm(2*k), cm(k)],
      [tm(2*k), tm(2*k+1), cm(k+1), cm(k)],
    ]).flat(),
    ...botFaces,
  ];
  return { vertices, faces };
}

function makeTetrahedron(): Mesh {
  return centerAndNormalize(makePyramid(3));
}

function makeCube(): Mesh {
  return centerAndNormalize(makePrism(4));
}

function makeOctahedron(): Mesh {
  return centerAndNormalize(makeDipyramid(3));
}

function makeIcosahedron(): Mesh {
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices = [
    -1, phi, 0,
    1, phi, 0,
    -1, -phi, 0,
    1, -phi, 0,
    0, -1, phi,
    0, 1, phi,
    0, -1, -phi,
    0, 1, -phi,
    phi, 0, -1,
    phi, 0, 1,
    -phi, 0, -1,
    -phi, 0, 1,
  ];
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return centerAndNormalize({ vertices, faces });
}

function makeDodecahedron(): Mesh {
  const icosa = makeIcosahedron();
  return centerAndNormalize(computeDual(icosa.vertices, icosa.faces));
}

function buildDerivedSolid(base: Mesh, operators: string[]): Mesh {
  let mesh = centerAndNormalize(base);
  for (const operator of operators) {
    mesh = applyOperator(mesh, operator);
  }
  return centerAndNormalize(mesh);
}

function buildDualSolid(mesh: Mesh): Mesh {
  return centerAndNormalize(computeDual(mesh.vertices, mesh.faces));
}

function buildCatalanSolid(base: Mesh, operators: string[]): Mesh {
  return buildDualSolid(buildDerivedSolid(base, operators));
}

// --- public API ---

export function buildRadialSolid(type: RadialPolyType, sides: number): { vertices: number[]; faces: number[][] } {
  const n = Math.max(3, Math.min(16, sides));
  let result: { vertices: number[]; faces: number[][] };
  switch (type) {
    case 'Tetrahedron':            result = makeTetrahedron(); break;
    case 'Cube':                   result = makeCube(); break;
    case 'Octahedron':             result = makeOctahedron(); break;
    case 'Dodecahedron':           result = makeDodecahedron(); break;
    case 'Icosahedron':            result = makeIcosahedron(); break;
    case 'TruncatedTetrahedron':   result = buildDerivedSolid(makeTetrahedron(), ['Truncate']); break;
    case 'Cuboctahedron':          result = buildDerivedSolid(makeCube(), ['Ambo']); break;
    case 'TruncatedCube':          result = buildDerivedSolid(makeCube(), ['Truncate']); break;
    case 'TruncatedOctahedron':    result = buildDerivedSolid(makeOctahedron(), ['Truncate']); break;
    case 'Rhombicuboctahedron':    result = buildDerivedSolid(makeCube(), ['Expand']); break;
    case 'TruncatedCuboctahedron': result = buildDerivedSolid(makeCube(), ['Ambo', 'Truncate']); break;
    case 'SnubCube':               result = buildAlternatedSolid(makeCube(), ['Ambo', 'Truncate']); break;
    case 'Icosidodecahedron':      result = buildDerivedSolid(makeDodecahedron(), ['Ambo']); break;
    case 'TruncatedDodecahedron':  result = buildDerivedSolid(makeDodecahedron(), ['Truncate']); break;
    case 'TruncatedIcosahedron':   result = buildDerivedSolid(makeIcosahedron(), ['Truncate']); break;
    case 'Rhombicosidodecahedron': result = buildDerivedSolid(makeDodecahedron(), ['Expand']); break;
    case 'TruncatedIcosidodecahedron':
      result = buildDerivedSolid(makeDodecahedron(), ['Ambo', 'Truncate']);
      break;
    case 'SnubDodecahedron':
      result = buildAlternatedSolid(makeDodecahedron(), ['Ambo', 'Truncate']);
      break;
    case 'TriakisTetrahedron':          result = buildCatalanSolid(makeTetrahedron(), ['Truncate']); break;
    case 'RhombicDodecahedron':         result = buildCatalanSolid(makeCube(), ['Ambo']); break;
    case 'TriakisOctahedron':           result = buildCatalanSolid(makeCube(), ['Truncate']); break;
    case 'TetrakisHexahedron':          result = buildCatalanSolid(makeOctahedron(), ['Truncate']); break;
    case 'DeltoidalIcositetrahedron':   result = buildCatalanSolid(makeCube(), ['Expand']); break;
    case 'DisdyakisDodecahedron':       result = buildCatalanSolid(makeCube(), ['Ambo', 'Truncate']); break;
    case 'PentagonalIcositetrahedron':  result = buildDualSolid(buildAlternatedSolid(makeCube(), ['Ambo', 'Truncate'])); break;
    case 'RhombicTriacontahedron':      result = buildCatalanSolid(makeDodecahedron(), ['Ambo']); break;
    case 'TriakisIcosahedron':          result = buildCatalanSolid(makeDodecahedron(), ['Truncate']); break;
    case 'PentakisDodecahedron':        result = buildCatalanSolid(makeIcosahedron(), ['Truncate']); break;
    case 'DeltoidalHexecontahedron':    result = buildCatalanSolid(makeDodecahedron(), ['Expand']); break;
    case 'DisdyakisTriacontahedron':
      result = buildCatalanSolid(makeDodecahedron(), ['Ambo', 'Truncate']);
      break;
    case 'PentagonalHexecontahedron':
      result = buildDualSolid(buildAlternatedSolid(makeDodecahedron(), ['Ambo', 'Truncate']));
      break;
    case 'Prism':                  result = makePrism(n); break;
    case 'Antiprism':              result = makeAntiprism(n); break;
    case 'Trapezohedron':          result = makeTrapezohedron(n); break;
    case 'Pyramid':                result = makePyramid(n); break;
    case 'Dipyramid':              result = makeDipyramid(n); break;
    case 'ElongatedPyramid':       result = makeElongatedPyramid(n); break;
    case 'ElongatedDipyramid':     result = makeElongatedDipyramid(n); break;
    case 'GyroelongatedPyramid':   result = makeGyroelongatedPyramid(n); break;
    case 'GyroelongatedDipyramid': result = makeGyroelongatedDipyramid(n); break;
    case 'Cupola':                 result = makeCupola(n); break;
    case 'ElongatedCupola':        result = makeElongatedCupola(n); break;
    case 'GyroelongatedCupola':    result = makeGyroelongatedCupola(n); break;
    case 'OrthoBicupola':          result = makeBicupola(n, cupolaH(n), false); break;
    case 'GyroBicupola':           result = makeBicupola(n, cupolaH(n), true); break;
    case 'ElongatedOrthoBicupola': result = makeElongatedBicupola(n, sideLen(2*n), cupolaH(n), false); break;
    case 'ElongatedGyroBicupola':  result = makeElongatedBicupola(n, sideLen(2*n), cupolaH(n), true); break;
    case 'GyroelongatedBicupola':  result = makeGyroelongatedBicupola(n); break;
  }
  return { vertices: result.vertices, faces: fixNormals(result.vertices, result.faces) };
}
