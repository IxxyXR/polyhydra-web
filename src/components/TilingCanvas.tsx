import React, { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { TilingGenerationOptions, triangulateFaces } from '../lib/tiling-geometries';
import { PaletteKey } from '../lib/palettes';
import { RadialPolyType } from '../lib/radial-solids';

import { OperatorSpec } from '../lib/conway-operators';
import { ColorMode, computeFaceColors } from '../lib/coloring';
import { MeshFinalizationMode } from '../lib/mesh-finalization';
import { generateFinalMesh } from '../lib/mesh-pipeline';

const FIT_PADDING_MULTIPLIER = 1.12;
const FIT_LERP_ALPHA = 0.14;
const FIT_EPSILON = 0.0001;
const DEFAULT_EMBOSS_IDLE_DELAY_MS = 150;
const DEFAULT_EMBOSS_WIDTH = 0.015;
const DEFAULT_EMBOSS_DEPTH = 0.005;
const DEFAULT_EMBOSS_SMOOTHNESS = 0.8;
const DEFAULT_AMBIENT_LIGHT_INTENSITY = 0.5;
const DEFAULT_KEY_LIGHT_INTENSITY = 0.8;
const DEFAULT_KEY_LIGHT_AZIMUTH = 45;
const DEFAULT_KEY_LIGHT_ELEVATION = 35;
const DEFAULT_FACE_ROUGHNESS = 0.66;
const DEFAULT_FACE_OPACITY = 1;
const KEY_LIGHT_DISTANCE = 8.660254037844387;

interface FitAnimationState {
  active: boolean;
  targetPosition: THREE.Vector3;
  targetTarget: THREE.Vector3;
}

interface MeshBounds {
  centerX: number;
  centerY: number;
  centerZ: number;
  radius: number;
}

interface FaceProjectionData {
  basisU: THREE.Vector3;
  basisV: THREE.Vector3;
  normal: THREE.Vector3;
  centroid: THREE.Vector3;
  localPointByVertex: Map<number, [number, number]>;
  orderedLocalPoints: Array<[number, number]>;
}

function disposeMaterialResources(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material];
  materials.forEach((entry) => {
    entry.dispose();
  });
}

function isEmbossMaterial(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material];
  return materials.some((entry) => Boolean(entry.userData?.isEmbossMaterial));
}

function computeFaceProjection(face: number[], vertices: number[]): FaceProjectionData {
  const normal = new THREE.Vector3();

  for (let index = 0; index < face.length; index++) {
    const current = face[index];
    const next = face[(index + 1) % face.length];
    const currentX = vertices[current * 3];
    const currentY = vertices[current * 3 + 1];
    const currentZ = vertices[current * 3 + 2];
    const nextX = vertices[next * 3];
    const nextY = vertices[next * 3 + 1];
    const nextZ = vertices[next * 3 + 2];

    normal.x += (currentY - nextY) * (currentZ + nextZ);
    normal.y += (currentZ - nextZ) * (currentX + nextX);
    normal.z += (currentX - nextX) * (currentY + nextY);
  }

  if (normal.lengthSq() < 1e-10) {
    const first = new THREE.Vector3(
      vertices[face[0] * 3],
      vertices[face[0] * 3 + 1],
      vertices[face[0] * 3 + 2],
    );

    for (let index = 1; index < face.length - 1; index++) {
      const second = new THREE.Vector3(
        vertices[face[index] * 3],
        vertices[face[index] * 3 + 1],
        vertices[face[index] * 3 + 2],
      );
      const third = new THREE.Vector3(
        vertices[face[index + 1] * 3],
        vertices[face[index + 1] * 3 + 1],
        vertices[face[index + 1] * 3 + 2],
      );

      normal.copy(second.sub(first).cross(third.sub(first)));
      if (normal.lengthSq() >= 1e-10) {
        break;
      }
    }
  }

  if (normal.lengthSq() < 1e-10) {
    normal.set(0, 0, 1);
  } else {
    normal.normalize();
  }

  const centroid = new THREE.Vector3();
  face.forEach((vertexIndex) => {
    centroid.x += vertices[vertexIndex * 3];
    centroid.y += vertices[vertexIndex * 3 + 1];
    centroid.z += vertices[vertexIndex * 3 + 2];
  });
  centroid.multiplyScalar(1 / face.length);

  const helperAxis = Math.abs(normal.z) < 0.9
    ? new THREE.Vector3(0, 0, 1)
    : new THREE.Vector3(0, 1, 0);
  const basisU = new THREE.Vector3().crossVectors(helperAxis, normal).normalize();
  const basisV = new THREE.Vector3().crossVectors(normal, basisU).normalize();

  const localPointByVertex = new Map<number, [number, number]>();
  const orderedLocalPoints: Array<[number, number]> = face.map((vertexIndex) => {
    const point = new THREE.Vector3(
      vertices[vertexIndex * 3],
      vertices[vertexIndex * 3 + 1],
      vertices[vertexIndex * 3 + 2],
    );
    const relative = point.sub(centroid);
    const localPoint: [number, number] = [
      relative.dot(basisU),
      relative.dot(basisV),
    ];
    localPointByVertex.set(vertexIndex, localPoint);
    return localPoint;
  });

  let signedArea = 0;
  for (let index = 0; index < orderedLocalPoints.length; index++) {
    const current = orderedLocalPoints[index];
    const next = orderedLocalPoints[(index + 1) % orderedLocalPoints.length];
    signedArea += current[0] * next[1] - next[0] * current[1];
  }

  if (signedArea < 0) {
    basisV.multiplyScalar(-1);

    const flipped = new Map<number, [number, number]>();
    orderedLocalPoints.forEach(([x, y], index) => {
      const flippedPoint: [number, number] = [x, -y];
      const vertexIndex = face[index];
      flipped.set(vertexIndex, flippedPoint);
      orderedLocalPoints[index] = flippedPoint;
    });

    return {
      basisU,
      basisV,
      normal,
      centroid,
      localPointByVertex: flipped,
      orderedLocalPoints,
    };
  }

  return {
    basisU,
    basisV,
    normal,
    centroid,
    localPointByVertex,
    orderedLocalPoints,
  };
}

