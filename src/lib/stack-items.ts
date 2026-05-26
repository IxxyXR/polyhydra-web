import { Mesh, OperatorSpec } from './conway-operators';

export type DeformerMode = 'stretch' | 'taper' | 'spherify';
export type DeformerAxis = 'x' | 'y' | 'z';
export type ClonerMode = 'point' | 'wallpaper' | 'array';
export type PointGroupSymmetry = 'Cn' | 'Cnv' | 'Cnh' | 'Sn' | 'Dn' | 'Dnh' | 'Dnd' | 'T' | 'Th' | 'Td' | 'O' | 'Oh' | 'I' | 'Ih';
export type WallpaperSymmetry = 'p1' | 'p2' | 'pm' | 'pg' | 'cm' | 'pmm' | 'pmg' | 'pgg' | 'cmm' | 'p4' | 'p4m' | 'p4g' | 'p3' | 'p3m1' | 'p31m' | 'p6' | 'p6m';
export type WallpaperPlane = 'xy' | 'yz' | 'xz';
export type PointOrbitSite = 'generic' | 'vertex' | 'edge' | 'face';

export const POINT_GROUP_SYMMETRIES: PointGroupSymmetry[] = ['Cn', 'Cnv', 'Cnh', 'Sn', 'Dn', 'Dnh', 'Dnd', 'T', 'Th', 'Td', 'O', 'Oh', 'I', 'Ih'];
export const WALLPAPER_SYMMETRIES: WallpaperSymmetry[] = ['p1', 'p2', 'pm', 'pg', 'cm', 'pmm', 'pmg', 'pgg', 'cmm', 'p4', 'p4m', 'p4g', 'p3', 'p3m1', 'p31m', 'p6', 'p6m'];
export const WALLPAPER_PLANES: WallpaperPlane[] = ['xy', 'yz', 'xz'];
export const POINT_ORBIT_SITES: PointOrbitSite[] = ['generic', 'vertex', 'edge', 'face'];

export interface OperatorStackItem extends OperatorSpec {
  id: string;
  enabled: boolean;
  kind: 'operator';
}

export interface DeformerStackItem {
  id: string;
  enabled: boolean;
  kind: 'deformer';
  mode: DeformerMode;
  amount: number;
  axis: DeformerAxis;
}

export interface ClonerStackItem {
  id: string;
  enabled: boolean;
  kind: 'cloner';
  mode: ClonerMode;
  pointGroup: PointGroupSymmetry;
  pointAutoFit: boolean;
  pointGap: number;
  pointOrbitSite: PointOrbitSite;
  wallpaperGroup: WallpaperSymmetry;
  wallpaperPlane: WallpaperPlane;
  copies: number;
  radius: number;
  xRepeats: number;
  yRepeats: number;
  cellWidth: number;
  cellHeight: number;
  cellOffsetX: number;
  cellOffsetY: number;
  skewX: number;
  skewY: number;
  unitScale: number;
  unitOffsetX: number;
  unitOffsetY: number;
  wallpaperAutoFit: boolean;
  spacingX: number;
  spacingY: number;
  spacing: number;
  rotation: number;
  arrayCountX: number;
  arrayCountY: number;
  arrayCountZ: number;
  arrayTranslateX: number;
  arrayTranslateY: number;
  arrayTranslateZ: number;
  arrayRotateX: number;
  arrayRotateY: number;
  arrayRotateZ: number;
  arrayScale: number;
}

export type StackItem = OperatorStackItem | DeformerStackItem | ClonerStackItem;

export function isOperatorStackItem(item: StackItem): item is OperatorStackItem {
  return item.kind === 'operator';
}

export function isDeformerStackItem(item: StackItem): item is DeformerStackItem {
  return item.kind === 'deformer';
}

export function isClonerStackItem(item: StackItem): item is ClonerStackItem {
  return item.kind === 'cloner';
}

export function isInfinitePointGroup(group: PointGroupSymmetry) {
  return false;
}

export function getPointGroupBaseOrder(group: PointGroupSymmetry, fallbackCopies: number) {
  return usesPointGroupOrder(group) ? Math.min(Math.max(Math.round(fallbackCopies), 1), 12) : 1;
}

export function usesPointGroupOrder(group: PointGroupSymmetry) {
  return group === 'Cn' || group === 'Cnv' || group === 'Cnh' || group === 'Sn' || group === 'Dn' || group === 'Dnh' || group === 'Dnd';
}

export function getPointGroupCopyCount(group: PointGroupSymmetry, order: number) {
  const n = getPointGroupBaseOrder(group, order);
  if (group === 'Cn') return n;
  if (group === 'Cnv' || group === 'Cnh' || group === 'Sn' || group === 'Dn') return n * 2;
  if (group === 'Dnh' || group === 'Dnd') return n * 4;
  if (group === 'T') return 12;
  if (group === 'Th' || group === 'Td') return 24;
  if (group === 'O') return 24;
  if (group === 'Oh') return 48;
  if (group === 'I') return 60;
  return 120;
}

function cloneMesh(mesh: Mesh): Mesh {
  return {
    vertices: [...mesh.vertices],
    faces: mesh.faces.map((face) => [...face]),
    faceValues: mesh.faceValues ? [...mesh.faceValues] : undefined,
    roleValues: mesh.roleValues ? [...mesh.roleValues] : undefined,
  };
}

function getAxisIndex(axis: DeformerAxis) {
  return axis === 'x' ? 0 : axis === 'y' ? 1 : 2;
}

function getMeshBounds(vertices: number[]) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < vertices.length; index += 3) {
    for (let axis = 0; axis < 3; axis++) {
      min[axis] = Math.min(min[axis], vertices[index + axis]);
      max[axis] = Math.max(max[axis], vertices[index + axis]);
    }
  }
  return { min, max };
}

export function applyDeformer(mesh: Mesh, deformer: DeformerStackItem): Mesh {
  const next = cloneMesh(mesh);
  const axisIndex = getAxisIndex(deformer.axis);
  const amount = Math.min(Math.max(deformer.amount, -1), 1);
  const { min, max } = getMeshBounds(next.vertices);
  const center = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];
  const span = Math.max(max[axisIndex] - min[axisIndex], 1e-6);

  for (let index = 0; index < next.vertices.length; index += 3) {
    if (deformer.mode === 'stretch') {
      next.vertices[index + axisIndex] = center[axisIndex] + (next.vertices[index + axisIndex] - center[axisIndex]) * (1 + amount);
    } else if (deformer.mode === 'taper') {
      const t = (next.vertices[index + axisIndex] - min[axisIndex]) / span;
      const scale = Math.max(0.05, 1 + amount * (t - 0.5) * 2);
      for (let axis = 0; axis < 3; axis++) {
        if (axis !== axisIndex) {
          next.vertices[index + axis] = center[axis] + (next.vertices[index + axis] - center[axis]) * scale;
        }
      }
    } else if (deformer.mode === 'spherify') {
      const x = next.vertices[index] - center[0];
      const y = next.vertices[index + 1] - center[1];
      const z = next.vertices[index + 2] - center[2];
      const length = Math.hypot(x, y, z);
      if (length > 1e-6) {
        const targetRadius = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]) / 2;
        const blend = Math.max(0, amount);
        next.vertices[index] = center[0] + x * (1 - blend) + (x / length) * targetRadius * blend;
        next.vertices[index + 1] = center[1] + y * (1 - blend) + (y / length) * targetRadius * blend;
        next.vertices[index + 2] = center[2] + z * (1 - blend) + (z / length) * targetRadius * blend;
      }
    }
  }

  return next;
}

