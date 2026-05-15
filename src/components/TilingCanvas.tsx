import React, { useEffect, useRef } from 'react';
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
const DEFAULT_AMBIENT_LIGHT_INTENSITY = 0.5;
const DEFAULT_KEY_LIGHT_INTENSITY = 0.8;
const DEFAULT_KEY_LIGHT_AZIMUTH = 45;
const DEFAULT_KEY_LIGHT_ELEVATION = 35;
const DEFAULT_FACE_ROUGHNESS = 0.66;
const KEY_LIGHT_DISTANCE = 8.660254037844387;
type EmbossProfile = 'smooth' | 'linear';

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
  localPointByVertex: Map<number, [number, number]>;
  orderedLocalPoints: Array<[number, number]>;
}

function disposeMaterialResources(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material];

  materials.forEach((entry) => {
    const faceEdgeTexture = entry.userData?.faceEdgeTexture as THREE.Texture | undefined;
    if (faceEdgeTexture) {
      faceEdgeTexture.dispose();
    }
    entry.dispose();
  });
}

function isEmbossMaterial(material: THREE.Material | THREE.Material[]) {
  const materials = Array.isArray(material) ? material : [material];
  return materials.some((entry) => Boolean(entry.userData?.faceEdgeTexture));
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
      localPointByVertex: flipped,
      orderedLocalPoints,
    };
  }

  return {
    basisU,
    basisV,
    normal,
    localPointByVertex,
    orderedLocalPoints,
  };
}

