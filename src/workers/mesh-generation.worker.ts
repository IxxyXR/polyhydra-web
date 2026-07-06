// Runs the CPU-heavy mesh pipeline off the main thread so the UI stays
// responsive while geometry regenerates. Only plain data crosses the boundary;
// three.js scene objects are built by the caller from these results.
import { generateFinalMesh, FinalMeshOptions } from '../lib/mesh-pipeline';
import { computeFaceColors, ColorMode, FaceColorOptions } from '../lib/coloring';
import { triangulateFaces } from '../lib/tiling-geometries';
import { PaletteKey } from '../lib/palettes';

export interface MeshWorkRequest {
  requestId: number;
  meshOptions: FinalMeshOptions;
  palette: PaletteKey | string[];
  colorMode: ColorMode;
  colorOptions: FaceColorOptions;
}

export interface MeshWorkResult {
  requestId: number;
  /** Null when the options produce no mesh (e.g. unknown tiling type). */
  payload: {
    vertices: number[];
    faces: number[][];
    faceColors: string[];
    /** Fan-triangulation vertex indices per face, matching `faces` order. */
    faceTriangulations: number[][];
    stats: {
      vertexCount: number;
      faceCount: number;
      edgeCount: number;
      colorCount: number;
    };
  } | null;
  error?: string;
}

self.onmessage = (event: MessageEvent<MeshWorkRequest>) => {
  const { requestId, meshOptions, palette, colorMode, colorOptions } = event.data;
  try {
    const mesh = generateFinalMesh(meshOptions);
    if (!mesh) {
      self.postMessage({ requestId, payload: null } satisfies MeshWorkResult);
      return;
    }

    const { vertices, faces } = mesh;
    const faceColors = computeFaceColors(mesh, palette, colorMode, colorOptions);
    const faceTriangulations = faces.map((face) => triangulateFaces([face], vertices));

    const uniqueEdges = new Set<string>();
    faces.forEach((face) => {
      for (let i = 0; i < face.length; i++) {
        const a = face[i];
        const b = face[(i + 1) % face.length];
        uniqueEdges.add(a < b ? `${a},${b}` : `${b},${a}`);
      }
    });

    self.postMessage({
      requestId,
      payload: {
        vertices,
        faces,
        faceColors,
        faceTriangulations,
        stats: {
          vertexCount: vertices.length / 3,
          faceCount: faces.length,
          edgeCount: uniqueEdges.size,
          colorCount: new Set(faceColors).size,
        },
      },
    } satisfies MeshWorkResult);
  } catch (e) {
    self.postMessage({
      requestId,
      payload: null,
      error: e instanceof Error ? e.message : String(e),
    } satisfies MeshWorkResult);
  }
};