interface CloneTransform {
  rotation: number;
  mirrorX?: boolean;
  tx: number;
  ty: number;
  originX?: number;
  originY?: number;
  originZ?: number;
  scale?: number;
  unitOffsetX?: number;
  unitOffsetY?: number;
  unitOffsetZ?: number;
  matrix?: [number, number, number, number];
  matrix3?: Matrix3;
  wallpaperPlane?: WallpaperPlane;
  // Direct world-space affine: world = m * source + t. Used by the array cloner,
  // bypassing the point/wallpaper origin + plane machinery above.
  affine3?: { m: Matrix3; t: [number, number, number] };
}

type Matrix2 = [number, number, number, number];
type Matrix3 = [number, number, number, number, number, number, number, number, number];

interface AffineTransform {
  matrix: Matrix2;
  tx: number;
  ty: number;
}

interface WallpaperGeometry {
  fundamentalRegion: Array<[number, number]>;
  translationX: [number, number];
  translationY: [number, number];
  reps: AffineTransform[];
}

const IDENTITY_MATRIX: Matrix2 = [1, 0, 0, 1];
const IDENTITY_MATRIX_3: Matrix3 = [1, 0, 0, 0, 1, 0, 0, 0, 1];

function getWallpaperPlaneComponents(vertices: number[], index: number, plane: WallpaperPlane) {
  if (plane === 'yz') {
    return { u: vertices[index + 1], v: vertices[index + 2], w: vertices[index] };
  }
  if (plane === 'xz') {
    return { u: vertices[index], v: vertices[index + 2], w: vertices[index + 1] };
  }
  return { u: vertices[index], v: vertices[index + 1], w: vertices[index + 2] };
}

function pushWallpaperPlaneVertex(target: number[], plane: WallpaperPlane, transformedU: number, transformedV: number, transformedW: number) {
  if (plane === 'yz') {
    target.push(transformedW, transformedU, transformedV);
  } else if (plane === 'xz') {
    target.push(transformedU, transformedW, transformedV);
  } else {
    target.push(transformedU, transformedV, transformedW);
  }
}

function pushTransformedMeshCopy(source: Mesh, target: Mesh, transform: CloneTransform) {
  if (transform.affine3) {
    const { m, t } = transform.affine3;
    const baseOffset = target.vertices.length / 3;
    for (let index = 0; index < source.vertices.length; index += 3) {
      const x = source.vertices[index];
      const y = source.vertices[index + 1];
      const z = source.vertices[index + 2];
      target.vertices.push(
        m[0] * x + m[1] * y + m[2] * z + t[0],
        m[3] * x + m[4] * y + m[5] * z + t[1],
        m[6] * x + m[7] * y + m[8] * z + t[2],
      );
    }
    const affineDeterminant = determinant3(m);
    source.faces.forEach((face) => {
      const transformedFace = face.map((vertex) => vertex + baseOffset);
      target.faces.push(affineDeterminant < 0 ? transformedFace.reverse() : transformedFace);
    });
    source.faceValues?.forEach((value) => target.faceValues?.push(value));
    source.roleValues?.forEach((value) => target.roleValues?.push(value));
    return;
  }

  const vertexOffset = target.vertices.length / 3;
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  const originX = transform.originX ?? 0;
  const originY = transform.originY ?? 0;
  const originZ = transform.originZ ?? 0;
  const scale = transform.scale ?? 1;
  const unitOffsetX = transform.unitOffsetX ?? 0;
  const unitOffsetY = transform.unitOffsetY ?? 0;
  const unitOffsetZ = transform.unitOffsetZ ?? 0;
  const matrix = transform.matrix;
  const matrix3 = transform.matrix3;
  const determinant = matrix3
    ? determinant3(matrix3)
    : matrix ? matrix[0] * matrix[3] - matrix[1] * matrix[2] : (transform.mirrorX ? -1 : 1);
  const wallpaperPlane = transform.wallpaperPlane ?? 'xy';

  for (let index = 0; index < source.vertices.length; index += 3) {
    const sourceComponents = getWallpaperPlaneComponents(source.vertices, index, wallpaperPlane);
    const localX = (sourceComponents.u - originX) * scale + unitOffsetX;
    const localY = (sourceComponents.v - originY) * scale + unitOffsetY;
    const localZ = (sourceComponents.w - originZ) * scale + originZ + unitOffsetZ;
    if (matrix3) {
      pushWallpaperPlaneVertex(
        target.vertices,
        wallpaperPlane,
        matrix3[0] * localX + matrix3[1] * localY + matrix3[2] * localZ,
        matrix3[3] * localX + matrix3[4] * localY + matrix3[5] * localZ,
        matrix3[6] * localX + matrix3[7] * localY + matrix3[8] * localZ,
      );
      continue;
    }
    const sx = transform.mirrorX ? -localX : localX;
    const sy = localY;
    pushWallpaperPlaneVertex(
      target.vertices,
      wallpaperPlane,
      matrix ? sx * matrix[0] + sy * matrix[1] + transform.tx : sx * cos - sy * sin + transform.tx,
      matrix ? sx * matrix[2] + sy * matrix[3] + transform.ty : sx * sin + sy * cos + transform.ty,
      localZ,
    );
  }

  source.faces.forEach((face) => {
    const transformedFace = face.map((vertex) => vertex + vertexOffset);
    target.faces.push(determinant < 0 ? transformedFace.reverse() : transformedFace);
  });
  source.faceValues?.forEach((value) => target.faceValues?.push(value));
  source.roleValues?.forEach((value) => target.roleValues?.push(value));
}

function makePointGroupTransforms(mesh: Mesh, cloner: ClonerStackItem): CloneTransform[] {
  const { min, max } = getMeshBounds(mesh.vertices);
  const originX = (min[0] + max[0]) / 2;
  const originY = (min[1] + max[1]) / 2;
  const originZ = (min[2] + max[2]) / 2;
  const orientation = pointGroupOrientationMatrix(cloner.wallpaperPlane ?? 'xz');
  const orientationInverse = transposeMatrix3(orientation);
  const matrices = makePointGroupMatrices(cloner.pointGroup, getPointGroupBaseOrder(cloner.pointGroup, cloner.copies))
    .map((matrix) => multiplyMatrix3(orientation, multiplyMatrix3(matrix, orientationInverse)));
  const unitScale = cloner.unitScale;
  const seedDirection = transform3(orientation, getPointGroupSeedDirection(cloner.pointOrbitSite));
  const radius = cloner.pointAutoFit
    ? getPointGroupAutoRadius(mesh, matrices, seedDirection, originX, originY, originZ, unitScale, cloner.pointGap)
    : Math.max(cloner.radius, 0.01);
  const seed = seedDirection.map((value) => value * radius) as [number, number, number];
  return matrices.map((matrix) => ({
    rotation: 0,
    tx: 0,
    ty: 0,
    matrix3: matrix,
    originX,
    originY,
    originZ,
    scale: unitScale,
    unitOffsetX: seed[0],
    unitOffsetY: seed[1],
    unitOffsetZ: seed[2] - originZ,
  }));
}