// The centroid maps to the origin in the local 2D frame, so a face is fan-triangulable
// from its centroid iff the origin is strictly inside every edge's inward half-plane
// (the centroid is in the polygon's kernel). Inward normal for the CCW frame is (-dy, dx).
function isCentroidInKernel(orderedLocalPoints: Array<[number, number]>): boolean {
  const n = orderedLocalPoints.length;
  if (n < 3) return false;

  const KERNEL_EPSILON = 1e-6;
  for (let index = 0; index < n; index++) {
    const a = orderedLocalPoints[index];
    const b = orderedLocalPoints[(index + 1) % n];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const length = Math.hypot(dx, dy);
    if (length < 1e-12) {
      return false;
    }
    // Signed distance of the origin from the edge line, positive toward the interior.
    const inwardDistance = -(a[0] * (-dy) + a[1] * dx) / length;
    if (inwardDistance <= KERNEL_EPSILON) {
      return false;
    }
  }
  return true;
}

function createEmbossedFaceMaterial(
  embossWidth: number,
  embossDepth: number,
  embossSmoothness: number,
  faceRoughness: number,
  faceOpacity: number,
  side: THREE.Side,
) {
  const isOpaqueFaces = faceOpacity >= 0.999;
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side,
    flatShading: false,
    transparent: !isOpaqueFaces,
    opacity: faceOpacity,
    roughness: faceRoughness,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  material.userData.isEmbossMaterial = true;
  material.customProgramCacheKey = () => 'face-emboss-fan';
  material.onBeforeCompile = (shader) => {
    shader.uniforms.embossWidth = { value: embossWidth };
    shader.uniforms.embossDepth = { value: embossDepth };
    shader.uniforms.embossSmoothness = { value: embossSmoothness };
    shader.uniforms.embossBlendSharpness = { value: 12 / Math.max(embossWidth, 1e-4) };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 faceLocalPos;
attribute vec3 faceBasisU;
attribute vec3 faceBasisV;
attribute vec2 faceEdgeP0;
attribute vec2 faceEdgeP1;
attribute vec2 faceEdgeP2;
attribute vec2 faceEdgeP3;
attribute float faceEmbossEnabled;
varying vec2 vFaceLocalPos;
varying vec3 vFaceBasisUView;
varying vec3 vFaceBasisVView;
varying vec2 vFaceEdgeP0;
varying vec2 vFaceEdgeP1;
varying vec2 vFaceEdgeP2;
varying vec2 vFaceEdgeP3;
varying float vFaceEmbossEnabled;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vFaceLocalPos = faceLocalPos;
vFaceBasisUView = normalize( normalMatrix * faceBasisU );
vFaceBasisVView = normalize( normalMatrix * faceBasisV );
vFaceEdgeP0 = faceEdgeP0;
vFaceEdgeP1 = faceEdgeP1;
vFaceEdgeP2 = faceEdgeP2;
vFaceEdgeP3 = faceEdgeP3;
vFaceEmbossEnabled = faceEmbossEnabled;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform float embossWidth;
uniform float embossDepth;
uniform float embossSmoothness;
uniform float embossBlendSharpness;
varying vec2 vFaceLocalPos;
varying vec3 vFaceBasisUView;
varying vec3 vFaceBasisVView;
varying vec2 vFaceEdgeP0;
varying vec2 vFaceEdgeP1;
varying vec2 vFaceEdgeP2;
varying vec2 vFaceEdgeP3;
varying float vFaceEmbossEnabled;

// Distance from p to segment [a,b]; also accumulates the inward-normal blend.
float embossEdge( vec2 p, vec2 a, vec2 b, inout vec2 dirSum, inout float weightSum ) {
  vec2 ab = b - a;
  float invLenSq = 1.0 / max( dot( ab, ab ), 1.0e-12 );
  float t = clamp( dot( p - a, ab ) * invLenSq, 0.0, 1.0 );
  float d = distance( p, a + ab * t );
  vec2 inward = normalize( vec2( -ab.y, ab.x ) );
  float w = exp( - d * embossBlendSharpness );
  dirSum += inward * w;
  weightSum += w;
  return d;
}`
      )
      .replace(
        '#include <normal_fragment_begin>',
        `float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
vec3 normal = normalize( vNormal );

#ifdef DOUBLE_SIDED
normal *= faceDirection;
#endif

if ( vFaceEmbossEnabled > 0.5 ) {
  vec2 directionSum = vec2( 0.0 );
  float directionWeight = 0.0;
  // In a centroid fan wedge the middle edge (P1->P2) is the nearest polygon edge,
  // so its distance is the min distance; the neighbours only refine the corner blend.
  float minDistance = embossEdge( vFaceLocalPos, vFaceEdgeP1, vFaceEdgeP2, directionSum, directionWeight );

  if ( minDistance < embossWidth ) {
    embossEdge( vFaceLocalPos, vFaceEdgeP0, vFaceEdgeP1, directionSum, directionWeight );
    embossEdge( vFaceLocalPos, vFaceEdgeP2, vFaceEdgeP3, directionSum, directionWeight );

    vec2 inwardDirection = normalize( directionSum / directionWeight );
    float x = clamp( minDistance / embossWidth, 0.0, 1.0 );
    float linearSlope = 1.0;
    float smoothstepSlope = 6.0 * x * ( 1.0 - x );
    float smootherstepSlope = 30.0 * x * x * ( 1.0 - x ) * ( 1.0 - x );
    float curvedSlope = mix( smoothstepSlope, smootherstepSlope, embossSmoothness );
    float profileSlope = mix( linearSlope, curvedSlope, embossSmoothness ) / max( embossWidth, 1.0e-5 );
    float heightDerivative = embossDepth * profileSlope;
    vec2 gradient2D = inwardDirection * heightDerivative;
    vec3 basisUView = normalize( vFaceBasisUView );
    vec3 basisVView = normalize( vFaceBasisVView );
    normal = normalize( normal - gradient2D.x * basisUView - gradient2D.y * basisVView );
  }
}

vec3 nonPerturbedNormal = normal;`
      );
  };

  return material;
}

function buildEmbossedFaceGeometry(
  faces: number[][],
  faceTriangulations: number[][],
  vertices: number[],
  computedFaceColors: string[],
  embossWidth: number,
  embossDepth: number,
  embossSmoothness: number,
  faceRoughness: number,
  faceOpacity: number,
  side: THREE.Side,
) {
  const positionAttr: number[] = [];
  const colorAttr: number[] = [];
  const normalAttr: number[] = [];
  const localPosAttr: number[] = [];
  const basisUAttr: number[] = [];
  const basisVAttr: number[] = [];
  const edgeP0Attr: number[] = [];
  const edgeP1Attr: number[] = [];
  const edgeP2Attr: number[] = [];
  const edgeP3Attr: number[] = [];
  const embossEnabledAttr: number[] = [];

  const faceColor = new THREE.Color();
  const zero: [number, number] = [0, 0];

  faces.forEach((face, faceIndex) => {
    const projection = computeFaceProjection(face, vertices);
    const n = face.length;
    faceColor.set(computedFaceColors[faceIndex] || '#ffffff');

    const pushVertex = (
      px: number,
      py: number,
      pz: number,
      localX: number,
      localY: number,
      p0: [number, number],
      p1: [number, number],
      p2: [number, number],
      p3: [number, number],
      embossOn: number,
    ) => {
      positionAttr.push(px, py, pz);
      colorAttr.push(faceColor.r, faceColor.g, faceColor.b);
      normalAttr.push(projection.normal.x, projection.normal.y, projection.normal.z);
      localPosAttr.push(localX, localY);
      basisUAttr.push(projection.basisU.x, projection.basisU.y, projection.basisU.z);
      basisVAttr.push(projection.basisV.x, projection.basisV.y, projection.basisV.z);
      edgeP0Attr.push(p0[0], p0[1]);
      edgeP1Attr.push(p1[0], p1[1]);
      edgeP2Attr.push(p2[0], p2[1]);
      edgeP3Attr.push(p3[0], p3[1]);
      embossEnabledAttr.push(embossOn);
    };

    if (n >= 3 && isCentroidInKernel(projection.orderedLocalPoints)) {
      // Fan-triangulate from the centroid. Each wedge [C, v_i, v_{i+1}] owns one
      // polygon edge (P1->P2); the shader needs only that edge and its two neighbours
      // (P0->P1, P2->P3) for the bevel, so the four points ride along as attributes.
      const c = projection.centroid;
      for (let i = 0; i < n; i++) {
        const p0 = projection.orderedLocalPoints[(i - 1 + n) % n];
        const p1 = projection.orderedLocalPoints[i];
        const p2 = projection.orderedLocalPoints[(i + 1) % n];
        const p3 = projection.orderedLocalPoints[(i + 2) % n];
        const viCur = face[i];
        const viNext = face[(i + 1) % n];

        pushVertex(c.x, c.y, c.z, 0, 0, p0, p1, p2, p3, 1);
        pushVertex(
          vertices[viCur * 3], vertices[viCur * 3 + 1], vertices[viCur * 3 + 2],
          p1[0], p1[1], p0, p1, p2, p3, 1,
        );
        pushVertex(
          vertices[viNext * 3], vertices[viNext * 3 + 1], vertices[viNext * 3 + 2],
          p2[0], p2[1], p0, p1, p2, p3, 1,
        );
      }
    } else {
      // Fallback: centroid is not in the kernel, so a centroid fan would be invalid.
      // Render flat with emboss disabled, via the robust ear-clip triangulation.
      const triIndices = faceTriangulations[faceIndex];
      for (let triIndex = 0; triIndex < triIndices.length; triIndex++) {
        const vertexIndex = triIndices[triIndex];
        const localPoint = projection.localPointByVertex.get(vertexIndex) ?? zero;
        pushVertex(
          vertices[vertexIndex * 3], vertices[vertexIndex * 3 + 1], vertices[vertexIndex * 3 + 2],
          localPoint[0], localPoint[1], zero, zero, zero, zero, 0,
        );
      }
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionAttr, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorAttr, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalAttr, 3));
  geometry.setAttribute('faceLocalPos', new THREE.Float32BufferAttribute(localPosAttr, 2));
  geometry.setAttribute('faceBasisU', new THREE.Float32BufferAttribute(basisUAttr, 3));
  geometry.setAttribute('faceBasisV', new THREE.Float32BufferAttribute(basisVAttr, 3));
  geometry.setAttribute('faceEdgeP0', new THREE.Float32BufferAttribute(edgeP0Attr, 2));
  geometry.setAttribute('faceEdgeP1', new THREE.Float32BufferAttribute(edgeP1Attr, 2));
  geometry.setAttribute('faceEdgeP2', new THREE.Float32BufferAttribute(edgeP2Attr, 2));
  geometry.setAttribute('faceEdgeP3', new THREE.Float32BufferAttribute(edgeP3Attr, 2));
  geometry.setAttribute('faceEmbossEnabled', new THREE.Float32BufferAttribute(embossEnabledAttr, 1));

  const material = createEmbossedFaceMaterial(
    embossWidth,
    embossDepth,
    embossSmoothness,
    faceRoughness,
    faceOpacity,
    side,
  );

  return { geometry, material };
}

function updateKeyLightPosition(light: THREE.DirectionalLight, azimuthDegrees: number, elevationDegrees: number) {
  const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  const planarRadius = Math.cos(elevation) * KEY_LIGHT_DISTANCE;
  light.position.set(
    Math.cos(azimuth) * planarRadius,
    Math.sin(elevation) * KEY_LIGHT_DISTANCE,
    Math.sin(azimuth) * planarRadius,
  );
}

interface TilingCanvasProps {
  tilingType: string;
  rows: number;
  cols: number;
  showEdges: boolean;
  showVertices: boolean;
  showFaces: boolean;
  wireframe: boolean;
  operators: OperatorSpec[];
  palette: PaletteKey;
  paletteColors?: string[];
  colorMode: ColorMode;
  edgeColor: string;
  embossEnabled?: boolean;
  embossWidth?: number;
  embossDepth?: number;
  embossSmoothness?: number;
  ambientLightIntensity?: number;
  keyLightIntensity?: number;
  keyLightAzimuth?: number;
  keyLightElevation?: number;
  faceRoughness?: number;
  faceOpacity?: number;
  generationOptions?: TilingGenerationOptions;
  mode?: '2d' | '3d';
  radialType?: RadialPolyType;
  radialSides?: number;
  finalization?: MeshFinalizationMode;
  fitRequestKey?: number;
  onGeometryGenerationChange?: (isGenerating: boolean) => void;
}

interface XRNavigator extends Navigator {
  xr?: {
    isSessionSupported?: (mode: 'immersive-vr') => Promise<boolean>;
    requestSession: (
      mode: 'immersive-vr',
      options?: { optionalFeatures?: string[] },
    ) => Promise<Parameters<THREE.WebXRManager['setSession']>[0]>;
  };
}

export interface TilingCanvasHandle {
  enterWebXR: () => Promise<void>;
  isWebXRSupported: () => Promise<boolean>;
}

export const TilingCanvas = forwardRef<TilingCanvasHandle, TilingCanvasProps>(({
  tilingType,
  rows,
  cols,
  showEdges,
  showVertices,
  showFaces,
  wireframe,
  operators,
  palette,
  paletteColors,
  colorMode,
  edgeColor,
  embossEnabled = true,
  embossWidth = DEFAULT_EMBOSS_WIDTH,
  embossDepth = DEFAULT_EMBOSS_DEPTH,
  embossSmoothness = DEFAULT_EMBOSS_SMOOTHNESS,
  ambientLightIntensity = DEFAULT_AMBIENT_LIGHT_INTENSITY,
  keyLightIntensity = DEFAULT_KEY_LIGHT_INTENSITY,
  keyLightAzimuth = DEFAULT_KEY_LIGHT_AZIMUTH,
  keyLightElevation = DEFAULT_KEY_LIGHT_ELEVATION,
  faceRoughness = DEFAULT_FACE_ROUGHNESS,
  faceOpacity = DEFAULT_FACE_OPACITY,
  generationOptions,
  mode = '2d' as '2d' | '3d',
  radialType = 'Prism' as RadialPolyType,
  radialSides = 5,
  finalization = 'planarize' as MeshFinalizationMode,
  fitRequestKey = 0,
  onGeometryGenerationChange,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitAnimationRef = useRef<FitAnimationState | null>(null);
  const lastHandledFitRequestKeyRef = useRef(0);
  const meshBoundsRef = useRef<MeshBounds | null>(null);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    meshGroup: THREE.Group;
    ambientLight: THREE.AmbientLight;
    directLight: THREE.DirectionalLight;
    xrRig: THREE.Group;
  } | null>(null);

  useImperativeHandle(ref, () => ({
    enterWebXR: async () => {
      if (!sceneRef.current) {
        throw new Error('Renderer is not ready yet.');
      }

      const xr = (navigator as XRNavigator).xr;
      if (!xr?.requestSession) {
        throw new Error('WebXR is not available in this browser.');
      }

      const supported = xr.isSessionSupported
        ? await xr.isSessionSupported('immersive-vr')
        : true;
      if (!supported) {
        throw new Error('Immersive VR sessions are not supported on this device.');
      }

      const session = await xr.requestSession('immersive-vr', {
        optionalFeatures: ['local-floor', 'bounded-floor'],
      });
      await sceneRef.current.renderer.xr.setSession(session);
    },
    isWebXRSupported: async () => {
      const xr = (navigator as XRNavigator).xr;
      if (!xr?.requestSession) return false;
      if (!xr.isSessionSupported) return true;
      return xr.isSessionSupported('immersive-vr');
    },
  }), []);

  const fitCameraToBounds = (bounds: MeshBounds) => {
    if (!sceneRef.current) return;

    const { camera, controls } = sceneRef.current;
    const center = new THREE.Vector3(bounds.centerX, bounds.centerY, bounds.centerZ);
    const radius = Math.max(bounds.radius, 0.5);
    const verticalFov = THREE.MathUtils.degToRad(camera.fov);
    const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * camera.aspect);
    const fitHeightDistance = radius / Math.tan(verticalFov / 2);
    const fitWidthDistance = radius / Math.tan(horizontalFov / 2);
    const distance = Math.max(fitHeightDistance, fitWidthDistance) * FIT_PADDING_MULTIPLIER;
    const direction = camera.position.clone().sub(controls.target);

    if (direction.lengthSq() === 0) {
      direction.set(0, 0, 1);
    } else {
      direction.normalize();
    }

    camera.near = Math.max(distance / 100, 0.01);
    camera.far = Math.max(distance * 100, 1000);
    camera.updateProjectionMatrix();
    fitAnimationRef.current = {
      active: true,
      targetPosition: center.clone().add(direction.multiplyScalar(distance)),
      targetTarget: center.clone(),
    };
  };

  const computeMeshBounds = (vertices: number[]): MeshBounds | null => {
    if (vertices.length < 3) return null;

    let minX = vertices[0];
    let minY = vertices[1];
    let minZ = vertices[2];
    let maxX = vertices[0];
    let maxY = vertices[1];
    let maxZ = vertices[2];

    for (let index = 3; index < vertices.length; index += 3) {
      const x = vertices[index];
      const y = vertices[index + 1];
      const z = vertices[index + 2];

      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (z < minZ) minZ = z;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
      if (z > maxZ) maxZ = z;
    }

    const centerX = (minX + maxX) * 0.5;
    const centerY = (minY + maxY) * 0.5;
    const centerZ = (minZ + maxZ) * 0.5;
    const halfSizeX = (maxX - minX) * 0.5;
    const halfSizeY = (maxY - minY) * 0.5;
    const halfSizeZ = (maxZ - minZ) * 0.5;

    return {
      centerX,
      centerY,
      centerZ,
      radius: Math.hypot(halfSizeX, halfSizeY, halfSizeZ),
    };
  };

  useEffect(() => {
    if (!containerRef.current) return;

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0a0a);

    const camera = new THREE.PerspectiveCamera(
      45,
      containerRef.current.clientWidth / containerRef.current.clientHeight,
      0.1,
      1000
    );
    camera.position.z = 10;

    const renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.xr.enabled = true;
    renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    containerRef.current.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;

    const handleControlsStart = () => {
      if (fitAnimationRef.current?.active) {
        fitAnimationRef.current.active = false;
      }
    };
    controls.addEventListener('start', handleControlsStart);

    const ambientLight = new THREE.AmbientLight(0xffffff, ambientLightIntensity);
    scene.add(ambientLight);

    const directLight = new THREE.DirectionalLight(0xffffff, keyLightIntensity);
    updateKeyLightPosition(directLight, keyLightAzimuth, keyLightElevation);
    scene.add(directLight);

    const meshGroup = new THREE.Group();
    scene.add(meshGroup);

    const xrRig = new THREE.Group();
    xrRig.add(camera);
    scene.add(xrRig);

    sceneRef.current = { scene, camera, renderer, controls, meshGroup, ambientLight, directLight, xrRig };

    const animate = () => {
      if (renderer.xr.isPresenting) {
        const session = renderer.xr.getSession();
        if (session) {
          let moveX = 0;
          let moveZ = 0;
          let moveY = 0;

          for (const source of session.inputSources) {
            if (source.gamepad) {
              const axes = source.gamepad.axes;
              const buttons = source.gamepad.buttons;

              // Only use left controller for horizontal movement
              if (source.handedness === 'left') {
                const x = (axes[0] || 0) + (axes[2] || 0);
                const z = (axes[1] || 0) + (axes[3] || 0);

                if (Math.abs(x) > 0.1) moveX += x;
                if (Math.abs(z) > 0.1) moveZ += z;
              }

              if (buttons[1] && buttons[1].pressed) {
                if (source.handedness === 'left') moveY -= 1;
                if (source.handedness === 'right') moveY += 1;
              }
            }
          }

          if (moveX !== 0 || moveZ !== 0 || moveY !== 0) {
            const speed = 0.02; // Reduced speed slightly for comfort
            
            const xrCamera = renderer.xr.getCamera(camera);
            
            const direction = new THREE.Vector3(0, 0, -1);
            direction.applyQuaternion(xrCamera.quaternion);
            direction.y = 0;
            if (direction.lengthSq() > 0) direction.normalize();
            
            const right = new THREE.Vector3(1, 0, 0);
            right.applyQuaternion(xrCamera.quaternion);
            right.y = 0;
            if (right.lengthSq() > 0) right.normalize();

            xrRig.position.addScaledVector(right, moveX * speed);
            // Thumbstick forward is negative Z, so subtract to move forward along 'direction'
            xrRig.position.addScaledVector(direction, -moveZ * speed);
            xrRig.position.y += moveY * speed;
          }
        }
      }

      if (!renderer.xr.isPresenting) {
        const fitAnimation = fitAnimationRef.current;
        if (fitAnimation?.active) {
          camera.position.lerp(fitAnimation.targetPosition, FIT_LERP_ALPHA);
          controls.target.lerp(fitAnimation.targetTarget, FIT_LERP_ALPHA);

          const positionSettled = camera.position.distanceToSquared(fitAnimation.targetPosition) <= FIT_EPSILON;
          const targetSettled = controls.target.distanceToSquared(fitAnimation.targetTarget) <= FIT_EPSILON;

          if (positionSettled && targetSettled) {
            camera.position.copy(fitAnimation.targetPosition);
            controls.target.copy(fitAnimation.targetTarget);
            fitAnimation.active = false;
          }
        }
        controls.update();
      }

      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(animate);

    const handleResize = () => {
      if (!containerRef.current || !sceneRef.current) return;
      const { camera, renderer } = sceneRef.current;
      camera.aspect = containerRef.current.clientWidth / containerRef.current.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(containerRef.current.clientWidth, containerRef.current.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', handleControlsStart);
      fitAnimationRef.current = null;
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;

    const { ambientLight, directLight } = sceneRef.current;
    ambientLight.intensity = ambientLightIntensity;
    directLight.intensity = keyLightIntensity;
    updateKeyLightPosition(directLight, keyLightAzimuth, keyLightElevation);
  }, [ambientLightIntensity, keyLightIntensity, keyLightAzimuth, keyLightElevation]);

  useEffect(() => {
    if (!sceneRef.current) {
      onGeometryGenerationChange?.(false);
      return;
    }

    let embossTimeoutId: number | null = null;
    let cancelled = false;
    onGeometryGenerationChange?.(true);

    let generationTimeoutId: number | null = null;
    const generationFrameId = window.requestAnimationFrame(() => {
      generationTimeoutId = window.setTimeout(() => {
      if (cancelled || !sceneRef.current) return;

      try {
      const { meshGroup, renderer } = sceneRef.current;
      const hadEmbossedFaces = meshGroup.children.some((child) => {
        const material = (child as any).material as THREE.Material | THREE.Material[] | undefined;
        return material ? isEmbossMaterial(material) : false;
      });

      while (meshGroup.children.length > 0) {
        const child = meshGroup.children[0] as THREE.Mesh;
        if (child.geometry) child.geometry.dispose();
        if ((child as any).material) {
          disposeMaterialResources((child as any).material);
        }
        meshGroup.remove(child);
      }

      let vertices: number[];
      let faces: number[][];
      const mesh = generateFinalMesh({
        mode,
        tilingType,
        rows,
        cols,
        operators,
        radialType,
        radialSides,
        generationOptions,
        finalization,
      });
      if (!mesh) return;
      vertices = mesh.vertices;
      faces = mesh.faces;
      meshBoundsRef.current = computeMeshBounds(vertices);

      const computedFaceColors = computeFaceColors(mesh, paletteColors ?? palette, colorMode);
      const faceTriangulations = faces.map((face) => triangulateFaces([face], vertices));
      const uniqueColorsUsed = new Set(computedFaceColors);
      const uniqueEdges = new Set<string>();
      faces.forEach((face) => {
        for (let i = 0; i < face.length; i++) {
          const a = face[i];
          const b = face[(i + 1) % face.length];
          uniqueEdges.add(a < b ? `${a},${b}` : `${b},${a}`);
        }
      });

      const updateStat = (ids: string[], value: string) => {
        ids.forEach((id) => {
          const element = document.getElementById(id);
          if (element) element.innerText = value;
        });
      };
      updateStat(['stat-colors'], uniqueColorsUsed.size.toString());
      updateStat(['stat-vertices'], (vertices.length / 3).toString());
      updateStat(['stat-faces'], faces.length.toString());
      updateStat(['stat-edges'], uniqueEdges.size.toString());

      let faceMesh: THREE.Mesh | null = null;
      // 3D solids are consistently wound outward, so opaque solids can backface-cull.
      // Transparent shapes and 2D tilings need both sides visible.
      const isOpaqueFaces = faceOpacity >= 0.999;
      const faceSide = mode === '3d' && isOpaqueFaces ? THREE.FrontSide : THREE.DoubleSide;
      const useEmboss = embossEnabled && !wireframe && renderer.capabilities.isWebGL2;
      const shouldRenderEmbossImmediately = hadEmbossedFaces && useEmboss;

      if (showFaces) {
        if (shouldRenderEmbossImmediately) {
          const embossedFace = buildEmbossedFaceGeometry(
            faces,
            faceTriangulations,
            vertices,
            computedFaceColors,
            embossWidth,
            embossDepth,
            embossSmoothness,
            faceRoughness,
            faceOpacity,
            faceSide,
          );
          faceMesh = new THREE.Mesh(embossedFace.geometry, embossedFace.material);
          faceMesh.renderOrder = 0;
          meshGroup.add(faceMesh);
        } else {
          const posAttr: number[] = [];
          const colorAttr: number[] = [];
          const tmpColor = new THREE.Color();

          faces.forEach((face, fIdx) => {
            tmpColor.set(computedFaceColors[fIdx] || '#ffffff');
            const triIndices = faceTriangulations[fIdx];
            for (let t = 0; t < triIndices.length; t += 3) {
              for (let k = 0; k < 3; k++) {
                const vIdx = triIndices[t + k];
                posAttr.push(vertices[vIdx * 3], vertices[vIdx * 3 + 1], vertices[vIdx * 3 + 2]);
                colorAttr.push(tmpColor.r, tmpColor.g, tmpColor.b);
              }
            }
          });

          const coloredGeom = new THREE.BufferGeometry();
          coloredGeom.setAttribute('position', new THREE.Float32BufferAttribute(posAttr, 3));
          coloredGeom.setAttribute('color', new THREE.Float32BufferAttribute(colorAttr, 3));
          coloredGeom.computeVertexNormals();

          const material = new THREE.MeshStandardMaterial({
            vertexColors: true,
            side: faceSide,
            flatShading: true,
            wireframe: wireframe,
            transparent: !isOpaqueFaces,
            opacity: faceOpacity,
            roughness: faceRoughness,
            metalness: 0,
            polygonOffset: true,
            polygonOffsetFactor: 1,
            polygonOffsetUnits: 1,
          });
          faceMesh = new THREE.Mesh(coloredGeom, material);
          faceMesh.renderOrder = 0;
          meshGroup.add(faceMesh);

          if (useEmboss) {
            embossTimeoutId = window.setTimeout(() => {
              if (!faceMesh || !sceneRef.current) return;

              const embossedFace = buildEmbossedFaceGeometry(
                faces,
                faceTriangulations,
                vertices,
                computedFaceColors,
                embossWidth,
                embossDepth,
                embossSmoothness,
                faceRoughness,
                faceOpacity,
                faceSide,
              );

              const previousGeometry = faceMesh.geometry;
              const previousMaterial = faceMesh.material;
              faceMesh.geometry = embossedFace.geometry;
              faceMesh.material = embossedFace.material;
              previousGeometry.dispose();
              disposeMaterialResources(previousMaterial);
            }, DEFAULT_EMBOSS_IDLE_DELAY_MS);
          }
        }
      }

      if (showEdges) {
        const edgeIndices: number[] = [];
        faces.forEach(face => {
          for (let i = 0; i < face.length; i++) {
            edgeIndices.push(face[i], face[(i + 1) % face.length]);
          }
        });
        const edgeGeom = new THREE.BufferGeometry();
        edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        edgeGeom.setIndex(edgeIndices);
        const edgeMat = new THREE.LineBasicMaterial({
          color: new THREE.Color(edgeColor),
          linewidth: 2,
          transparent: true,
          opacity: 0.8
        });
        const edges = new THREE.LineSegments(edgeGeom, edgeMat);
        edges.renderOrder = 1;
        meshGroup.add(edges);
      }

      if (showVertices) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d')!;
        ctx.beginPath();
        ctx.arc(32, 32, 30, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        const texture = new THREE.CanvasTexture(canvas);

        const pointsGeom = new THREE.BufferGeometry();
        pointsGeom.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        const pointsMat = new THREE.PointsMaterial({
          color: 0xffffff,
          size: 0.1,
          transparent: true,
          opacity: 0.8,
          map: texture,
          alphaTest: 0.5
        });
        const points = new THREE.Points(pointsGeom, pointsMat);
        points.position.z = 0.02;
        meshGroup.add(points);
      }

      const shouldFitToExtents = fitRequestKey > lastHandledFitRequestKeyRef.current;
      if (shouldFitToExtents && meshBoundsRef.current) {
        lastHandledFitRequestKeyRef.current = fitRequestKey;
        fitCameraToBounds(meshBoundsRef.current);
      }
      } catch (e) {
        console.warn('Mesh generation failed:', (e as Error).message);
      } finally {
        if (!cancelled) {
          onGeometryGenerationChange?.(false);
        }
      }
      }, 0);
    });

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(generationFrameId);
      if (generationTimeoutId !== null) {
        window.clearTimeout(generationTimeoutId);
      }
      if (embossTimeoutId !== null) {
        window.clearTimeout(embossTimeoutId);
      }
    };
  }, [tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, operators, palette, paletteColors, colorMode, edgeColor, embossEnabled, embossWidth, embossDepth, embossSmoothness, faceRoughness, faceOpacity, generationOptions, mode, radialType, radialSides, finalization, fitRequestKey, onGeometryGenerationChange]);

  return <div id="canvas-container" ref={containerRef} className="w-full h-full" />;
});

TilingCanvas.displayName = 'TilingCanvas';
