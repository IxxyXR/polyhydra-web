import { applyOperator, Mesh, OperatorSpec, RoleShapeBasis } from './conway-operators';
import { finalizeMesh } from './mesh-finalization';
import { buildRadialSolid, RadialBuildOptions, RadialPolyType } from './radial-solids';
import { applyCloner, applyDeformer, isClonerStackItem, isDeformerStackItem, isOperatorStackItem, StackItem } from './stack-items';
import { TilingGenerationOptions, UNIFORM_TILINGS } from './tiling-geometries';

export interface FinalMeshOptions {
  mode: '2d' | '3d';
  tilingType: string;
  rows: number;
  cols: number;
  operators: Array<OperatorSpec | StackItem>;
  radialType: RadialPolyType;
  radialSides: number;
  radialBuildOptions?: RadialBuildOptions;
  roleGeometryDetail?: number;
  roleShapeBasis?: RoleShapeBasis;
  generationOptions?: TilingGenerationOptions;
}

export function generateFinalMesh({
  mode,
  tilingType,
  rows,
  cols,
  operators,
  radialType,
  radialSides,
  radialBuildOptions,
  roleGeometryDetail,
  roleShapeBasis,
  generationOptions,
}: FinalMeshOptions): Mesh | null {
  let mesh: Mesh;

  if (mode === '3d') {
    const solid = buildRadialSolid(radialType, radialSides, radialBuildOptions);
    mesh = solid;
  } else {
    const tiling = UNIFORM_TILINGS[tilingType];
    if (!tiling) {
      return null;
    }
    mesh = tiling.generate(rows, cols, generationOptions);
  }

  for (const item of operators) {
    if ('kind' in item) {
      if (isOperatorStackItem(item)) {
        mesh = applyOperator(mesh, { ...item, roleGeometryDetail, roleShapeBasis });
        if (item.finalizationAfter && item.finalizationAfter !== 'none') {
          mesh = finalizeMesh(mesh, item.finalizationAfter);
        }
      } else if (isDeformerStackItem(item)) {
        mesh = applyDeformer(mesh, item);
      } else if (isClonerStackItem(item)) {
        mesh = applyCloner(mesh, item);
      }
    } else {
      mesh = applyOperator(mesh, { ...item, roleGeometryDetail, roleShapeBasis });
    }
  }

  return mesh;
}