function getPointGroupSeedDirection(site: PointOrbitSite): [number, number, number] {
  if (site === 'vertex') return normalize3([1, 1, 1]);
  if (site === 'edge') return normalize3([1, 1, 0]);
  if (site === 'face') return [0, 0, 1];
  return normalize3([0.37, 0.53, 1]);
}

function getMaxRadius3(mesh: Mesh, originX: number, originY: number, originZ: number) {
  let radius = 0;
  for (let index = 0; index < mesh.vertices.length; index += 3) {
    radius = Math.max(radius, Math.hypot(mesh.vertices[index] - originX, mesh.vertices[index + 1] - originY, mesh.vertices[index + 2] - originZ));
  }
  return Math.max(radius, 1e-6);
}

function getVisualPackingRadius3(mesh: Mesh) {
  const { min, max } = getMeshBounds(mesh.vertices);
  const spanX = Math.max(max[0] - min[0], 1e-6);
  const spanY = Math.max(max[1] - min[1], 1e-6);
  const spanZ = Math.max(max[2] - min[2], 1e-6);
  return (spanX + spanY + spanZ) / 6;
}

function getPointGroupAutoRadius(
  mesh: Mesh,
  matrices: Matrix3[],
  seedDirection: [number, number, number],
  originX: number,
  originY: number,
  originZ: number,
  unitScale: number,
  gap: number,
) {
  if (matrices.length <= 1) return 0;
  const centers = matrices.map((matrix) => transform3(matrix, seedDirection));
  let nearestUnitDistance = Infinity;
  for (let a = 0; a < centers.length; a++) {
    for (let b = a + 1; b < centers.length; b++) {
      const distance = Math.hypot(centers[a][0] - centers[b][0], centers[a][1] - centers[b][1], centers[a][2] - centers[b][2]);
      if (distance > 1e-6) nearestUnitDistance = Math.min(nearestUnitDistance, distance);
    }
  }
  if (!Number.isFinite(nearestUnitDistance)) return 0;
  const sourceRadius = getVisualPackingRadius3(mesh) * unitScale;
  const desiredNearestDistance = sourceRadius * 2 * (1 + Math.max(gap, 0));
  return desiredNearestDistance / nearestUnitDistance;
}

function matrixFromRotation(rotation: number): Matrix2 {
  return [
    Math.cos(rotation),
    -Math.sin(rotation),
    Math.sin(rotation),
    Math.cos(rotation),
  ];
}

function determinant3(matrix: Matrix3) {
  return matrix[0] * (matrix[4] * matrix[8] - matrix[5] * matrix[7])
    - matrix[1] * (matrix[3] * matrix[8] - matrix[5] * matrix[6])
    + matrix[2] * (matrix[3] * matrix[7] - matrix[4] * matrix[6]);
}

function multiplyMatrix3(a: Matrix3, b: Matrix3): Matrix3 {
  return [
    a[0] * b[0] + a[1] * b[3] + a[2] * b[6],
    a[0] * b[1] + a[1] * b[4] + a[2] * b[7],
    a[0] * b[2] + a[1] * b[5] + a[2] * b[8],
    a[3] * b[0] + a[4] * b[3] + a[5] * b[6],
    a[3] * b[1] + a[4] * b[4] + a[5] * b[7],
    a[3] * b[2] + a[4] * b[5] + a[5] * b[8],
    a[6] * b[0] + a[7] * b[3] + a[8] * b[6],
    a[6] * b[1] + a[7] * b[4] + a[8] * b[7],
    a[6] * b[2] + a[7] * b[5] + a[8] * b[8],
  ];
}

function transposeMatrix3(matrix: Matrix3): Matrix3 {
  return [
    matrix[0], matrix[3], matrix[6],
    matrix[1], matrix[4], matrix[7],
    matrix[2], matrix[5], matrix[8],
  ];
}

function pointGroupOrientationMatrix(plane: WallpaperPlane): Matrix3 {
  if (plane === 'xy') return rotationX(Math.PI / 2);
  if (plane === 'yz') return rotationZ(-Math.PI / 2);
  return IDENTITY_MATRIX_3;
}

function rotationX(angle: number): Matrix3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [1, 0, 0, 0, c, -s, 0, s, c];
}

function rotationY(angle: number): Matrix3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, 0, s, 0, 1, 0, -s, 0, c];
}

function rotationZ(angle: number): Matrix3 {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, -s, 0, s, c, 0, 0, 0, 1];
}

function scaleMatrix3(x: number, y: number, z: number): Matrix3 {
  return [x, 0, 0, 0, y, 0, 0, 0, z];
}

function transform3(matrix: Matrix3, point: [number, number, number]): [number, number, number] {
  return [
    matrix[0] * point[0] + matrix[1] * point[1] + matrix[2] * point[2],
    matrix[3] * point[0] + matrix[4] * point[1] + matrix[5] * point[2],
    matrix[6] * point[0] + matrix[7] * point[1] + matrix[8] * point[2],
  ];
}

function normalize3(vector: [number, number, number]): [number, number, number] {
  const length = Math.hypot(vector[0], vector[1], vector[2]) || 1;
  return [vector[0] / length, vector[1] / length, vector[2] / length];
}

function cross3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function subtract3(a: [number, number, number], b: [number, number, number]): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function average3(points: Array<[number, number, number]>): [number, number, number] {
  return points.reduce<[number, number, number]>((sum, point) => [
    sum[0] + point[0] / points.length,
    sum[1] + point[1] / points.length,
    sum[2] + point[2] / points.length,
  ], [0, 0, 0]);
}

function lookRotationMatrix(forwardInput: [number, number, number], upInput: [number, number, number]): Matrix3 {
  const forward = normalize3(forwardInput);
  let right = normalize3(cross3(upInput, forward));
  if (Math.hypot(right[0], right[1], right[2]) < 1e-6) {
    right = normalize3(cross3([0, 1, 0], forward));
  }
  const up = cross3(forward, right);
  return [
    right[0], up[0], forward[0],
    right[1], up[1], forward[1],
    right[2], up[2], forward[2],
  ];
}

function signedPermutationMatrices(detFilter?: 1 | -1) {
  const permutations = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  const signs = [-1, 1];
  const matrices: Matrix3[] = [];
  permutations.forEach((permutation) => {
    signs.forEach((sx) => signs.forEach((sy) => signs.forEach((sz) => {
      const matrix: Matrix3 = [0, 0, 0, 0, 0, 0, 0, 0, 0];
      [sx, sy, sz].forEach((sign, row) => {
        matrix[row * 3 + permutation[row]] = sign;
      });
      if (detFilter === undefined || Math.round(determinant3(matrix)) === detFilter) {
        matrices.push(matrix);
      }
    })));
  });
  return matrices;
}