function createFaceEdgeTexture(edgeData: Float32Array, width: number, height: number) {
  const texture = new THREE.DataTexture(edgeData, width, height, THREE.RGBAFormat, THREE.FloatType);
  texture.magFilter = THREE.NearestFilter;
  texture.minFilter = THREE.NearestFilter;
  texture.wrapS = THREE.ClampToEdgeWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

function createEmbossedFaceMaterial(
  edgeTexture: THREE.DataTexture,
  textureWidth: number,
  textureHeight: number,
  maxFaceEdges: number,
  embossWidth: number,
  embossDepth: number,
  embossProfile: EmbossProfile,
  faceRoughness: number,
) {
  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    side: THREE.DoubleSide,
    flatShading: false,
    transparent: true,
    opacity: 0.9,
    roughness: faceRoughness,
    metalness: 0,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
  });

  material.userData.faceEdgeTexture = edgeTexture;
  material.customProgramCacheKey = () => `face-emboss-${maxFaceEdges}`;
  material.onBeforeCompile = (shader) => {
    shader.uniforms.faceEdgeTexture = { value: edgeTexture };
    shader.uniforms.faceEdgeTextureSize = { value: new THREE.Vector2(textureWidth, textureHeight) };
    shader.uniforms.embossWidth = { value: embossWidth };
    shader.uniforms.embossDepth = { value: embossDepth };
    shader.uniforms.embossProfileMode = { value: embossProfile === 'linear' ? 0 : 1 };
    shader.uniforms.embossBlendSharpness = { value: 12 / Math.max(embossWidth, 1e-4) };

    shader.vertexShader = shader.vertexShader
      .replace(
        '#include <common>',
        `#include <common>
attribute vec2 faceLocalPos;
attribute vec3 faceBasisU;
attribute vec3 faceBasisV;
attribute float faceEdgeStart;
attribute float faceEdgeCount;
varying vec2 vFaceLocalPos;
varying vec3 vFaceBasisUView;
varying vec3 vFaceBasisVView;
varying float vFaceEdgeStart;
varying float vFaceEdgeCount;`
      )
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
vFaceLocalPos = faceLocalPos;
vFaceBasisUView = normalize( normalMatrix * faceBasisU );
vFaceBasisVView = normalize( normalMatrix * faceBasisV );
vFaceEdgeStart = faceEdgeStart;
vFaceEdgeCount = faceEdgeCount;`
      );

    shader.fragmentShader = shader.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
uniform sampler2D faceEdgeTexture;
uniform vec2 faceEdgeTextureSize;
uniform float embossWidth;
uniform float embossDepth;
uniform float embossProfileMode;
uniform float embossBlendSharpness;
varying vec2 vFaceLocalPos;
varying vec3 vFaceBasisUView;
varying vec3 vFaceBasisVView;
varying float vFaceEdgeStart;
varying float vFaceEdgeCount;

vec4 sampleFaceEdge( float edgeIndex ) {
  float x = mod( edgeIndex, faceEdgeTextureSize.x );
  float y = floor( edgeIndex / faceEdgeTextureSize.x );
  vec2 uv = vec2(
    ( x + 0.5 ) / faceEdgeTextureSize.x,
    ( y + 0.5 ) / faceEdgeTextureSize.y
  );
  return texture2D( faceEdgeTexture, uv );
}`
      )
      .replace(
        '#include <normal_fragment_begin>',
        `float faceDirection = gl_FrontFacing ? 1.0 : - 1.0;
vec3 normal = normalize( vNormal );

#ifdef DOUBLE_SIDED
normal *= faceDirection;
#endif

if ( vFaceEdgeCount > 0.5 ) {
  float minDistance = 1.0e20;
  vec2 directionSum = vec2( 0.0 );
  float directionWeight = 0.0;

  for ( int edgeIndex = 0; edgeIndex < ${Math.max(maxFaceEdges, 1)}; edgeIndex ++ ) {
    if ( float( edgeIndex ) >= vFaceEdgeCount ) break;

    vec4 edgeSample = sampleFaceEdge( vFaceEdgeStart + float( edgeIndex ) );
    vec2 edgeA = edgeSample.xy;
    vec2 edgeB = edgeSample.zw;
    vec2 edgeVector = edgeB - edgeA;
    float edgeLengthSq = max( dot( edgeVector, edgeVector ), 1.0e-6 );
    float t = clamp( dot( vFaceLocalPos - edgeA, edgeVector ) / edgeLengthSq, 0.0, 1.0 );
    vec2 closestPoint = edgeA + edgeVector * t;
    float distanceToEdge = length( vFaceLocalPos - closestPoint );

    minDistance = min( minDistance, distanceToEdge );

    vec2 inward = vec2( - edgeVector.y, edgeVector.x ) * inversesqrt( edgeLengthSq );
    float weight = exp( - distanceToEdge * embossBlendSharpness );
    directionSum += inward * weight;
    directionWeight += weight;
  }

  if ( directionWeight > 0.0 && minDistance < embossWidth ) {
    vec2 inwardDirection = normalize( directionSum / directionWeight );
    float x = clamp( minDistance / embossWidth, 0.0, 1.0 );
    float profileSlope = embossProfileMode < 0.5
      ? 1.0 / max( embossWidth, 1.0e-5 )
      : ( 6.0 * x * ( 1.0 - x ) ) / max( embossWidth, 1.0e-5 );
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
  embossProfile: EmbossProfile,
  faceRoughness: number,
) {
  const positionAttr: number[] = [];
  const colorAttr: number[] = [];
  const normalAttr: number[] = [];
  const localPosAttr: number[] = [];
  const basisUAttr: number[] = [];
  const basisVAttr: number[] = [];
  const faceEdgeStartAttr: number[] = [];
  const faceEdgeCountAttr: number[] = [];

  const totalEdges = faces.reduce((sum, face) => sum + face.length, 0);
  const textureWidth = Math.max(1, Math.ceil(Math.sqrt(totalEdges)));
  const textureHeight = Math.max(1, Math.ceil(totalEdges / textureWidth));
  const edgeData = new Float32Array(textureWidth * textureHeight * 4);

  let edgeCursor = 0;
  let maxFaceEdges = 0;
  const faceColor = new THREE.Color();

  faces.forEach((face, faceIndex) => {
    const projection = computeFaceProjection(face, vertices);
    const edgeStart = edgeCursor;
    const edgeCount = face.length;
    maxFaceEdges = Math.max(maxFaceEdges, edgeCount);

    for (let edgeIndex = 0; edgeIndex < edgeCount; edgeIndex++) {
      const current = projection.orderedLocalPoints[edgeIndex];
      const next = projection.orderedLocalPoints[(edgeIndex + 1) % edgeCount];
      const textureOffset = edgeCursor * 4;
      edgeData[textureOffset] = current[0];
      edgeData[textureOffset + 1] = current[1];
      edgeData[textureOffset + 2] = next[0];
      edgeData[textureOffset + 3] = next[1];
      edgeCursor += 1;
    }

    faceColor.set(computedFaceColors[faceIndex] || '#ffffff');
    const triIndices = faceTriangulations[faceIndex];

    for (let triIndex = 0; triIndex < triIndices.length; triIndex++) {
      const vertexIndex = triIndices[triIndex];
      const localPoint = projection.localPointByVertex.get(vertexIndex);
      if (!localPoint) continue;

      positionAttr.push(
        vertices[vertexIndex * 3],
        vertices[vertexIndex * 3 + 1],
        vertices[vertexIndex * 3 + 2],
      );
      colorAttr.push(faceColor.r, faceColor.g, faceColor.b);
      normalAttr.push(projection.normal.x, projection.normal.y, projection.normal.z);
      localPosAttr.push(localPoint[0], localPoint[1]);
      basisUAttr.push(projection.basisU.x, projection.basisU.y, projection.basisU.z);
      basisVAttr.push(projection.basisV.x, projection.basisV.y, projection.basisV.z);
      faceEdgeStartAttr.push(edgeStart);
      faceEdgeCountAttr.push(edgeCount);
    }
  });

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positionAttr, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colorAttr, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normalAttr, 3));
  geometry.setAttribute('faceLocalPos', new THREE.Float32BufferAttribute(localPosAttr, 2));
  geometry.setAttribute('faceBasisU', new THREE.Float32BufferAttribute(basisUAttr, 3));
  geometry.setAttribute('faceBasisV', new THREE.Float32BufferAttribute(basisVAttr, 3));
  geometry.setAttribute('faceEdgeStart', new THREE.Float32BufferAttribute(faceEdgeStartAttr, 1));
  geometry.setAttribute('faceEdgeCount', new THREE.Float32BufferAttribute(faceEdgeCountAttr, 1));

  const edgeTexture = createFaceEdgeTexture(edgeData, textureWidth, textureHeight);
  const material = createEmbossedFaceMaterial(
    edgeTexture,
    textureWidth,
    textureHeight,
    maxFaceEdges,
    embossWidth,
    embossDepth,
    embossProfile,
    faceRoughness,
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
  faceHighlight: boolean;
  operators: OperatorSpec[];
  palette: PaletteKey;
  paletteColors?: string[];
  colorMode: ColorMode;
  edgeColor: string;
  embossEnabled?: boolean;
  embossWidth?: number;
  embossDepth?: number;
  embossProfile?: EmbossProfile;
  ambientLightIntensity?: number;
  keyLightIntensity?: number;
  keyLightAzimuth?: number;
  keyLightElevation?: number;
  faceRoughness?: number;
  generationOptions?: TilingGenerationOptions;
  mode?: '2d' | '3d';
  radialType?: RadialPolyType;
  radialSides?: number;
  finalization?: MeshFinalizationMode;
  fitRequestKey?: number;
}

export const TilingCanvas: React.FC<TilingCanvasProps> = ({
  tilingType,
  rows,
  cols,
  showEdges,
  showVertices,
  showFaces,
  wireframe,
  faceHighlight,
  operators,
  palette,
  paletteColors,
  colorMode,
  edgeColor,
  embossEnabled = true,
  embossWidth = DEFAULT_EMBOSS_WIDTH,
  embossDepth = DEFAULT_EMBOSS_DEPTH,
  embossProfile = 'smooth',
  ambientLightIntensity = DEFAULT_AMBIENT_LIGHT_INTENSITY,
  keyLightIntensity = DEFAULT_KEY_LIGHT_INTENSITY,
  keyLightAzimuth = DEFAULT_KEY_LIGHT_AZIMUTH,
  keyLightElevation = DEFAULT_KEY_LIGHT_ELEVATION,
  faceRoughness = DEFAULT_FACE_ROUGHNESS,
  generationOptions,
  mode = '2d' as '2d' | '3d',
  radialType = 'Prism' as RadialPolyType,
  radialSides = 5,
  finalization = 'planarize',
  fitRequestKey = 0,
}) => {
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
  } | null>(null);

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

    sceneRef.current = { scene, camera, renderer, controls, meshGroup, ambientLight, directLight };

    const animate = () => {
      requestAnimationFrame(animate);
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
      renderer.render(scene, camera);
    };
    animate();

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
    if (!sceneRef.current) return;
    const { meshGroup, camera, renderer } = sceneRef.current;
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
    try {
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
    } catch (e) {
      console.warn('Mesh generation failed:', (e as Error).message);
      return;
    }

    const computedFaceColors = computeFaceColors({ vertices, faces }, paletteColors ?? palette, colorMode);
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
    const triangleToFaceIndex: number[] = [];
    let embossTimeoutId: number | null = null;
    const shouldRenderEmbossImmediately = hadEmbossedFaces && embossEnabled && !wireframe && renderer.capabilities.isWebGL2;

    if (showFaces) {
      if (shouldRenderEmbossImmediately) {
        faces.forEach((face, fIdx) => {
          const triIndices = faceTriangulations[fIdx];
          for (let t = 0; t < triIndices.length; t += 3) {
            triangleToFaceIndex.push(fIdx);
          }
        });

        const embossedFace = buildEmbossedFaceGeometry(
          faces,
          faceTriangulations,
          vertices,
          computedFaceColors,
          embossWidth,
          embossDepth,
          embossProfile,
          faceRoughness,
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
          triangleToFaceIndex.push(fIdx);
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
        side: THREE.DoubleSide,
        flatShading: true,
        wireframe: wireframe,
        transparent: true,
        opacity: 0.9,
        roughness: faceRoughness,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      faceMesh = new THREE.Mesh(coloredGeom, material);
      faceMesh.renderOrder = 0;
      meshGroup.add(faceMesh);

      if (embossEnabled && !wireframe && renderer.capabilities.isWebGL2) {
        embossTimeoutId = window.setTimeout(() => {
          if (!faceMesh || !sceneRef.current) return;

          const embossedFace = buildEmbossedFaceGeometry(
            faces,
            faceTriangulations,
            vertices,
            computedFaceColors,
            embossWidth,
            embossDepth,
            embossProfile,
            faceRoughness,
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

    // Highlight line objects — always created so the mousemove handler can clear them
    const makeLines = (color: string, order: number): THREE.LineSegments => {
      const geom = new THREE.BufferGeometry();
      geom.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      const mat = new THREE.LineBasicMaterial({ color, depthTest: false });
      const lines = new THREE.LineSegments(geom, mat);
      lines.renderOrder = order;
      meshGroup.add(lines);
      return lines;
    };
    const outlineLines = faceHighlight ? makeLines('#ffffff', 10) : null;
    const diagLines = faceHighlight ? makeLines('#ff8800', 9) : null;

    // Raycasting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    const getMouseNDC = (event: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / containerRef.current.clientWidth) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / containerRef.current.clientHeight) * 2 + 1;
    };

    const onClick = (event: MouseEvent) => {
      if (!faceMesh) return;
      getMouseNDC(event);
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(faceMesh);
      if (intersects.length > 0 && intersects[0].faceIndex !== undefined) {
        console.log('face index:', triangleToFaceIndex[intersects[0].faceIndex]);
      }
    };

    const onMouseMove = (event: MouseEvent) => {
      if (!faceHighlight || !outlineLines || !diagLines) return;

      const clearHighlight = () => {
        outlineLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
        diagLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute([], 3));
      };

      if (!faceMesh) { clearHighlight(); return; }

      getMouseNDC(event);
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObject(faceMesh);

      if (intersects.length === 0 || intersects[0].faceIndex === undefined) {
        clearHighlight();
        return;
      }

      const faceIdx = triangleToFaceIndex[intersects[0].faceIndex];
      if (faceIdx === undefined) { clearHighlight(); return; }

      const face = faces[faceIdx];

      // Face outline
      const outlinePos: number[] = [];
      for (let i = 0; i < face.length; i++) {
        const a = face[i];
        const b = face[(i + 1) % face.length];
        outlinePos.push(
          vertices[a * 3], vertices[a * 3 + 1], vertices[a * 3 + 2],
          vertices[b * 3], vertices[b * 3 + 1], vertices[b * 3 + 2],
        );
      }
      outlineLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(outlinePos, 3));

      // Interior triangulation edges (diagonals only)
      const diagPos: number[] = [];
      if (face.length > 3) {
        const faceEdgeSet = new Set<string>();
        for (let i = 0; i < face.length; i++) {
          const a = face[i];
          const b = face[(i + 1) % face.length];
          faceEdgeSet.add(a < b ? `${a}_${b}` : `${b}_${a}`);
        }
        const triIndices = triangulateFaces([face], vertices);
        const seen = new Set<string>();
        for (let t = 0; t < triIndices.length; t += 3) {
          for (let e = 0; e < 3; e++) {
            const a = triIndices[t + e];
            const b = triIndices[t + (e + 1) % 3];
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            if (!faceEdgeSet.has(key) && !seen.has(key)) {
              seen.add(key);
              diagPos.push(
                vertices[a * 3], vertices[a * 3 + 1], vertices[a * 3 + 2],
                vertices[b * 3], vertices[b * 3 + 1], vertices[b * 3 + 2],
              );
            }
          }
        }
      }
      diagLines.geometry.setAttribute('position', new THREE.Float32BufferAttribute(diagPos, 3));
    };

    containerRef.current!.addEventListener('click', onClick);
    containerRef.current!.addEventListener('mousemove', onMouseMove);

    return () => {
      if (embossTimeoutId !== null) {
        window.clearTimeout(embossTimeoutId);
      }
      containerRef.current?.removeEventListener('click', onClick);
      containerRef.current?.removeEventListener('mousemove', onMouseMove);
    };
  }, [tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, faceHighlight, operators, palette, paletteColors, colorMode, edgeColor, embossEnabled, embossWidth, embossDepth, embossProfile, faceRoughness, generationOptions, mode, radialType, radialSides, finalization, fitRequestKey]);

  return <div id="canvas-container" ref={containerRef} className="w-full h-full" />;
};
