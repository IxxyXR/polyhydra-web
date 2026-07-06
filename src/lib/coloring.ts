import { PALETTES, PaletteKey } from './palettes';
import { Mesh } from './conway-operators';

export type ColorMode = 'role' | 'sides' | 'value';

export interface FaceColorOptions {
  roleColorCount?: number;
  sideModulo?: number;
  sideOffset?: number;
}

function getRolePaletteColors(paletteColors: string[], options?: FaceColorOptions): string[] {
  const roleColorCount = Math.min(
    paletteColors.length,
    Math.max(2, Math.round(options?.roleColorCount ?? paletteColors.length)),
  );
  return paletteColors.slice(0, roleColorCount);
}

export function computeFaceColors(
  mesh: Mesh,
  palette: PaletteKey | string[],
  colorMode: ColorMode = 'role',
  options?: FaceColorOptions,
): string[] {
  const paletteColors = Array.isArray(palette) ? palette : PALETTES[palette].colors;

  if (colorMode === 'sides') {
    const sideModulo = Math.min(
      paletteColors.length,
      Math.max(2, Math.round(options?.sideModulo ?? paletteColors.length)),
    );
    const sideOffset = Math.round(options?.sideOffset ?? 0);
    return mesh.faces.map((face) => {
      const colorIndex = ((Math.max(0, face.length - 3) + sideOffset) % sideModulo + sideModulo) % sideModulo;
      return paletteColors[colorIndex % paletteColors.length];
    });
  }

  if (colorMode === 'value' && mesh.faceValues && mesh.faceValues.length === mesh.faces.length) {
    const minValue = Math.min(...mesh.faceValues);
    const maxValue = Math.max(...mesh.faceValues);
    const range = maxValue - minValue;

    return mesh.faceValues.map((value) => {
      const normalized = range < 1e-9 ? 0 : (value - minValue) / range;
      const colorIndex = Math.max(
        0,
        Math.min(
          paletteColors.length - 1,
          Math.floor(normalized * paletteColors.length),
        ),
      );
      return paletteColors[colorIndex];
    });
  }

  if (colorMode === 'role') {
    if (mesh.roleValues && mesh.roleValues.length === mesh.faces.length) {
      const rolePaletteColors = getRolePaletteColors(paletteColors, options);
      return mesh.roleValues.map((idx) => rolePaletteColors[idx % rolePaletteColors.length]);
    }
  }

  // Last-resort role assignment for meshes that do not carry explicit roles.
  // Normal base tilings provide roleValues directly, and Omni-generated meshes
  // assign roleValues from their output n-gon construction signatures.
  const { faces } = mesh;
  const edgeMap = new Map<string, number[]>();

  faces.forEach((face, fIdx) => {
    for (let i = 0; i < face.length; i++) {
      const v1 = face[i];
      const v2 = face[(i + 1) % face.length];
      const key = v1 < v2 ? `${v1},${v2}` : `${v2},${v1}`;
      if (!edgeMap.has(key)) {
        edgeMap.set(key, []);
      }
      edgeMap.get(key)!.push(fIdx);
    }
  });

  const faceAdjacency: number[][] = Array(faces.length).fill(0).map((): number[] => []);

  for (const neighbors of edgeMap.values()) {
    if (neighbors.length === 2) {
      const [f1, f2] = neighbors;
      faceAdjacency[f1].push(f2);
      faceAdjacency[f2].push(f1);
    }
  }

  const faceIndices = Array.from({ length: faces.length }, (_, i) => i);
  faceIndices.sort((a, b) => faceAdjacency[b].length - faceAdjacency[a].length);

  const colorIndices = new Int32Array(faces.length).fill(-1);

  for (const i of faceIndices) {
    const neighbors = faceAdjacency[i];
    const usedColors = new Set<number>();
    for (const n of neighbors) {
      if (colorIndices[n] !== -1) {
        usedColors.add(colorIndices[n]);
      }
    }

    let color = 0;
    while (usedColors.has(color)) color++;
    colorIndices[i] = color;
  }

  const rolePaletteColors = getRolePaletteColors(paletteColors, options);
  return Array.from(colorIndices).map(idx => rolePaletteColors[idx % rolePaletteColors.length]);
}