function tetrahedronFaces(): Array<Array<[number, number, number]>> {
  const x = 1 / (2 * Math.sqrt(2));
  const y = -x;
  const a: [number, number, number] = [x, x, x];
  const b: [number, number, number] = [y, y, x];
  const c: [number, number, number] = [y, x, y];
  const d: [number, number, number] = [x, y, y];
  return [[a, b, c], [a, b, d], [a, c, d], [b, c, d]];
}

function octahedronFaces(): Array<Array<[number, number, number]>> {
  const x = 1 / Math.sqrt(2);
  const y = -x;
  const a: [number, number, number] = [x, 0, 0];
  const b: [number, number, number] = [0, x, 0];
  const c: [number, number, number] = [0, 0, x];
  const d: [number, number, number] = [y, 0, 0];
  const e: [number, number, number] = [0, y, 0];
  const f: [number, number, number] = [0, 0, y];
  return [[b, a, c], [b, a, f], [b, c, d], [b, d, f], [e, f, d], [e, f, a], [e, c, a], [e, c, d]];
}

function icosahedronFaces(): Array<Array<[number, number, number]>> {
  const phi = (1 + Math.sqrt(5)) / 2;
  const vertices: Array<[number, number, number]> = [
    [-1, phi, 0], [1, phi, 0], [-1, -phi, 0], [1, -phi, 0],
    [0, -1, phi], [0, 1, phi], [0, -1, -phi], [0, 1, -phi],
    [phi, 0, -1], [phi, 0, 1], [-phi, 0, -1], [-phi, 0, 1],
  ];
  const faces = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1],
  ];
  return faces.map((face) => face.map((index) => normalize3(vertices[index])));
}

function matricesForPolyhedron(faces: Array<Array<[number, number, number]>>) {
  return faces.flatMap((face) => {
    const centroid = normalize3(average3(face));
    return face.map((vertex) => lookRotationMatrix(subtract3(vertex, centroid), centroid));
  });
}

function makePointGroupMatrices(group: PointGroupSymmetry, orderInput: number): Matrix3[] {
  const order = Math.max(1, orderInput);
  const angle = (Math.PI * 2) / order;
  const rotations = Array.from({ length: group === 'Sn' ? order * 2 : order }, (_, index) => rotationY(group === 'Sn' ? (angle / 2) * index : angle * index));
  const horizontal = scaleMatrix3(-1, 1, 1);
  const vertical = scaleMatrix3(1, -1, 1);

  if (group === 'Cn') return rotations;
  if (group === 'Cnv') return [...rotations, ...rotations.map((matrix) => multiplyMatrix3(horizontal, matrix))];
  if (group === 'Cnh') return [...rotations, ...rotations.map((matrix) => multiplyMatrix3(vertical, matrix))];
  if (group === 'Sn') return rotations.map((matrix, index) => index % 2 === 0 ? matrix : multiplyMatrix3(vertical, matrix));
  if (group === 'Dn') return [...rotations, ...rotations.map((matrix) => multiplyMatrix3(rotationZ(Math.PI), matrix))];
  if (group === 'Dnh') {
    const base = [...rotations, ...rotations.map((matrix) => multiplyMatrix3(horizontal, matrix))];
    return [...base, ...base.map((matrix) => multiplyMatrix3(vertical, matrix))];
  }
  if (group === 'Dnd') {
    const base = [...rotations, ...rotations.map((matrix) => multiplyMatrix3(horizontal, matrix))];
    return [...base, ...base.map((matrix) => multiplyMatrix3(rotationY(angle / 2), multiplyMatrix3(vertical, matrix)))];
  }
  if (group === 'T') return matricesForPolyhedron(tetrahedronFaces());
  if (group === 'Th' || group === 'Td') {
    const tetra = matricesForPolyhedron(tetrahedronFaces());
    return [...tetra, ...tetra.map((matrix) => multiplyMatrix3(horizontal, matrix))];
  }
  if (group === 'O') return signedPermutationMatrices(1);
  if (group === 'Oh') return signedPermutationMatrices();
  if (group === 'I') return matricesForPolyhedron(icosahedronFaces());
  return [...matricesForPolyhedron(icosahedronFaces()), ...matricesForPolyhedron(icosahedronFaces()).map((matrix) => multiplyMatrix3(horizontal, matrix))];
}

function multiplyMatrix(a: Matrix2, b: Matrix2): Matrix2 {
  return [
    a[0] * b[0] + a[1] * b[2],
    a[0] * b[1] + a[1] * b[3],
    a[2] * b[0] + a[3] * b[2],
    a[2] * b[1] + a[3] * b[3],
  ];
}

function multiplyAffine(a: AffineTransform, b: AffineTransform): AffineTransform {
  return {
    matrix: multiplyMatrix(a.matrix, b.matrix),
    tx: a.matrix[0] * b.tx + a.matrix[1] * b.ty + a.tx,
    ty: a.matrix[2] * b.tx + a.matrix[3] * b.ty + a.ty,
  };
}

function translate(tx: number, ty: number): AffineTransform {
  return { matrix: IDENTITY_MATRIX, tx, ty };
}

function rotateAround(rotation: number, cx: number, cy: number): AffineTransform {
  const matrix = matrixFromRotation(rotation);
  return {
    matrix,
    tx: cx - (matrix[0] * cx + matrix[1] * cy),
    ty: cy - (matrix[2] * cx + matrix[3] * cy),
  };
}

function reflectLine(a: [number, number], b: [number, number]): AffineTransform {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) {
    return { matrix: [-1, 0, 0, 1], tx: 2 * a[0], ty: 0 };
  }

  const ux = dx / length;
  const uy = dy / length;
  const matrix: Matrix2 = [
    2 * ux * ux - 1,
    2 * ux * uy,
    2 * ux * uy,
    2 * uy * uy - 1,
  ];
  return {
    matrix,
    tx: a[0] - (matrix[0] * a[0] + matrix[1] * a[1]),
    ty: a[1] - (matrix[2] * a[0] + matrix[3] * a[1]),
  };
}

function addOffset(points: Array<[number, number]>, offsetX: number, offsetY: number): Array<[number, number]> {
  return points.map(([x, y]) => [x + offsetX, y + offsetY]);
}

function rectangle(dx: number, dy: number, offsetX: number, offsetY: number) {
  return addOffset([[0, 0], [dx, 0], [dx, dy], [0, dy]], offsetX, offsetY);
}

function parallelogram(d1x: number, d2x: number, d1y: number, d2y: number, offsetX: number, offsetY: number) {
  return addOffset([[0, 0], [d1x, d1y], [d1x + d2x, d1y + d2y], [d2x, d2y]], offsetX, offsetY);
}

function squareRegion(d1x: number, d2x: number, d1y: number, d2y: number, offsetX: number, offsetY: number) {
  return addOffset([[0, 0], [d1x / 2, d1y / 2], [(d1x + d2x) / 2, (d1y + d2y) / 2], [d2x / 2, d2y / 2]], offsetX, offsetY);
}

