import { Mesh } from './conway-operators';

export type MeshFinalizationMode = 'none' | 'planarize' | 'canonicalize';
export interface MeshFinalizationOptions {
  canonicalizeMaxIterations?: number;
}

type Edge = [number, number];
type Vec3 = [number, number, number];

const EPSILON = 1e-9;
const PLANARIZE_MAX_ITERATIONS = 200;
const CANONICALIZE_MAX_ITERATIONS = 400;
const PLANARITY_TOLERANCE = 1e-7;
const CANONICAL_TOLERANCE = 1e-7;
const EDGE_STEP = 0.2;
const PLANE_STEP = 1;

export function finalizeMesh(
  mesh: Mesh,
  mode: MeshFinalizationMode,
  options: MeshFinalizationOptions = {},
): Mesh {
  if (mode === 'none') {
    return cloneMesh(mesh);
  }

  if (mode === 'planarize') {
    return planarizeMesh(mesh);
  }

  return canonicalizeMesh(mesh, options);
}

function cloneMesh(mesh: Mesh): Mesh {
  return {
    vertices: [...mesh.vertices],
    faces: mesh.faces.map((face) => [...face]),
    faceValues: mesh.faceValues ? [...mesh.faceValues] : undefined,
  };
}

function planarizeMesh(mesh: Mesh): Mesh {
  const result = cloneMesh(mesh);
  let vertices = result.vertices;

  for (let iteration = 0; iteration < PLANARIZE_MAX_ITERATIONS; iteration += 1) {
    const step = applyPlanarityStep(vertices, result.faces, PLANE_STEP);
    if (!hasFiniteVertices(step.vertices)) {
      break;
    }
    vertices = step.vertices;
    if (step.maxPlanarityError <= PLANARITY_TOLERANCE) {
      break;
    }
  }

  result.vertices = vertices;
  return result;
}

function canonicalizeMesh(mesh: Mesh, options: MeshFinalizationOptions = {}): Mesh {
  const result = cloneMesh(mesh);
  const edges = collectUniqueEdges(result.faces);
  let vertices = normalizeForCanonicalization(result.vertices, edges);
  const maxIterations = options.canonicalizeMaxIterations ?? CANONICALIZE_MAX_ITERATIONS;

  for (let iteration = 0; iteration < maxIterations; iteration += 1) {
    const nextVertices = [...vertices];
    const accum = new Array(vertices.length).fill(0);
    const counts = new Array(vertices.length / 3).fill(0);
    let touchSum: Vec3 = [0, 0, 0];
    let touchCount = 0;
    let maxTangencyError = 0;

    for (const [a, b] of edges) {
      const pa = getVertex(vertices, a);
      const pb = getVertex(vertices, b);
      const touch = closestPointToOriginOnLine(pa, pb);
      if (!touch) {
        continue;
      }

      const radius = length(touch);
      if (!Number.isFinite(radius)) {
        continue;
      }

      const tangencyError = 1 - radius;
      maxTangencyError = Math.max(maxTangencyError, Math.abs(tangencyError));

      const correction = scale(touch, EDGE_STEP * tangencyError);
      addToVertex(accum, a, correction);
      addToVertex(accum, b, correction);
      counts[a] += 1;
      counts[b] += 1;

      touchSum = add(touchSum, touch);
      touchCount += 1;
    }

    for (let vertexIndex = 0; vertexIndex < counts.length; vertexIndex += 1) {
      const count = counts[vertexIndex];
      if (count <= 0) {
        continue;
      }

      const offset = vertexIndex * 3;
      nextVertices[offset] += accum[offset] / count;
      nextVertices[offset + 1] += accum[offset + 1] / count;
      nextVertices[offset + 2] += accum[offset + 2] / count;
    }

    let centerError = 0;
    if (touchCount > 0) {
      const center = scale(touchSum, 1 / touchCount);
      centerError = length(center);
      for (let offset = 0; offset < nextVertices.length; offset += 3) {
        nextVertices[offset] -= center[0];
        nextVertices[offset + 1] -= center[1];
        nextVertices[offset + 2] -= center[2];
      }
    }

    const planarityStep = applyPlanarityStep(nextVertices, result.faces, PLANE_STEP);
    if (!hasFiniteVertices(planarityStep.vertices)) {
      break;
    }

    vertices = planarityStep.vertices;
    const maxError = Math.max(
      maxTangencyError,
      centerError,
      planarityStep.maxPlanarityError,
    );

    if (maxError <= CANONICAL_TOLERANCE) {
      break;
    }
  }

  result.vertices = vertices;
  return result;
}

