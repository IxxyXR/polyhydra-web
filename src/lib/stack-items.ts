import { Mesh, OperatorSpec } from './conway-operators';

export type DeformerMode = 'stretch' | 'taper' | 'spherify';
export type DeformerAxis = 'x' | 'y' | 'z';
export type ClonerMode = 'point' | 'wallpaper';
export type PointGroupSymmetry = 'C1' | 'C2' | 'C3' | 'C4' | 'C5' | 'C6' | 'D2' | 'D3' | 'D4' | 'D6' | 'Cinf' | 'Dinf';
export type WallpaperSymmetry = 'p1' | 'p2' | 'pm' | 'pg' | 'cm' | 'pmm' | 'pmg' | 'pgg' | 'cmm' | 'p4' | 'p4m' | 'p4g' | 'p3' | 'p3m1' | 'p31m' | 'p6' | 'p6m';

export const POINT_GROUP_SYMMETRIES: PointGroupSymmetry[] = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'D2', 'D3', 'D4', 'D6', 'Cinf', 'Dinf'];
export const WALLPAPER_SYMMETRIES: WallpaperSymmetry[] = ['p1', 'p2', 'pm', 'pg', 'cm', 'pmm', 'pmg', 'pgg', 'cmm', 'p4', 'p4m', 'p4g', 'p3', 'p3m1', 'p31m', 'p6', 'p6m'];

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
  wallpaperGroup: WallpaperSymmetry;
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
  return group === 'Cinf' || group === 'Dinf';
}

export function getPointGroupBaseOrder(group: PointGroupSymmetry, fallbackCopies: number) {
  if (group === 'Cinf' || group === 'Dinf') {
    return Math.min(Math.max(Math.round(fallbackCopies), 1), 48);
  }
  return Number.parseInt(group.slice(1), 10) || 1;
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
  matrix?: [number, number, number, number];
}

type Matrix2 = [number, number, number, number];

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

function pushTransformedMeshCopy(source: Mesh, target: Mesh, transform: CloneTransform) {
  const vertexOffset = target.vertices.length / 3;
  const cos = Math.cos(transform.rotation);
  const sin = Math.sin(transform.rotation);
  const originX = transform.originX ?? 0;
  const originY = transform.originY ?? 0;
  const originZ = transform.originZ ?? 0;
  const scale = transform.scale ?? 1;
  const unitOffsetX = transform.unitOffsetX ?? 0;
  const unitOffsetY = transform.unitOffsetY ?? 0;
  const matrix = transform.matrix;
  const determinant = matrix ? matrix[0] * matrix[3] - matrix[1] * matrix[2] : (transform.mirrorX ? -1 : 1);

  for (let index = 0; index < source.vertices.length; index += 3) {
    const localX = (source.vertices[index] - originX) * scale + unitOffsetX;
    const localY = (source.vertices[index + 1] - originY) * scale + unitOffsetY;
    const localZ = (source.vertices[index + 2] - originZ) * scale + originZ;
    const sx = transform.mirrorX ? -localX : localX;
    const sy = localY;
    target.vertices.push(
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

function makePointGroupTransforms(cloner: ClonerStackItem): CloneTransform[] {
  const order = getPointGroupBaseOrder(cloner.pointGroup, cloner.copies);
  const hasMirror = cloner.pointGroup.startsWith('D');
  const transforms: CloneTransform[] = [];

  for (let copy = 0; copy < order; copy++) {
    const rotation = (copy / order) * Math.PI * 2;
    transforms.push({
      rotation,
      tx: Math.cos(rotation) * cloner.radius,
      ty: Math.sin(rotation) * cloner.radius,
    });
    if (hasMirror) {
      transforms.push({
        rotation,
        mirrorX: true,
        tx: Math.cos(rotation) * cloner.radius,
        ty: Math.sin(rotation) * cloner.radius,
      });
    }
  }

  return transforms;
}

function matrixFromRotation(rotation: number): Matrix2 {
  return [
    Math.cos(rotation),
    -Math.sin(rotation),
    Math.sin(rotation),
    Math.cos(rotation),
  ];
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

function getSourceFootprint(mesh: Mesh, originX: number, originY: number): Array<[number, number]> {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let index = 0; index < mesh.vertices.length; index += 3) {
    minX = Math.min(minX, mesh.vertices[index] - originX);
    minY = Math.min(minY, mesh.vertices[index + 1] - originY);
    maxX = Math.max(maxX, mesh.vertices[index] - originX);
    maxY = Math.max(maxY, mesh.vertices[index + 1] - originY);
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

function getWallpaperAutoScale(mesh: Mesh, geometry: WallpaperGeometry, seed: { x: number; y: number }, originX: number, originY: number, spacingX: number, spacingY: number) {
  const footprint = getSourceFootprint(mesh, originX, originY);
  const orbitTransforms = getWallpaperOrbitTransforms(geometry, spacingX, spacingY);
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
  const { min, max } = getMeshBounds(mesh.vertices);
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
  const autoScale = getWallpaperAutoScale(mesh, geometry, tileSeed, originX, originY, cloner.spacingX, cloner.spacingY);
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
        });
      }
    }
  }

  return transforms;
}

export function applyCloner(mesh: Mesh, cloner: ClonerStackItem): Mesh {
  const transforms = cloner.mode === 'point'
    ? makePointGroupTransforms(cloner)
    : makeWallpaperTransforms(mesh, cloner);
  if (transforms.length <= 1) return cloneMesh(mesh);

  const next: Mesh = { vertices: [], faces: [], faceValues: [], roleValues: [] };
  transforms.forEach((transform) => pushTransformedMeshCopy(mesh, next, transform));

  if (!mesh.faceValues) delete next.faceValues;
  if (!mesh.roleValues) delete next.roleValues;
  return next;
}