function rhombus(hexSize: number, offsetX: number, offsetY: number) {
  return addOffset([[0, 0], [hexSize / 4, -hexSize * Math.sqrt(3) / 4], [hexSize / 2, 0], [hexSize / 4, hexSize * Math.sqrt(3) / 4]], offsetX, offsetY);
}

function kite(hexSize: number, offsetX: number, offsetY: number) {
  return addOffset([[0, 0], [3 * hexSize / 8, hexSize * Math.sqrt(3) / 8], [hexSize / 4, hexSize * Math.sqrt(3) / 4], [0, hexSize * Math.sqrt(3) / 4]], offsetX, offsetY);
}

function equilateralTri(hexSize: number, offsetX: number, offsetY: number) {
  return addOffset([[0, 0], [hexSize / 2, 0], [hexSize / 4, hexSize * Math.sqrt(3) / 4]], offsetX, offsetY);
}

function rightAngleTri(d1x: number, d2x: number, d1y: number, d2y: number, offsetX: number, offsetY: number) {
  return addOffset([[0, 0], [(d1x + d2x) / 2, (d1y + d2y) / 2], [d2x / 2, d2y / 2]], offsetX, offsetY);
}

function halfKite(hexSize: number, offsetX: number, offsetY: number) {
  return addOffset([[0, 0], [hexSize / 4, hexSize * Math.sqrt(3) / 4], [0, hexSize * Math.sqrt(3) / 4]], offsetX, offsetY);
}

function halfRhombus(baseSize: number, offsetX: number, offsetY: number) {
  return addOffset([[0, 0], [baseSize, 0], [baseSize / 2, baseSize * Math.sqrt(3) / 6]], offsetX, offsetY);
}

function buildWallpaperGeometry(group: WallpaperSymmetry, width: number, height: number, skewX: number, skewY: number): WallpaperGeometry {
  let fundamentalRegion: Array<[number, number]> = [];
  let translationX: [number, number] = [width, 0];
  let translationY: [number, number] = [0, height];
  let reps: AffineTransform[] = [{ matrix: IDENTITY_MATRIX, tx: 0, ty: 0 }];
  const tileSize = { x: width, y: height };
  const addIdentity = (cosetReps: AffineTransform[]) => {
    reps = [{ matrix: IDENTITY_MATRIX, tx: 0, ty: 0 }, ...cosetReps];
  };

  if (group === 'p1' || group === 'p2') {
    const d1x = width;
    const d1y = skewY;
    const d2x = skewX;
    const d2y = height;
    const offsetX = tileSize.x / 2 - (d1x + d2x) / 2;
    const offsetY = tileSize.y / 2 - (d1y + d2y) / 2;
    fundamentalRegion = parallelogram(d1x, d2x, d1y, d2y, offsetX, offsetY);

    if (group === 'p1') {
      translationX = [d1x, d2x];
      translationY = [d1y, d2y];
      addIdentity([]);
    } else {
      const center = { x: d1x / 2 + offsetX, y: d1y / 2 + offsetY };
      translationX = [d1x, d2x * 2];
      translationY = [d1y, d2y * 2];
      addIdentity([rotateAround(Math.PI, center.x, center.y)]);
    }
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'p3' || group === 'p6' || group === 'p3m1' || group === 'p6m') {
    const hexSize = width;
    const d1x = 3 * hexSize / 4;
    const d1y = hexSize * Math.sqrt(3) / 4;
    const d2x = d1x;
    const d2y = -d1y;
    const offsetX = tileSize.x / 2;
    const offsetY = tileSize.y / 2;
    const center = { x: tileSize.x / 2, y: tileSize.y / 2 };
    translationX = [d1x, d2x];
    translationY = [d1y, d2y];

    if (group === 'p3') {
      fundamentalRegion = rhombus(hexSize, offsetX, offsetY);
      addIdentity([rotateAround((2 * Math.PI) / 3, center.x, center.y), rotateAround((4 * Math.PI) / 3, center.x, center.y)]);
    } else if (group === 'p6') {
      fundamentalRegion = kite(hexSize, offsetX, offsetY);
      addIdentity(Array.from({ length: 5 }, (_, index) => rotateAround(((index + 1) * Math.PI) / 3, center.x, center.y)));
    } else if (group === 'p3m1') {
      fundamentalRegion = equilateralTri(hexSize, offsetX, offsetY);
      const r120 = rotateAround((2 * Math.PI) / 3, center.x, center.y);
      const r240 = rotateAround((4 * Math.PI) / 3, center.x, center.y);
      const mirror = reflectLine(fundamentalRegion[2], fundamentalRegion[0]);
      addIdentity([r120, r240, mirror, multiplyAffine(r120, mirror), multiplyAffine(r240, mirror)]);
    } else {
      fundamentalRegion = halfKite(hexSize, offsetX, offsetY);
      const rotations = Array.from({ length: 5 }, (_, index) => rotateAround(((index + 1) * Math.PI) / 3, center.x, center.y));
      const mirror = reflectLine(fundamentalRegion[0], fundamentalRegion[2]);
      addIdentity([...rotations, mirror, ...rotations.map((rotation) => multiplyAffine(rotation, mirror))]);
    }
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'p4' || group === 'p4m') {
    const squareSize = width;
    const d1x = squareSize;
    const d1y = 0;
    const d2x = 0;
    const d2y = squareSize;
    const offsetX = tileSize.x / 2;
    const offsetY = tileSize.y / 2;
    const center = { x: tileSize.x / 2, y: tileSize.y / 2 };
    translationX = [d1x, d2x];
    translationY = [d1y, d2y];

    if (group === 'p4') {
      fundamentalRegion = squareRegion(d1x, d2x, d1y, d2y, offsetX, offsetY);
      addIdentity([rotateAround(Math.PI / 2, center.x, center.y), rotateAround(Math.PI, center.x, center.y), rotateAround((3 * Math.PI) / 2, center.x, center.y)]);
    } else {
      fundamentalRegion = rightAngleTri(d1x, d2x, d1y, d2y, offsetX, offsetY);
      const rotations = [rotateAround(Math.PI / 2, center.x, center.y), rotateAround(Math.PI, center.x, center.y), rotateAround((3 * Math.PI) / 2, center.x, center.y)];
      const mirror = multiplyAffine(translate(0, -squareSize), reflectLine(fundamentalRegion[1], fundamentalRegion[2]));
      addIdentity([...rotations, mirror, ...rotations.map((rotation) => multiplyAffine(rotation, mirror))]);
    }
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'pm') {
    const dx = width;
    const dy = height;
    const offsetX = tileSize.x / 2 - dx / 4;
    const offsetY = tileSize.y / 2 - dy / 2;
    fundamentalRegion = rectangle(dx / 2, dy, offsetX, offsetY);
    translationX = [dx, 0];
    translationY = [0, dy];
    addIdentity([reflectLine(fundamentalRegion[0], fundamentalRegion[3])]);
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'pg') {
    const dx = width;
    const dy = height;
    const offsetX = tileSize.x / 2 - dx / 2;
    const offsetY = tileSize.y / 2 - dy / 2;
    fundamentalRegion = rectangle(dx, dy, offsetX, offsetY);
    translationX = [dx, 0];
    translationY = [0, 2 * dy];
    const mirror = reflectLine([dx / 2 + offsetX, offsetY], [dx / 2 + offsetX, dy + offsetY]);
    addIdentity([multiplyAffine(translate(0, dy), mirror)]);
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'cm') {
    const dx = width;
    const dy = height;
    const offsetX = tileSize.x / 2 - dx / 2;
    const offsetY = tileSize.y / 2 - dy / 2;
    fundamentalRegion = rectangle(dx, dy, offsetX, offsetY);
    translationX = [dx, dx];
    translationY = [dy, -dy];
    addIdentity([reflectLine(fundamentalRegion[0], fundamentalRegion[3])]);
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'pmm') {
    const dx = width;
    const dy = height;
    const offsetX = tileSize.x / 2 - dx / 4;
    const offsetY = tileSize.y / 2 - dy / 4;
    fundamentalRegion = rectangle(dx / 2, dy / 2, offsetX, offsetY);
    translationX = [dx, 0];
    translationY = [0, dy];
    addIdentity([
      reflectLine(fundamentalRegion[0], fundamentalRegion[1]),
      reflectLine(fundamentalRegion[0], fundamentalRegion[3]),
      rotateAround(Math.PI, offsetX, offsetY),
    ]);
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'pmg' || group === 'pgg') {
    const dx = width;
    const dy = height;
    const offsetX = tileSize.x / 2 - dx / 2;
    const offsetY = tileSize.y / 2 - dy / 2;
    fundamentalRegion = rectangle(dx, dy, offsetX, offsetY);
    translationX = [2 * dx, 0];
    translationY = [0, 2 * dy];
    const mirror = reflectLine(fundamentalRegion[1], fundamentalRegion[2]);
    const first = group === 'pgg' ? multiplyAffine(translate(0, dy), mirror) : mirror;
    const rotate = rotateAround(Math.PI, dx / 2 + offsetX, offsetY);
    const third = group === 'pgg'
      ? multiplyAffine(translate(-2 * dx, 0), multiplyAffine(first, rotate))
      : multiplyAffine(first, rotate);
    addIdentity([first, rotate, third]);
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'cmm') {
    const dx = width;
    const dy = height;
    const offsetX = tileSize.x / 2 - dx / 2;
    const offsetY = tileSize.y / 2 - dy / 2;
    fundamentalRegion = rectangle(dx, dy, offsetX, offsetY);
    translationX = [dx, dx];
    translationY = [dy, -dy];
    const mirror = reflectLine(fundamentalRegion[0], fundamentalRegion[1]);
    const rotate = rotateAround(Math.PI, dx / 2 + offsetX, offsetY);
    addIdentity([mirror, rotate, multiplyAffine(rotate, mirror)]);
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'p31m') {
    const baseSize = width;
    const offsetX = tileSize.x / 2 - baseSize / 2;
    const offsetY = tileSize.y / 2;
    fundamentalRegion = halfRhombus(baseSize, offsetX, offsetY);
    const center = { x: 3 * baseSize / 4 + offsetX, y: baseSize * Math.sqrt(3) / 4 + offsetY };
    translationX = [baseSize, baseSize / 2];
    translationY = [0, baseSize * Math.sqrt(3) / 2];
    const r120 = rotateAround((2 * Math.PI) / 3, fundamentalRegion[2][0], fundamentalRegion[2][1]);
    const r240 = rotateAround((4 * Math.PI) / 3, fundamentalRegion[2][0], fundamentalRegion[2][1]);
    const mirror = reflectLine(fundamentalRegion[1], [center.x, center.y]);
    addIdentity([r120, r240, mirror, multiplyAffine(mirror, r120), multiplyAffine(mirror, r240)]);
    return { fundamentalRegion, translationX, translationY, reps };
  }

  if (group === 'p4g') {
    const squareSize = width;
    const offsetX = tileSize.x / 2 - squareSize / 2;
    const offsetY = tileSize.y / 2 - squareSize / 2;
    fundamentalRegion = rectangle(squareSize, squareSize, offsetX, offsetY);
    const center = { x: offsetX, y: offsetY };
    translationX = [2 * squareSize, 2 * squareSize];
    translationY = [2 * squareSize, -2 * squareSize];
    const rotations = [rotateAround(Math.PI / 2, center.x, center.y), rotateAround(Math.PI, center.x, center.y), rotateAround((3 * Math.PI) / 2, center.x, center.y)];
    const mirror = reflectLine(fundamentalRegion[2], fundamentalRegion[3]);
    addIdentity([...rotations, mirror, ...rotations.map((rotation) => multiplyAffine(mirror, rotation))]);
    return { fundamentalRegion, translationX, translationY, reps };
  }

  return { fundamentalRegion, translationX, translationY, reps };
}

