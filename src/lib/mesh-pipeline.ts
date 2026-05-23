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
  roleGeometryDetail?: number;
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
  roleGeometryDetail,
  generationOptions,
  finalization = 'planarize',
}: FinalMeshOptions): Mesh | null {
  let mesh: Mesh;

  if (mode === '3d') {
    const solid = buildRadialSolid(radialType, radialSides);
    mesh = solid;
  } else {
    const tiling = UNIFORM_TILINGS[tilingType];
    if (!tiling) {
      return null;
    }
    mesh = tiling.generate(rows, cols, generationOptions);
  }

  for (const operator of operators) {
    mesh = applyOperator(mesh, { ...operator, roleGeometryDetail });
  }

  if (mode === '3d' && finalization !== 'none') {
    mesh = finalizeMesh(mesh, finalization);
  }

  return mesh;
}
