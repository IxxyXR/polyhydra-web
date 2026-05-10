import { applyOperator, Mesh, OperatorSpec } from './conway-operators';
import { MeshFinalizationMode, finalizeMesh } from './mesh-finalization';
import { buildRadialSolid, RadialPolyType } from './radial-solids';
import { TilingGenerationOptions, UNIFORM_TILINGS } from './tiling-geometries';

export interface FinalMeshOptions {
  mode: '2d' | '3d';
  tilingType: string;
  rows: number;
  cols: number;
  operators: OperatorSpec[];
  radialType: RadialPolyType;
  radialSides: number;
  generationOptions?: TilingGenerationOptions;
  finalization?: MeshFinalizationMode;
}

export function generateFinalMesh({
  mode,
  tilingType,
  rows,
  cols,
  operators,
  radialType,
  radialSides,
  generationOptions,
  finalization = 'planarize',
}: FinalMeshOptions): Mesh | null {
  let vertices: number[];
  let faces: number[][];

  if (mode === '3d') {
    const solid = buildRadialSolid(radialType, radialSides);
    vertices = solid.vertices;
    faces = solid.faces;
  } else {
    const tiling = UNIFORM_TILINGS[tilingType];
    if (!tiling) {
      return null;
    }
    ({ vertices, faces } = tiling.generate(rows, cols, generationOptions));
  }

  let mesh: Mesh = { vertices, faces };
  for (const operator of operators) {
    mesh = applyOperator(mesh, operator);
  }

  if (mode === '3d' && finalization !== 'none') {
    mesh = finalizeMesh(mesh, finalization);
  }

  return mesh;
}