function getPolygonCentroid(points: Array<[number, number]>) {
  let twiceArea = 0;
  let cx = 0;
  let cy = 0;

  for (let index = 0; index < points.length; index++) {
    const current = points[index];
    const next = points[(index + 1) % points.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    cx += (current[0] + next[0]) * cross;
    cy += (current[1] + next[1]) * cross;
  }

  if (Math.abs(twiceArea) < 1e-8) {
    return points.reduce(
      (sum, point) => ({ x: sum.x + point[0] / points.length, y: sum.y + point[1] / points.length }),
      { x: 0, y: 0 },
    );
  }

  return {
    x: cx / (3 * twiceArea),
    y: cy / (3 * twiceArea),
  };
}

function transformPoint(transform: AffineTransform, point: { x: number; y: number }) {
  return {
    x: transform.matrix[0] * point.x + transform.matrix[1] * point.y + transform.tx,
    y: transform.matrix[2] * point.x + transform.matrix[3] * point.y + transform.ty,
  };
}

function isPointInPolygon(point: { x: number; y: number }, polygon: Array<[number, number]>) {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i][0];
    const yi = polygon[i][1];
    const xj = polygon[j][0];
    const yj = polygon[j][1];
    const intersects = ((yi > point.y) !== (yj > point.y))
      && point.x < ((xj - xi) * (point.y - yi)) / (yj - yi + 1e-12) + xi;
    if (intersects) inside = !inside;
  }
  return inside;
}

function distanceToLine(point: { x: number; y: number }, a: [number, number], b: [number, number]) {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const length = Math.hypot(dx, dy);
  if (length < 1e-8) return Infinity;
  return Math.abs(dy * point.x - dx * point.y + b[0] * a[1] - b[1] * a[0]) / length;
}

function getPolygonInteriorRadius(points: Array<[number, number]>, center: { x: number; y: number }) {
  return points.reduce((radius, point, index) => {
    const next = points[(index + 1) % points.length];
    return Math.min(radius, distanceToLine(center, point, next));
  }, Infinity);
}