function applyPlanarityStep(vertices: number[], faces: number[][], blend: number) {
  const projected = new Array(vertices.length).fill(0);
  const counts = new Array(vertices.length / 3).fill(0);
  let maxPlanarityError = 0;

  for (const face of faces) {
    if (face.length < 3) {
      continue;
    }

    const centroid = faceCentroid(vertices, face);
    const normal = faceNormal(vertices, face, centroid);
    const normalLength = length(normal);
    if (normalLength <= EPSILON) {
      continue;
    }

    const unitNormal = scale(normal, 1 / normalLength);
    const planeDistance = dot(unitNormal, centroid);

    for (const vertexIndex of face) {
      const point = getVertex(vertices, vertexIndex);
      const distance = dot(unitNormal, point) - planeDistance;
      maxPlanarityError = Math.max(maxPlanarityError, Math.abs(distance));
      const projection = sub(point, scale(unitNormal, distance));
      addToVertex(projected, vertexIndex, projection);
      counts[vertexIndex] += 1;
    }
  }

  const nextVertices = [...vertices];
  for (let vertexIndex = 0; vertexIndex < counts.length; vertexIndex += 1) {
    const count = counts[vertexIndex];
    if (count <= 0) {
      continue;
    }

    const offset = vertexIndex * 3;
    const target: Vec3 = [
      projected[offset] / count,
      projected[offset + 1] / count,
      projected[offset + 2] / count,
    ];
    const current = getVertex(vertices, vertexIndex);
    const blended = lerp(current, target, blend);
    nextVertices[offset] = blended[0];
    nextVertices[offset + 1] = blended[1];
    nextVertices[offset + 2] = blended[2];
  }

  return { vertices: nextVertices, maxPlanarityError };
}

function normalizeForCanonicalization(vertices: number[], edges: Edge[]) {
  const centered = centerVertices(vertices);
  const avgTouchRadius = averageTouchRadius(centered, edges);

  if (avgTouchRadius > EPSILON) {
    return scaleVertices(centered, 1 / avgTouchRadius);
  }

  const avgVertexRadius = averageVertexRadius(centered);
  if (avgVertexRadius > EPSILON) {
    return scaleVertices(centered, 1 / avgVertexRadius);
  }

  return centered;
}

function collectUniqueEdges(faces: number[][]): Edge[] {
  const seen = new Set<string>();
  const edges: Edge[] = [];

  for (const face of faces) {
    for (let index = 0; index < face.length; index += 1) {
      const a = face[index];
      const b = face[(index + 1) % face.length];
      const edge: Edge = a < b ? [a, b] : [b, a];
      const key = `${edge[0]}:${edge[1]}`;
      if (seen.has(key)) {
        continue;
      }
      seen.add(key);
      edges.push(edge);
    }
  }

  return edges;
}

function averageTouchRadius(vertices: number[], edges: Edge[]) {
  let sum = 0;
  let count = 0;

  for (const [a, b] of edges) {
    const touch = closestPointToOriginOnLine(getVertex(vertices, a), getVertex(vertices, b));
    if (!touch) {
      continue;
    }
    const radius = length(touch);
    if (!Number.isFinite(radius)) {
      continue;
    }
    sum += radius;
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}

function averageVertexRadius(vertices: number[]) {
  let sum = 0;
  let count = 0;

  for (let offset = 0; offset < vertices.length; offset += 3) {
    const radius = Math.hypot(vertices[offset], vertices[offset + 1], vertices[offset + 2]);
    if (!Number.isFinite(radius)) {
      continue;
    }
    sum += radius;
    count += 1;
  }

  return count > 0 ? sum / count : 0;
}

function centerVertices(vertices: number[]) {
  const centered = [...vertices];
  const count = vertices.length / 3;
  if (count === 0) {
    return centered;
  }

  let center: Vec3 = [0, 0, 0];
  for (let offset = 0; offset < vertices.length; offset += 3) {
    center = add(center, [vertices[offset], vertices[offset + 1], vertices[offset + 2]]);
  }
  center = scale(center, 1 / count);

  for (let offset = 0; offset < centered.length; offset += 3) {
    centered[offset] -= center[0];
    centered[offset + 1] -= center[1];
    centered[offset + 2] -= center[2];
  }

  return centered;
}

function scaleVertices(vertices: number[], factor: number) {
  return vertices.map((value) => value * factor);
}

function faceCentroid(vertices: number[], face: number[]): Vec3 {
  let centroid: Vec3 = [0, 0, 0];

  for (const vertexIndex of face) {
    centroid = add(centroid, getVertex(vertices, vertexIndex));
  }

  return scale(centroid, 1 / face.length);
}

function faceNormal(vertices: number[], face: number[], centroid: Vec3): Vec3 {
  let normal: Vec3 = [0, 0, 0];

  for (let index = 0; index < face.length; index += 1) {
    const a = sub(getVertex(vertices, face[index]), centroid);
    const b = sub(getVertex(vertices, face[(index + 1) % face.length]), centroid);
    normal = add(normal, cross(a, b));
  }

  return normal;
}

function closestPointToOriginOnLine(a: Vec3, b: Vec3): Vec3 | null {
  const direction = sub(b, a);
  const denom = dot(direction, direction);
  if (denom <= EPSILON) {
    return null;
  }

  const t = -dot(a, direction) / denom;
  return add(a, scale(direction, t));
}

function getVertex(vertices: number[], index: number): Vec3 {
  const offset = index * 3;
  return [vertices[offset], vertices[offset + 1], vertices[offset + 2]];
}

function addToVertex(vertices: number[], index: number, value: Vec3) {
  const offset = index * 3;
  vertices[offset] += value[0];
  vertices[offset + 1] += value[1];
  vertices[offset + 2] += value[2];
}

function hasFiniteVertices(vertices: number[]) {
  return vertices.every((value) => Number.isFinite(value));
}

function lerp(a: Vec3, b: Vec3, t: number): Vec3 {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function add(a: Vec3, b: Vec3): Vec3 {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function scale(a: Vec3, factor: number): Vec3 {
  return [a[0] * factor, a[1] * factor, a[2] * factor];
}

function dot(a: Vec3, b: Vec3) {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function length(a: Vec3) {
  return Math.hypot(a[0], a[1], a[2]);
}