function getMinTransformedPointDistance(point: { x: number; y: number }, transforms: AffineTransform[]) {
  let minDistance = Infinity;
  const transformed = transforms.map((transform) => transformPoint(transform, point));
  for (let i = 0; i < transformed.length; i++) {
    for (let j = i + 1; j < transformed.length; j++) {
      minDistance = Math.min(minDistance, Math.hypot(transformed[i].x - transformed[j].x, transformed[i].y - transformed[j].y));
    }
  }
  return transformed.length <= 1 ? Infinity : minDistance;
}

function chooseWallpaperSeedPoint(points: Array<[number, number]>, transforms: AffineTransform[]) {
  const centroid = getPolygonCentroid(points);
  if (transforms.length <= 1) return centroid;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  let bestPoint = centroid;
  let bestScore = -Infinity;
  const samples = 14;
  const candidates = [centroid];

  for (let yStep = 1; yStep < samples; yStep++) {
    for (let xStep = 1; xStep < samples; xStep++) {
      const point = {
        x: minX + ((maxX - minX) * xStep) / samples,
        y: minY + ((maxY - minY) * yStep) / samples,
      };
      if (isPointInPolygon(point, points)) {
        candidates.push(point);
      }
    }
  }

  const candidateRadii = candidates.map((point) => getPolygonInteriorRadius(points, point));
  const maxInteriorRadius = candidateRadii.reduce((maxRadius, radius) => (
    Number.isFinite(radius) ? Math.max(maxRadius, radius) : maxRadius
  ), 0);
  const minimumOrbitDistance = maxInteriorRadius * 0.65;

  candidates.forEach((point) => {
    const interiorRadius = getPolygonInteriorRadius(points, point);
    if (!Number.isFinite(interiorRadius) || interiorRadius <= 1e-6) return;
    const orbitDistance = getMinTransformedPointDistance(point, transforms);
    if (Number.isFinite(orbitDistance) && orbitDistance < minimumOrbitDistance) return;
    const centroidDistance = Math.hypot(point.x - centroid.x, point.y - centroid.y);
    const score = interiorRadius - centroidDistance * 0.2 + Math.min(Number.isFinite(orbitDistance) ? orbitDistance : 0, maxInteriorRadius) * 0.05;
    if (score > bestScore) {
      bestScore = score;
      bestPoint = point;
    }
  });

  return bestPoint;
}

function getCanonicalWallpaperSeed(group: WallpaperSymmetry, points: Array<[number, number]>) {
  if (group !== 'cmm') return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  points.forEach(([x, y]) => {
    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x);
    maxY = Math.max(maxY, y);
  });

  return {
    x: minX + (maxX - minX) * 0.75,
    y: minY + (maxY - minY) * 0.25,
  };
}

function getPercentile(values: number[], percentile: number) {
  if (values.length === 0) return 1;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * percentile)));
  return sorted[index];
}

function getRobustProjectedRadius(mesh: Mesh, originX: number, originY: number) {
  const distances: number[] = [];
  for (let index = 0; index < mesh.vertices.length; index += 3) {
    distances.push(Math.hypot(mesh.vertices[index] - originX, mesh.vertices[index + 1] - originY));
  }
  return Math.max(getPercentile(distances, 0.75), 1e-6);
}

function getSourcePlaneBounds(vertices: number[], plane: WallpaperPlane) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let index = 0; index < vertices.length; index += 3) {
    const { u, v, w } = getWallpaperPlaneComponents(vertices, index, plane);
    min[0] = Math.min(min[0], u);
    min[1] = Math.min(min[1], v);
    min[2] = Math.min(min[2], w);
    max[0] = Math.max(max[0], u);
    max[1] = Math.max(max[1], v);
    max[2] = Math.max(max[2], w);
  }
  return { min, max };
}

function getSourceFootprint(mesh: Mesh, originX: number, originY: number, plane: WallpaperPlane): Array<[number, number]> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < mesh.vertices.length; index += 3) {
    const { u, v } = getWallpaperPlaneComponents(mesh.vertices, index, plane);
    minX = Math.min(minX, u - originX);
    minY = Math.min(minY, v - originY);
    maxX = Math.max(maxX, u - originX);
    maxY = Math.max(maxY, v - originY);
  }

  return [[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY]];
}

function getWallpaperOrbitTransforms(geometry: WallpaperGeometry, spacingX: number, spacingY: number) {
  const transforms: AffineTransform[] = [];
  for (let y = -1; y <= 1; y++) {
    for (let x = -1; x <= 1; x++) {
      const tx = x * geometry.translationX[0] * spacingX + y * geometry.translationX[1] * spacingX;
      const ty = x * geometry.translationY[0] * spacingY + y * geometry.translationY[1] * spacingY;
      geometry.reps.forEach((transform) => {
        transforms.push({ matrix: transform.matrix, tx: transform.tx + tx, ty: transform.ty + ty });
      });
    }
  }
  return transforms;
}

function makeWallpaperFootprintPolygon(footprint: Array<[number, number]>, transform: AffineTransform, seed: { x: number; y: number }, scale: number) {
  return footprint.map(([x, y]) => transformPoint(transform, {
    x: seed.x + x * scale,
    y: seed.y + y * scale,
  }));
}

function projectPolygon(points: Array<{ x: number; y: number }>, axis: { x: number; y: number }) {
  let min = Infinity;
  let max = -Infinity;
  points.forEach((point) => {
    const value = point.x * axis.x + point.y * axis.y;
    min = Math.min(min, value);
    max = Math.max(max, value);
  });
  return { min, max };
}

function polygonsOverlap(a: Array<{ x: number; y: number }>, b: Array<{ x: number; y: number }>) {
  for (const polygon of [a, b]) {
    for (let index = 0; index < polygon.length; index++) {
      const current = polygon[index];
      const next = polygon[(index + 1) % polygon.length];
      const edgeX = next.x - current.x;
      const edgeY = next.y - current.y;
      const length = Math.hypot(edgeX, edgeY);
      if (length < 1e-8) continue;
      const axis = { x: -edgeY / length, y: edgeX / length };
      const projectedA = projectPolygon(a, axis);
      const projectedB = projectPolygon(b, axis);
      if (Math.min(projectedA.max, projectedB.max) - Math.max(projectedA.min, projectedB.min) <= 1e-5) {
        return false;
      }
    }
  }
  return true;
}

function hasWallpaperFootprintOverlap(footprint: Array<[number, number]>, transforms: AffineTransform[], seed: { x: number; y: number }, scale: number) {
  const polygons = transforms.map((transform) => makeWallpaperFootprintPolygon(footprint, transform, seed, scale));
  for (let aIndex = 0; aIndex < polygons.length; aIndex++) {
    for (let bIndex = aIndex + 1; bIndex < polygons.length; bIndex++) {
      if (polygonsOverlap(polygons[aIndex], polygons[bIndex])) return true;
    }
  }
  return false;
}

function getWallpaperAutoScale(mesh: Mesh, geometry: WallpaperGeometry, seed: { x: number; y: number }, originX: number, originY: number, spacingX: number, spacingY: number, plane: WallpaperPlane) {
  const footprint = getSourceFootprint(mesh, originX, originY, plane);
  const orbitTransforms = getWallpaperOrbitTransforms(geometry, spacingX, spacingY);
  return getMaxNonOverlappingScale(footprint, orbitTransforms, seed);
}

function getPointGroupAutoScale(mesh: Mesh, orbitTransforms: AffineTransform[], seed: { x: number; y: number }, originX: number, originY: number, plane: WallpaperPlane) {
  const footprint = getSourceFootprint(mesh, originX, originY, plane);
  return getMaxNonOverlappingScale(footprint, orbitTransforms, seed);
}

function getMaxNonOverlappingScale(footprint: Array<[number, number]>, orbitTransforms: AffineTransform[], seed: { x: number; y: number }) {
  let low = 0.01;
  let high = 1;

  while (!hasWallpaperFootprintOverlap(footprint, orbitTransforms, seed, high) && high < 8) {
    low = high;
    high *= 1.5;
  }

  for (let iteration = 0; iteration < 18; iteration++) {
    const mid = (low + high) / 2;
    if (hasWallpaperFootprintOverlap(footprint, orbitTransforms, seed, mid)) {
      high = mid;
    } else {
      low = mid;
    }
  }

  return low * 0.92;
}

function makeWallpaperTransforms(mesh: Mesh, cloner: ClonerStackItem): CloneTransform[] {
  const plane = cloner.wallpaperPlane ?? 'xy';
  const { min, max } = getSourcePlaneBounds(mesh.vertices, plane);
  const sourceWidth = Math.max(max[0] - min[0], 1);
  const sourceHeight = Math.max(max[1] - min[1], 1);
  const width = Math.max(cloner.cellWidth, sourceWidth * 1.05, 0.01);
  const height = Math.max(cloner.cellHeight, sourceHeight * 1.05, 0.01);
  const originX = (min[0] + max[0]) / 2;
  const originY = (min[1] + max[1]) / 2;
  const originZ = (min[2] + max[2]) / 2;
  const xRepeats = Math.min(Math.max(Math.round(cloner.xRepeats), 1), 24);
  const yRepeats = Math.min(Math.max(Math.round(cloner.yRepeats), 1), 24);
  const geometry = buildWallpaperGeometry(cloner.wallpaperGroup, width, height, cloner.skewX, cloner.skewY);
  const tile = geometry.fundamentalRegion;
  const tileSeed = getCanonicalWallpaperSeed(cloner.wallpaperGroup, tile) ?? chooseWallpaperSeedPoint(tile, geometry.reps);
  const autoScale = getWallpaperAutoScale(mesh, geometry, tileSeed, originX, originY, cloner.spacingX, cloner.spacingY, plane);
  const useAutoFit = cloner.wallpaperAutoFit;
  const unitOffsetX = useAutoFit
    ? tileSeed.x
    : cloner.unitOffsetX;
  const unitOffsetY = useAutoFit
    ? tileSeed.y
    : cloner.unitOffsetY;
  const unitScale = cloner.unitScale * (useAutoFit ? autoScale : 1);
  const transforms: CloneTransform[] = [];

  for (let y = 0; y < yRepeats; y++) {
    for (let x = 0; x < xRepeats; x++) {
      const tx = x * geometry.translationX[0] * cloner.spacingX + y * geometry.translationX[1] * cloner.spacingX;
      const ty = x * geometry.translationY[0] * cloner.spacingY + y * geometry.translationY[1] * cloner.spacingY;
      for (const transform of geometry.reps) {
        transforms.push({
          rotation: 0,
          matrix: transform.matrix,
          tx: tx + transform.tx,
          ty: ty + transform.ty,
          originX,
          originY,
          originZ,
          scale: unitScale,
          unitOffsetX,
          unitOffsetY,
          wallpaperPlane: plane,
        });
      }
    }
  }

  return transforms;
}

function makeArrayTransforms(mesh: Mesh, cloner: ClonerStackItem): CloneTransform[] {
  const { min, max } = getMeshBounds(mesh.vertices);
  const center: [number, number, number] = [
    (min[0] + max[0]) / 2,
    (min[1] + max[1]) / 2,
    (min[2] + max[2]) / 2,
  ];

  const clampCount = (value: number) => Math.min(Math.max(Math.round(value), 1), 16);
  const countX = clampCount(cloner.arrayCountX);
  const countY = clampCount(cloner.arrayCountY);
  const countZ = clampCount(cloner.arrayCountZ);

  const toRadians = Math.PI / 180;
  const stepRotationX = cloner.arrayRotateX * toRadians;
  const stepRotationY = cloner.arrayRotateY * toRadians;
  const stepRotationZ = cloner.arrayRotateZ * toRadians;
  const stepScale = cloner.arrayScale;

  // Each dimension advances along its own world axis by the matching translate
  // component, so the X/Y/Z sliders are independent grid spacings in every mode.
  const stepX = cloner.arrayTranslateX;
  const stepY = cloner.arrayTranslateY;
  const stepZ = cloner.arrayTranslateZ;

  const MAX_COPIES = 4096;
  const transforms: CloneTransform[] = [];
  for (let k = 0; k < countZ && transforms.length < MAX_COPIES; k++) {
    for (let j = 0; j < countY && transforms.length < MAX_COPIES; j++) {
      for (let i = 0; i < countX && transforms.length < MAX_COPIES; i++) {
        const step = i + j + k;
        const rotation = step === 0
          ? IDENTITY_MATRIX_3
          : multiplyMatrix3(
              rotationZ(stepRotationZ * step),
              multiplyMatrix3(rotationY(stepRotationY * step), rotationX(stepRotationX * step)),
            );
        const scale = Math.pow(stepScale, step);
        const m = rotation.map((value) => value * scale) as Matrix3;
        const offsetX = i * stepX;
        const offsetY = j * stepY;
        const offsetZ = k * stepZ;
        // Rotate/scale about the source centre, then place at the grid offset.
        const rotatedCenter = transform3(m, center);
        transforms.push({
          rotation: 0,
          tx: 0,
          ty: 0,
          affine3: {
            m,
            t: [
              center[0] + offsetX - rotatedCenter[0],
              center[1] + offsetY - rotatedCenter[1],
              center[2] + offsetZ - rotatedCenter[2],
            ],
          },
        });
      }
    }
  }

  return transforms;
}

export function applyCloner(mesh: Mesh, cloner: ClonerStackItem): Mesh {
  const transforms = cloner.mode === 'point'
    ? makePointGroupTransforms(mesh, cloner)
    : cloner.mode === 'array'
      ? makeArrayTransforms(mesh, cloner)
      : makeWallpaperTransforms(mesh, cloner);
  if (transforms.length <= 1) return cloneMesh(mesh);

  const next: Mesh = { vertices: [], faces: [], faceValues: [], roleValues: [] };
  transforms.forEach((transform) => pushTransformedMeshCopy(mesh, next, transform));

  if (!mesh.faceValues) delete next.faceValues;
  if (!mesh.roleValues) delete next.roleValues;
  return next;
}
