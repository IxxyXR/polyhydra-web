import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { installHtmlInCanvasPolyfill } from 'three-html-render/polyfill';
import { TilingGenerationOptions } from '../lib/tiling-geometries';
import { PaletteKey } from '../lib/palettes';
import { RadialBuildOptions, RadialPolyType } from '../lib/radial-solids';

import { OperatorSpec, RoleShapeBasis } from '../lib/conway-operators';
import { ColorMode } from '../lib/coloring';
import { StackItem } from '../lib/stack-items';
import type { MeshWorkRequest, MeshWorkResult } from '../workers/mesh-generation.worker';

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
// The XR panel shows the app's real sidebar: a portrait tablet-like plane.
const XR_PANEL_WIDTH_PX = 720;
const XR_PANEL_HEIGHT_PX = 1200;
const XR_PANEL_WORLD_WIDTH = 0.9;
const XR_PANEL_WORLD_HEIGHT = XR_PANEL_WORLD_WIDTH * (XR_PANEL_HEIGHT_PX / XR_PANEL_WIDTH_PX);
const XR_PANEL_IDLE_REPAINT_MS = 1000;
const XR_PANEL_HAND_SCALE = 0.18;
const XR_PANEL_HAND_LIFT = 0.18; // metres above the non-dominant grip
const XR_POINTER_LENGTH = 1.6;
const XR_POINTER_LINE_NAME = 'xr-controller-pointer-line';
const XR_PANEL_HOST_STYLE_ID = 'polyhydra-xr-html-panel-host-style';

if (typeof window !== 'undefined') {
  installHtmlInCanvasPolyfill();
}

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

interface XRPanelPointerState {
  pressed: boolean;
  pointerId: number;
  lastTarget: Element | null;
  lastPoint: { x: number; y: number } | null;
}

interface XRInputSourceLike {
  handedness?: string;
  gamepad?: {
    axes: readonly number[];
    buttons: ReadonlyArray<{ pressed: boolean }>;
  };
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

function ensureXRPanelHostStyle() {
  if (document.getElementById(XR_PANEL_HOST_STYLE_ID)) return;

  const style = document.createElement('style');
  style.id = XR_PANEL_HOST_STYLE_ID;
  style.textContent = `
canvas[layoutsubtree],
[data-html-in-canvas-host],
[data-polyhydra-xr-panel-host] {
  pointer-events: none !important;
}
.xr-only-control {
  display: none !important;
}
[data-polyhydra-xr-panel-host] .xr-only-control {
  display: inline-flex !important;
}
`;
  document.head.appendChild(style);
}

function clamp01(value: number) {
  return Math.min(Math.max(value, 0), 1);
}

function createXRControllerFallback() {
  const group = new THREE.Group();
  group.name = 'xr-controller-fallback-model';

  const bodyMaterial = new THREE.MeshStandardMaterial({
    color: 0x1f2937,
    roughness: 0.45,
    metalness: 0.15,
  });
  const accentMaterial = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    roughness: 0.5,
    metalness: 0,
  });
  accentMaterial.userData.isControllerAccent = true;

  const body = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.12, 0.18), bodyMaterial);
  body.position.set(0, -0.02, -0.035);
  body.rotation.x = -0.18;
  group.add(body);

  const trigger = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.04, 0.035), accentMaterial);
  trigger.position.set(0, -0.035, -0.13);
  group.add(trigger);

  return group;
}

function setXRControllerFallbackColor(group: THREE.Object3D, color: number) {
  group.traverse((child) => {
    const material = (child as THREE.Mesh).material;
    if (material instanceof THREE.MeshStandardMaterial && material.userData.isControllerAccent) {
      material.color.set(color);
    }
  });
}

function createXRControllerRay(color: number) {
  const geometry = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, 0, -XR_POINTER_LENGTH),
  ]);
  const material = new THREE.LineBasicMaterial({
    color,
    transparent: true,
    opacity: 0.82,
  });
  const line = new THREE.Line(geometry, material);
  line.name = XR_POINTER_LINE_NAME;
  return line;
}

function findLocalElementAt(root: HTMLElement, x: number, y: number) {
  const rootRect = root.getBoundingClientRect();
  const rootWidth = rootRect.width || root.offsetWidth;
  const rootHeight = rootRect.height || root.offsetHeight;

  if (rootWidth > 0 && rootHeight > 0) {
    const clientX = rootRect.left + (x / XR_PANEL_WIDTH_PX) * rootWidth;
    const clientY = rootRect.top + (y / XR_PANEL_HEIGHT_PX) * rootHeight;
    let best: Element | null = null;

    for (const element of root.querySelectorAll('*')) {
      const rect = element.getBoundingClientRect();
      if (
        rect.width <= 0
        || rect.height <= 0
        || clientX < rect.left
        || clientX > rect.right
        || clientY < rect.top
        || clientY > rect.bottom
      ) {
        continue;
      }

      const style = window.getComputedStyle(element);
      if (
        style.pointerEvents !== 'none'
        && style.visibility !== 'hidden'
        && style.display !== 'none'
        && style.opacity !== '0'
      ) {
        // querySelectorAll is document ordered, so later descendants and
        // overlays naturally replace their containing element.
        best = element;
      }
    }

    return best;
  }

  // Fallback for HTML-in-canvas implementations that do not expose client
  // rects. This preserves HTML control targeting; SVG targeting uses rects.
  let best: HTMLElement | null = null;
  const visit = (element: HTMLElement, originX: number, originY: number) => {
    const left = originX + element.offsetLeft - element.scrollLeft;
    const top = originY + element.offsetTop - element.scrollTop;
    if (
      element.offsetWidth > 0
      && element.offsetHeight > 0
      && x >= left
      && x <= left + element.offsetWidth
      && y >= top
      && y <= top + element.offsetHeight
    ) {
      const style = window.getComputedStyle(element);
      if (style.pointerEvents !== 'none' && style.visibility !== 'hidden' && style.display !== 'none') {
        best = element;
      }
      for (const child of element.children) {
        if (child instanceof HTMLElement) visit(child, left, top);
      }
    }
  };
  for (const child of root.children) {
    if (child instanceof HTMLElement) visit(child, 0, 0);
  }
  return best;
}

function setInputNativeValue(input: HTMLInputElement, value: string) {
  const descriptor = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value');
  descriptor?.set?.call(input, value);
}

type XREditableControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;

function isXREditableControl(element: Element): element is XREditableControl {
  if (element instanceof HTMLSelectElement || element instanceof HTMLTextAreaElement) return true;
  if (!(element instanceof HTMLInputElement)) return false;
  return ['color', 'email', 'number', 'search', 'tel', 'text', 'url'].includes(element.type);
}

function setControlNativeValue(control: XREditableControl, value: string) {
  const prototype = control instanceof HTMLSelectElement
    ? window.HTMLSelectElement.prototype
    : control instanceof HTMLTextAreaElement
      ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const descriptor = Object.getOwnPropertyDescriptor(prototype, 'value');
  descriptor?.set?.call(control, value);
  control.dispatchEvent(new Event('input', { bubbles: true }));
  control.dispatchEvent(new Event('change', { bubbles: true }));
}

function createXRControlEditor(
  panelElement: HTMLElement,
  control: XREditableControl,
  onClose: () => void,
) {
  const overlay = document.createElement('div');
  overlay.dataset.xrEditor = '';
  overlay.style.cssText = [
    'position:absolute',
    'inset:20px',
    'z-index:2147483646',
    'pointer-events:auto',
    'overflow:auto',
    'box-sizing:border-box',
    'padding:24px',
    'border:2px solid #3b82f6',
    'border-radius:20px',
    'background:#0a0a0af5',
    'color:#f5f5f5',
    'font:700 22px/1.3 system-ui,sans-serif',
  ].join(';');

  const title = document.createElement('div');
  title.textContent = control.getAttribute('aria-label')
    || control.closest('label')?.textContent?.trim().slice(0, 80)
    || 'Edit value';
  title.style.cssText = 'margin-bottom:18px;font-size:26px';
  overlay.appendChild(title);

  const button = (label: string, action: () => void, background = '#27272a') => {
    const element = document.createElement('button');
    element.type = 'button';
    element.textContent = label;
    element.style.cssText = `min-height:60px;padding:10px 14px;border:1px solid #52525b;border-radius:12px;background:${background};color:#fff;font:700 20px system-ui,sans-serif`;
    element.addEventListener('click', action);
    return element;
  };

  if (control instanceof HTMLSelectElement) {
    const options = document.createElement('div');
    options.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';
    for (const option of Array.from(control.options)) {
      if (option.disabled) continue;
      options.appendChild(button(
        option.text,
        () => {
          setControlNativeValue(control, option.value);
          onClose();
        },
        option.value === control.value ? '#1d4ed8' : '#27272a',
      ));
    }
    overlay.appendChild(options);
  } else if (control instanceof HTMLInputElement && control.type === 'color') {
    const colors = [
      '#ffffff', '#d4d4d8', '#71717a', '#18181b', '#ef4444', '#f97316',
      '#eab308', '#84cc16', '#22c55e', '#14b8a6', '#06b6d4', '#0ea5e9',
      '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef', '#ec4899',
    ];
    const swatches = document.createElement('div');
    swatches.style.cssText = 'display:grid;grid-template-columns:repeat(6,1fr);gap:12px';
    for (const color of colors) {
      const swatch = button(color, () => {
        setControlNativeValue(control, color);
        onClose();
      }, color);
      swatch.setAttribute('aria-label', `Set color ${color}`);
      swatch.style.color = ['#ffffff', '#d4d4d8', '#eab308', '#84cc16'].includes(color) ? '#111' : '#fff';
      swatches.appendChild(swatch);
    }
    overlay.appendChild(swatches);

    let hexDraft = control.value.replace(/^#/, '').toUpperCase();
    const hexDisplay = document.createElement('div');
    hexDisplay.style.cssText = 'margin:18px 0 10px;padding:10px;border:1px solid #52525b;border-radius:12px;background:#18181b;font:700 24px ui-monospace,monospace';
    const updateHexDisplay = () => {
      hexDisplay.textContent = `#${hexDraft}`;
    };
    updateHexDisplay();
    overlay.appendChild(hexDisplay);

    const hexKeys = document.createElement('div');
    hexKeys.style.cssText = 'display:grid;grid-template-columns:repeat(8,1fr);gap:8px';
    for (const key of '0123456789ABCDEF') {
      hexKeys.appendChild(button(key, () => {
        if (hexDraft.length < 6) hexDraft += key;
        updateHexDisplay();
      }));
    }
    hexKeys.appendChild(button('⌫', () => {
      hexDraft = hexDraft.slice(0, -1);
      updateHexDisplay();
    }));
    hexKeys.appendChild(button('Clear', () => {
      hexDraft = '';
      updateHexDisplay();
    }));
    hexKeys.appendChild(button('Apply hex', () => {
      if (/^[0-9A-F]{6}$/.test(hexDraft)) {
        setControlNativeValue(control, `#${hexDraft.toLowerCase()}`);
        onClose();
      }
    }, '#1d4ed8'));
    overlay.appendChild(hexKeys);
  } else {
    let draft = control.value;
    let lowerCase = false;
    const display = document.createElement('div');
    display.style.cssText = 'min-height:64px;margin-bottom:16px;padding:12px;border:1px solid #52525b;border-radius:12px;background:#18181b;font:600 22px ui-monospace,monospace;overflow-wrap:anywhere';
    const updateDisplay = () => {
      display.textContent = draft || ' ';
    };
    updateDisplay();
    overlay.appendChild(display);

    const keys = document.createElement('div');
    keys.style.cssText = 'display:grid;grid-template-columns:repeat(10,1fr);gap:7px';
    const letterButtons: HTMLButtonElement[] = [];
    for (const key of 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_,.!/() ') {
      const keyButton = button(key === ' ' ? 'Space' : key, () => {
        draft += lowerCase ? key.toLowerCase() : key;
        updateDisplay();
      });
      keyButton.dataset.baseKey = key;
      if (/[A-Z]/.test(key)) letterButtons.push(keyButton);
      if (key === ' ') keyButton.style.gridColumn = 'span 3';
      keys.appendChild(keyButton);
    }
    overlay.appendChild(keys);

    const actions = document.createElement('div');
    actions.style.cssText = 'display:grid;grid-template-columns:repeat(5,1fr);gap:10px;margin-top:18px';
    actions.appendChild(button('Aa', () => {
      lowerCase = !lowerCase;
      for (const keyButton of letterButtons) {
        const baseKey = keyButton.dataset.baseKey ?? '';
        keyButton.textContent = lowerCase ? baseKey.toLowerCase() : baseKey;
      }
    }));
    actions.appendChild(button('⌫', () => {
      draft = draft.slice(0, -1);
      updateDisplay();
    }));
    actions.appendChild(button('Clear', () => {
      draft = '';
      updateDisplay();
    }));
    actions.appendChild(button('Cancel', onClose, '#3f3f46'));
    actions.appendChild(button('Done', () => {
      setControlNativeValue(control, draft);
      onClose();
    }, '#1d4ed8'));
    overlay.appendChild(actions);
  }

  if (!(control instanceof HTMLSelectElement) && !(control instanceof HTMLInputElement && control.type === 'color')) {
    panelElement.appendChild(overlay);
    return overlay;
  }

  const footer = document.createElement('div');
  footer.style.cssText = 'margin-top:18px';
  footer.appendChild(button('Cancel', onClose, '#3f3f46'));
  overlay.appendChild(footer);
  panelElement.appendChild(overlay);
  return overlay;
}

function updateRangeInputFromLocalPoint(panelElement: HTMLElement, input: HTMLInputElement, localX: number) {
  const min = Number.parseFloat(input.min || '0');
  const max = Number.parseFloat(input.max || '100');
  const step = Number.parseFloat(input.step || '1');
  const panelRect = panelElement.getBoundingClientRect();
  const inputRect = input.getBoundingClientRect();
  const canUseClientRects = panelRect.width > 0 && inputRect.width > 0;
  const left = canUseClientRects
    ? ((inputRect.left - panelRect.left) / panelRect.width) * XR_PANEL_WIDTH_PX
    : getElementLocalOffset(input, panelElement).x;
  const width = canUseClientRects
    ? (inputRect.width / panelRect.width) * XR_PANEL_WIDTH_PX
    : input.offsetWidth;
  const normalized = clamp01((localX - left) / Math.max(width, 1));
  const rawValue = min + (max - min) * normalized;
  const stepped = Number.isFinite(step) && step > 0
    ? Math.round(rawValue / step) * step
    : rawValue;
  const clamped = Math.min(Math.max(stepped, min), max);
  setInputNativeValue(input, String(clamped));
  input.dispatchEvent(new Event('input', { bubbles: true }));
  input.dispatchEvent(new Event('change', { bubbles: true }));
}

function getElementLocalOffset(element: HTMLElement, stopAt: HTMLElement) {
  let x = 0;
  let y = 0;
  let current: HTMLElement | null = element;

  while (current && current !== stopAt) {
    x += current.offsetLeft - current.scrollLeft;
    y += current.offsetTop - current.scrollTop;
    current = current.offsetParent as HTMLElement | null;
  }

  return { x, y };
}

function dispatchLocalPointerEvent(
  panelElement: HTMLElement,
  pointerState: XRPanelPointerState,
  type: 'pointermove' | 'pointerdown' | 'pointerup' | 'click',
  point: { x: number; y: number },
  onEditRequest: (control: XREditableControl) => void,
  onVisualChange: () => void,
) {
  const target = findLocalElementAt(panelElement, point.x, point.y) ?? panelElement;
  const targetElement = target instanceof HTMLInputElement && target.type === 'range'
    ? target
    : target.closest('button, input, select, textarea, a[href], [role="button"], [tabindex]') ?? target;

  if (type === 'pointermove' && pointerState.lastTarget !== targetElement) {
    if (pointerState.lastTarget) {
      pointerState.lastTarget.dispatchEvent(new PointerEvent('pointerout', {
        bubbles: true,
        pointerId: pointerState.pointerId,
        pointerType: 'xr',
      }));
      pointerState.lastTarget.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    }
    targetElement.dispatchEvent(new PointerEvent('pointerover', {
      bubbles: true,
      pointerId: pointerState.pointerId,
      pointerType: 'xr',
    }));
    targetElement.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    onVisualChange();
  }

  if (targetElement instanceof HTMLInputElement && targetElement.type === 'range' && (type === 'pointerdown' || type === 'pointermove')) {
    updateRangeInputFromLocalPoint(panelElement, targetElement, point.x);
  }

  if (type === 'click') {
    if (targetElement.matches(':disabled')) {
      // Match native pointer behavior for disabled form controls.
    } else if (isXREditableControl(targetElement)) {
      onEditRequest(targetElement);
    } else {
      // A click is already a mouse-compatible event. Dispatching both a
      // PointerEvent("click") and MouseEvent("click") invokes React twice.
      targetElement.dispatchEvent(new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
        clientX: point.x,
        clientY: point.y,
      }));
    }
  } else {
    targetElement.dispatchEvent(new PointerEvent(type, {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
      pointerId: pointerState.pointerId,
      pointerType: 'xr',
      isPrimary: true,
    }));
  }

  if (type === 'pointermove') {
    targetElement.dispatchEvent(new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      clientX: point.x,
      clientY: point.y,
    }));
  }

  pointerState.lastTarget = targetElement;
  pointerState.lastPoint = point;
}

function clearLocalPointerTarget(pointerState: XRPanelPointerState, onVisualChange: () => void) {
  if (!pointerState.lastTarget) return;
  pointerState.lastTarget.dispatchEvent(new PointerEvent('pointerout', {
    bubbles: true,
    pointerId: pointerState.pointerId,
    pointerType: 'xr',
  }));
  pointerState.lastTarget.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
  pointerState.lastTarget = null;
  onVisualChange();
}

interface TilingCanvasProps {
  tilingType: string;
  rows: number;
  cols: number;
  showEdges: boolean;
  showVertices: boolean;
  showFaces: boolean;
  wireframe: boolean;
  operators: Array<OperatorSpec | StackItem>;
  palette: PaletteKey;
  paletteColors?: string[];
  colorMode: ColorMode;
  roleColorCount?: number;
  roleGeometryDetail?: number;
  roleShapeBasis?: RoleShapeBasis;
  sideModulo?: number;
  sideOffset?: number;
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
  radialBuildOptions?: RadialBuildOptions;
  fitRequestKey?: number;
  autoRotate?: boolean;
  onGeometryGenerationChange?: (isGenerating: boolean) => void;
}

export interface TilingCanvasHandle {
  enterWebXR: () => Promise<void>;
  isWebXRSupported: () => Promise<boolean>;
  fitToExtents: () => void;
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
  roleColorCount,
  roleGeometryDetail,
  roleShapeBasis,
  sideModulo,
  sideOffset,
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
  radialBuildOptions,
  fitRequestKey = 0,
  autoRotate = false,
  onGeometryGenerationChange,
}, ref) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const fitAnimationRef = useRef<FitAnimationState | null>(null);
  const lastHandledFitRequestKeyRef = useRef(0);
  const meshBoundsRef = useRef<MeshBounds | null>(null);
  const meshWorkerRef = useRef<Worker | null>(null);
  const meshRequestIdRef = useRef(0);
  const sceneRef = useRef<{
    scene: THREE.Scene;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
    controls: OrbitControls;
    meshGroup: THREE.Group;
    ambientLight: THREE.AmbientLight;
    directLight: THREE.DirectionalLight;
    xrRig: THREE.Group;
    xrPanelMesh: THREE.Mesh;
    xrPanelElement: HTMLElement;
    xrPanelHostCanvas: HTMLCanvasElement;
    xrPanelTexture: THREE.Texture;
    raycaster: THREE.Raycaster;
    controllerPointerStates: XRPanelPointerState[];
  } | null>(null);

  useImperativeHandle(ref, () => ({
    enterWebXR: async () => {
      if (!sceneRef.current) {
        throw new Error('Renderer is not ready yet.');
      }

      const xr = navigator.xr;
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
      const xr = navigator.xr;
      if (!xr?.requestSession) return false;
      if (!xr.isSessionSupported) return true;
      return xr.isSessionSupported('immersive-vr');
    },
    fitToExtents: () => {
      if (meshBoundsRef.current) {
        fitCameraToBounds(meshBoundsRef.current);
      }
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
    ensureXRPanelHostStyle();

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

    const xrPanelHostCanvas = document.createElement('canvas');
    xrPanelHostCanvas.setAttribute('layoutsubtree', '');
    xrPanelHostCanvas.width = XR_PANEL_WIDTH_PX;
    xrPanelHostCanvas.height = XR_PANEL_HEIGHT_PX;
    xrPanelHostCanvas.style.position = 'absolute';
    xrPanelHostCanvas.style.left = '-10000px';
    xrPanelHostCanvas.style.top = '0';
    xrPanelHostCanvas.style.width = `${XR_PANEL_WIDTH_PX}px`;
    xrPanelHostCanvas.style.height = `${XR_PANEL_HEIGHT_PX}px`;
    xrPanelHostCanvas.style.pointerEvents = 'none';
    xrPanelHostCanvas.style.opacity = '0';
    containerRef.current.appendChild(xrPanelHostCanvas);
    const xrPanelElement = document.createElement('div');
    xrPanelElement.setAttribute('data-polyhydra-xr-panel-host', '');
    xrPanelElement.setAttribute('aria-hidden', 'true');
    xrPanelElement.style.width = `${XR_PANEL_WIDTH_PX}px`;
    xrPanelElement.style.height = `${XR_PANEL_HEIGHT_PX}px`;
    xrPanelElement.style.setProperty('pointer-events', 'none', 'important');
    xrPanelElement.style.position = 'absolute';
    xrPanelElement.style.left = '0';
    xrPanelElement.style.top = '0';
    xrPanelElement.style.overflow = 'auto';
    xrPanelHostCanvas.appendChild(xrPanelElement);

    // The XR panel mirrors the app's real sidebar. On session start the live
    // sidebar DOM (id="app-sidebar") is reparented into the offscreen host so
    // the HTMLTexture paints it; on session end it moves back. React keeps
    // updating the subtree wherever it lives, so XR and desktop share state.
    let panelPaintRequested = true;
    let lastPanelPaintTime = 0;
    const markPanelDirty = () => { panelPaintRequested = true; };
    const panelMutationObserver = new MutationObserver(markPanelDirty);
    panelMutationObserver.observe(xrPanelElement, {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    // Range/text input values and scroll positions change without DOM mutations.
    xrPanelElement.addEventListener('input', markPanelDirty, true);
    xrPanelElement.addEventListener('change', markPanelDirty, true);
    xrPanelElement.addEventListener('scroll', markPanelDirty, true);

    // In-headset debug readout: the Quest console isn't reachable remotely,
    // so surface input state directly on the panel texture.
    const xrDebugStrip = document.createElement('div');
    xrDebugStrip.style.cssText =
      'position:absolute;top:0;left:0;right:0;z-index:2147483647;font:bold 20px monospace;color:#4ade80;background:#000c;padding:4px 8px;white-space:pre;pointer-events:none;';
    xrDebugStrip.textContent = '[PXR] waiting for input…';
    xrPanelElement.appendChild(xrDebugStrip);
    let xrSessionStatus = '';
    let lastXRDebugText = '';
    const setXRDebug = (text: string) => {
      const nextText = `[PXR] ${xrSessionStatus}\n${text}`;
      if (nextText === lastXRDebugText) return;
      lastXRDebugText = nextText;
      xrDebugStrip.textContent = nextText;
      markPanelDirty();
    };
    let activeEditor: HTMLElement | null = null;
    const closeXRControlEditor = () => {
      activeEditor?.remove();
      activeEditor = null;
      markPanelDirty();
    };
    const openXRControlEditor = (control: XREditableControl) => {
      closeXRControlEditor();
      activeEditor = createXRControlEditor(xrPanelElement, control, closeXRControlEditor);
      markPanelDirty();
    };

    let sidebarHome: { parent: HTMLElement; nextSibling: Node | null; inlineStyle: string } | null = null;
    const adoptSidebarForXR = () => {
      // The polyfill reparents canvas children into a host div it appends to
      // document.body — outside the React root, so bubbled events never reach
      // React's delegated listeners and onClick/onChange stay dead. Move the
      // host inside the React tree (registration is async, and the polyfill's
      // parentElement override hides the host, so find it by attribute here
      // at session start rather than at canvas creation).
      // Several hosts can exist (StrictMode's first mount leaks one), so pick
      // the one that really contains our panel element — div.contains is not
      // overridden by the polyfill, unlike parentElement.
      const allHosts = Array.from(document.querySelectorAll('div[data-html-in-canvas-host]'));
      const polyfillHost = allHosts.find((host) => host.contains(xrPanelElement));
      const reactRoot = document.getElementById('root');
      let relocated = false;
      if (
        polyfillHost instanceof HTMLElement
        && containerRef.current
        && polyfillHost.parentElement !== containerRef.current
      ) {
        containerRef.current.appendChild(polyfillHost);
        relocated = true;
      }
      const hostInReactRoot = Boolean(polyfillHost && reactRoot?.contains(polyfillHost));
      xrSessionStatus =
        `hosts=${allHosts.length} found=${Boolean(polyfillHost)} relocated=${relocated} inRoot=${hostInReactRoot} cont=${Boolean(containerRef.current)}`;
      xrDebugStrip.textContent = `[PXR] ${xrSessionStatus}\nsidebar adopting…`;
      const sidebar = document.getElementById('app-sidebar');
      if (!sidebar || !sidebar.parentElement || sidebarHome) return;
      sidebarHome = {
        parent: sidebar.parentElement,
        nextSibling: sidebar.nextSibling,
        inlineStyle: sidebar.getAttribute('style') ?? '',
      };
      sidebar.style.width = '100%';
      sidebar.style.height = '100%';
      sidebar.style.maxWidth = 'none';
      // Re-enable hit-testing under the host's pointer-events:none (the panel
      // element is only reachable via synthetic XR pointer events anyway).
      sidebar.style.pointerEvents = 'auto';
      xrPanelElement.appendChild(sidebar);
      markPanelDirty();
    };
    const releaseSidebarFromXR = () => {
      closeXRControlEditor();
      if (!sidebarHome) return;
      const sidebar = document.getElementById('app-sidebar');
      const home = sidebarHome;
      sidebarHome = null;
      if (!sidebar) return;
      if (home.inlineStyle) {
        sidebar.setAttribute('style', home.inlineStyle);
      } else {
        sidebar.removeAttribute('style');
      }
      home.parent.insertBefore(sidebar, home.nextSibling);
    };
    const logSessionInputSources = () => {
      const session = renderer.xr.getSession();
      const describe = () => {
        const sources = session ? Array.from(session.inputSources) : [];
        console.info(
          `[PXR-INPUT] session inputSources=${sources.length}: ` +
            sources
              .map((s) => `${s.handedness}/${s.targetRayMode}/gamepad=${Boolean(s.gamepad)}/hand=${Boolean(s.hand)}`)
              .join(', '),
        );
      };
      describe();
      session?.addEventListener('inputsourceschange', describe);
    };
    renderer.xr.addEventListener('sessionstart', adoptSidebarForXR);
    renderer.xr.addEventListener('sessionstart', logSessionInputSources);
    renderer.xr.addEventListener('sessionend', releaseSidebarFromXR);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.autoRotateSpeed = 1.5;

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

    const xrPanelTexture = new THREE.HTMLTexture(xrPanelElement);
    xrPanelTexture.colorSpace = THREE.SRGBColorSpace;
    const xrPanelMaterial = new THREE.MeshBasicMaterial({
      map: xrPanelTexture,
      transparent: true,
      side: THREE.FrontSide,
      toneMapped: false,
    });
    const xrPanelMesh = new THREE.Mesh(
      new THREE.PlaneGeometry(XR_PANEL_WORLD_WIDTH, XR_PANEL_WORLD_HEIGHT),
      xrPanelMaterial,
    );
    xrPanelMesh.name = 'polyhydra-xr-html-panel';
    xrPanelMesh.position.set(0, 1.2, -1.35);
    xrPanelMesh.visible = false;
    xrRig.add(xrPanelMesh);

    // Aiming feedback: a small dot rendered where a controller ray meets the
    // panel, drawn on top so it never hides behind the panel surface.
    const xrPanelCursor = new THREE.Mesh(
      new THREE.SphereGeometry(0.003, 12, 12),
      new THREE.MeshBasicMaterial({ color: 0xffffff, depthTest: false, depthWrite: false }),
    );
    xrPanelCursor.renderOrder = 999;
    xrPanelCursor.visible = false;
    scene.add(xrPanelCursor);

    const controllerModelFactory = new XRControllerModelFactory();
    const controllerEventCleanups: Array<() => void> = [];
    const controllerRays: THREE.Line[] = [];
    const controllerAimFallbacks: THREE.Group[] = [];
    for (let index = 0; index < 2; index++) {
      const controller = renderer.xr.getController(index);
      controller.name = `xr-controller-${index}`;
      const ray = createXRControllerRay(index === 0 ? 0x38bdf8 : 0xf97316);
      ray.visible = false;
      controllerRays.push(ray);
      controller.add(ray);
      const aimFallback = createXRControllerFallback();
      aimFallback.name = 'xr-controller-target-ray-fallback-model';
      aimFallback.position.set(0, -0.035, -0.08);
      aimFallback.rotation.x = -0.35;
      aimFallback.scale.setScalar(0.72);
      aimFallback.visible = false;
      controllerAimFallbacks.push(aimFallback);
      controller.add(aimFallback);
      const handleConnected = (event: any) => {
        const handedness = event.data?.handedness;
        console.info(
          `[PXR-INPUT] controller ${index} connected: handedness=${handedness ?? 'none'} targetRayMode=${event.data?.targetRayMode ?? 'unknown'} gamepad=${Boolean(event.data?.gamepad)} hand=${Boolean(event.data?.hand)}`,
        );
        controller.userData.inputSource = event.data;
        const color = handedness === 'right' ? 0xf97316 : 0x38bdf8;
        const material = ray.material as THREE.LineBasicMaterial;
        material.color.set(color);
        setXRControllerFallbackColor(aimFallback, color);
        ray.visible = true;
        aimFallback.visible = true;
      };
      const handleDisconnected = () => {
        console.info(`[PXR-INPUT] controller ${index} disconnected`);
        delete controller.userData.inputSource;
        controller.userData.selectPressed = false;
        ray.visible = false;
        aimFallback.visible = false;
      };
      // WebXR 'select' events are the spec-guaranteed primary action; polling
      // gamepad.buttons[0] alone fails when the 'connected' payload never
      // arrives (seen on Quest browser), so track both.
      const handleSelectStart = () => {
        controller.userData.selectPressed = true;
        setXRDebug(`controller ${index} selectstart`);
      };
      const handleSelectEnd = () => {
        controller.userData.selectPressed = false;
        setXRDebug(`controller ${index} selectend`);
      };
      controller.addEventListener('connected', handleConnected);
      controller.addEventListener('disconnected', handleDisconnected);
      controller.addEventListener('selectstart', handleSelectStart);
      controller.addEventListener('selectend', handleSelectEnd);
      controllerEventCleanups.push(() => {
        controller.removeEventListener('connected', handleConnected);
        controller.removeEventListener('disconnected', handleDisconnected);
        controller.removeEventListener('selectstart', handleSelectStart);
        controller.removeEventListener('selectend', handleSelectEnd);
      });
      xrRig.add(controller);

      const grip = renderer.xr.getControllerGrip(index);
      grip.name = `xr-controller-grip-${index}`;
      grip.add(controllerModelFactory.createControllerModel(grip));
      const gripFallback = createXRControllerFallback();
      setXRControllerFallbackColor(gripFallback, index === 0 ? 0x38bdf8 : 0xf97316);
      grip.add(gripFallback);
      xrRig.add(grip);
    }

    const raycaster = new THREE.Raycaster();
    const controllerPointerStates: XRPanelPointerState[] = [
      { pressed: false, pointerId: 101, lastTarget: null, lastPoint: null },
      { pressed: false, pointerId: 102, lastTarget: null, lastPoint: null },
    ];
    const resetXRInputState = () => {
      for (let index = 0; index < 2; index++) {
        renderer.xr.getController(index).userData.selectPressed = false;
      }
      controllerPointerStates.forEach((pointerState) => {
        clearLocalPointerTarget(pointerState, markPanelDirty);
        pointerState.pressed = false;
        pointerState.lastPoint = null;
      });
    };
    renderer.xr.addEventListener('sessionend', resetXRInputState);

    // Debug hook: lets the desktop-Chrome session be inspected live (controller
    // world poses, ray visibility, panel transform) without a headset console.
    const xrDebugHook = {
      getControllerWorldPos: () => [0, 1].map((i) => {
        const c = renderer.xr.getController(i);
        const p = new THREE.Vector3();
        c.getWorldPosition(p);
        return {
          index: i,
          pos: [p.x, p.y, p.z].map((n) => Number(n.toFixed(3))),
          rayVisible: controllerRays[i]?.visible,
          matrixIsIdentity: c.matrixWorld.equals(new THREE.Matrix4()),
          connected: Boolean(c.userData.inputSource),
        };
      }),
      getPanelWorldPos: () => {
        const p = new THREE.Vector3();
        xrPanelMesh.getWorldPosition(p);
        return { pos: [p.x, p.y, p.z].map((n) => Number(n.toFixed(3))), visible: xrPanelMesh.visible };
      },
      getRigPos: () => [xrRig.position.x, xrRig.position.y, xrRig.position.z].map((n) => Number(n.toFixed(3))),
    };
    (window as any).__xr = xrDebugHook;

    sceneRef.current = {
      scene,
      camera,
      renderer,
      controls,
      meshGroup,
      ambientLight,
      directLight,
      xrRig,
      xrPanelMesh,
      xrPanelElement,
      xrPanelHostCanvas,
      xrPanelTexture,
      raycaster,
      controllerPointerStates,
    };

    // The html-in-canvas polyfill schedules DOM sync + rasterization via
    // window.requestAnimationFrame, which browsers stop firing during an
    // immersive session (the 2D page is hidden), freezing the panel texture.
    // Shim rAF so queued callbacks can be pumped from the XR frame loop.
    const originalRAF = window.requestAnimationFrame.bind(window);
    const originalCAF = window.cancelAnimationFrame.bind(window);
    const pendingRafCallbacks = new Map<number, FrameRequestCallback>();
    window.requestAnimationFrame = (callback: FrameRequestCallback) => {
      const handle = originalRAF((time: number) => {
        pendingRafCallbacks.delete(handle);
        callback(time);
      });
      pendingRafCallbacks.set(handle, callback);
      return handle;
    };
    window.cancelAnimationFrame = (handle: number) => {
      pendingRafCallbacks.delete(handle);
      originalCAF(handle);
    };
    const restoreRafShim = () => {
      window.requestAnimationFrame = originalRAF;
      window.cancelAnimationFrame = originalCAF;
      pendingRafCallbacks.clear();
    };

    const tempMatrix = new THREE.Matrix4();
    const tempVec = new THREE.Vector3();
    let xrDownCount = 0;
    let xrClickCount = 0;
    const animate = () => {
      if (renderer.xr.isPresenting) {
        if (pendingRafCallbacks.size > 0) {
          const entries = Array.from(pendingRafCallbacks.entries());
          pendingRafCallbacks.clear();
          const time = performance.now();
          for (const [handle, callback] of entries) {
            originalCAF(handle);
            try {
              callback(time);
            } catch (error) {
              console.error('[PXR] pumped rAF callback threw', error);
            }
          }
        }
        // Repaint the HTML texture only when the panel DOM actually changed
        // (plus a slow heartbeat) — per-frame painting is the main XR perf drain.
        const now = performance.now();
        if (panelPaintRequested || now - lastPanelPaintTime > XR_PANEL_IDLE_REPAINT_MS) {
          panelPaintRequested = false;
          lastPanelPaintTime = now;
          xrPanelTexture.needsUpdate = true;
          (xrPanelHostCanvas as any).requestPaint?.();
        }
        xrPanelMesh.visible = true;
        // Failsafe: show pointer visuals even when three's 'connected' event
        // never fired (some browsers only surface input sources after a grab).
        controllerRays.forEach((ray) => { ray.visible = true; });
        controllerAimFallbacks.forEach((fallback) => { fallback.visible = true; });
        const session = renderer.xr.getSession();
        if (session) {
          let moveX = 0;
          let moveZ = 0;
          let moveY = 0;

          // Fall back to session.inputSources by index when the 'connected'
          // event payload never arrived (three matches them in the same order).
          const resolveInputSource = (index: number) =>
            (renderer.xr.getController(index).userData.inputSource
              ?? session.inputSources[index]) as XRInputSourceLike | undefined;

          // Float the panel above the non-dominant (left) hand, facing the
          // viewer; until handedness is known keep the fixed spot on the rig.
          let leftGripIndex = -1;
          for (let index = 0; index < 2; index++) {
            if (resolveInputSource(index)?.handedness === 'left') {
              leftGripIndex = index;
              break;
            }
          }
          if (leftGripIndex >= 0) {
            const grip = renderer.xr.getControllerGrip(leftGripIndex);
            xrPanelMesh.scale.setScalar(XR_PANEL_HAND_SCALE);
            xrPanelMesh.position.set(grip.position.x, grip.position.y + XR_PANEL_HAND_LIFT, grip.position.z);
            xrPanelMesh.lookAt(camera.getWorldPosition(tempVec));
          } else {
            xrPanelMesh.scale.setScalar(1);
            xrPanelMesh.position.set(0, 1.2, -1.35);
            xrPanelMesh.quaternion.identity();
          }
          xrPanelMesh.updateMatrixWorld();

          const panelPointedByHand = new Set<string>();

          for (let index = 0; index < 2; index++) {
            const controller = renderer.xr.getController(index);
            tempMatrix.identity().extractRotation(controller.matrixWorld);
            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
            if (raycaster.intersectObject(xrPanelMesh, false).length > 0) {
              const source = resolveInputSource(index);
              panelPointedByHand.add(source?.handedness ?? `controller-${index}`);
            }
          }

          for (const source of session.inputSources) {
            if (source.gamepad) {
              const axes = source.gamepad.axes;
              const buttons = source.gamepad.buttons;

              if (source.handedness === 'left') {
                const x = (axes[0] || 0) + (axes[2] || 0);
                const z = (axes[1] || 0) + (axes[3] || 0);

                if (panelPointedByHand.size > 0) {
                  if (Math.abs(z) > 0.25) {
                    const scroller = xrPanelElement.querySelector('[data-xr-scroll]') ?? xrPanelElement;
                    scroller.scrollTop += z * 18;
                    markPanelDirty();
                  }
                } else {
                  if (Math.abs(x) > 0.1) moveX += x;
                  if (Math.abs(z) > 0.1) moveZ += z;
                }
              }

              if (buttons[1] && buttons[1].pressed) {
                if (source.handedness === 'left') moveY -= 1;
                if (source.handedness === 'right') moveY += 1;
              }
            }
          }

          let panelCursorSet = false;
          for (let index = 0; index < 2; index++) {
            const controller = renderer.xr.getController(index);
            const pointerState = controllerPointerStates[index];
            const source = resolveInputSource(index);
            const pressed = controller.userData.selectPressed === true
              || Boolean(source?.gamepad?.buttons?.[0]?.pressed);

            tempMatrix.identity().extractRotation(controller.matrixWorld);
            raycaster.ray.origin.setFromMatrixPosition(controller.matrixWorld);
            raycaster.ray.direction.set(0, 0, -1).applyMatrix4(tempMatrix);
            const [hit] = raycaster.intersectObject(xrPanelMesh, false);
            // Stop the pointer line at the panel instead of passing through it.
            controllerRays[index].scale.z = hit ? hit.distance / XR_POINTER_LENGTH : 1;

            if (hit?.uv) {
              xrPanelCursor.position.copy(hit.point);
              panelCursorSet = true;
              const point = {
                x: hit.uv.x * XR_PANEL_WIDTH_PX,
                y: (1 - hit.uv.y) * XR_PANEL_HEIGHT_PX,
              };
              dispatchLocalPointerEvent(
                xrPanelElement,
                pointerState,
                'pointermove',
                point,
                openXRControlEditor,
                markPanelDirty,
              );

              if (pressed && !pointerState.pressed) {
                xrDownCount++;
                dispatchLocalPointerEvent(
                  xrPanelElement,
                  pointerState,
                  'pointerdown',
                  point,
                  openXRControlEditor,
                  markPanelDirty,
                );
              } else if (!pressed && pointerState.pressed) {
                dispatchLocalPointerEvent(
                  xrPanelElement,
                  pointerState,
                  'pointerup',
                  point,
                  openXRControlEditor,
                  markPanelDirty,
                );
                dispatchLocalPointerEvent(
                  xrPanelElement,
                  pointerState,
                  'click',
                  point,
                  openXRControlEditor,
                  markPanelDirty,
                );
                xrClickCount++;
              }
              pointerState.pressed = pressed;
              // Always-live readout: pressed state, button count, and running
              // down/click totals disambiguate trigger-detection vs dispatch.
              const btnCount = source?.gamepad?.buttons?.length ?? 0;
              const b0 = Boolean(source?.gamepad?.buttons?.[0]?.pressed);
              setXRDebug(
                `c${index} pressed=${pressed} sel=${controller.userData.selectPressed === true} gp=${Boolean(source?.gamepad)} btns=${btnCount} b0=${b0} down=${xrDownCount} click=${xrClickCount} → ${pointerState.lastTarget?.tagName ?? '?'}`,
              );
            } else {
              clearLocalPointerTarget(pointerState, markPanelDirty);
              if (!pressed && pointerState.pressed && pointerState.lastPoint) {
                dispatchLocalPointerEvent(
                  xrPanelElement,
                  pointerState,
                  'pointerup',
                  pointerState.lastPoint,
                  openXRControlEditor,
                  markPanelDirty,
                );
                pointerState.lastTarget = null;
                pointerState.lastPoint = null;
              }
              pointerState.pressed = pressed;
            }
          }
          xrPanelCursor.visible = panelCursorSet;

          if (moveX !== 0 || moveZ !== 0 || moveY !== 0) {
            const speed = 0.02; // Reduced speed slightly for comfort
            
            const xrCamera = renderer.xr.getCamera();
            
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
      } else {
        xrPanelMesh.visible = false;
        xrPanelCursor.visible = false;
        controllerPointerStates.forEach((pointerState) => {
          pointerState.pressed = false;
          pointerState.lastTarget = null;
          pointerState.lastPoint = null;
        });
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
    const resizeObserver = new ResizeObserver(handleResize);
    resizeObserver.observe(containerRef.current);

    return () => {
      if ((window as any).__xr === xrDebugHook) {
        delete (window as any).__xr;
      }
      resizeObserver.disconnect();
      window.removeEventListener('resize', handleResize);
      controls.removeEventListener('start', handleControlsStart);
      restoreRafShim();
      controllerEventCleanups.forEach((cleanup) => cleanup());
      fitAnimationRef.current = null;
      renderer.xr.removeEventListener('sessionstart', adoptSidebarForXR);
      renderer.xr.removeEventListener('sessionstart', logSessionInputSources);
      renderer.xr.removeEventListener('sessionend', releaseSidebarFromXR);
      renderer.xr.removeEventListener('sessionend', resetXRInputState);
      releaseSidebarFromXR();
      panelMutationObserver.disconnect();
      xrPanelMesh.geometry.dispose();
      disposeMaterialResources(xrPanelMesh.material);
      xrPanelCursor.geometry.dispose();
      disposeMaterialResources(xrPanelCursor.material);
      xrPanelTexture.dispose();
      renderer.setAnimationLoop(null);
      renderer.dispose();
      renderer.domElement.remove();
      // Removing the attribute (not just the node) makes the polyfill tear
      // down its body-level host div; plain .remove() leaks it, which is how
      // StrictMode's first mount left a stale host behind.
      xrPanelHostCanvas.removeAttribute('layoutsubtree');
      xrPanelHostCanvas.remove();
    };
  }, []);

  useEffect(() => {
    if (!sceneRef.current) return;
    sceneRef.current.controls.autoRotate = autoRotate;
  }, [autoRotate]);

  useEffect(() => {
    if (!sceneRef.current) return;

    const { ambientLight, directLight } = sceneRef.current;
    ambientLight.intensity = ambientLightIntensity;
    directLight.intensity = keyLightIntensity;
    updateKeyLightPosition(directLight, keyLightAzimuth, keyLightElevation);
  }, [ambientLightIntensity, keyLightIntensity, keyLightAzimuth, keyLightElevation]);

  useEffect(() => () => {
    meshWorkerRef.current?.terminate();
    meshWorkerRef.current = null;
  }, []);

  useEffect(() => {
    if (!sceneRef.current) {
      onGeometryGenerationChange?.(false);
      return;
    }

    let embossTimeoutId: number | null = null;
    let cancelled = false;
    onGeometryGenerationChange?.(true);

    if (!meshWorkerRef.current) {
      meshWorkerRef.current = new Worker(
        new URL('../workers/mesh-generation.worker.ts', import.meta.url),
        { type: 'module' },
      );
    }
    const worker = meshWorkerRef.current;
    const requestId = ++meshRequestIdRef.current;

    const handleWorkerMessage = (event: MessageEvent<MeshWorkResult>) => {
      if (event.data.requestId !== requestId) return;
      worker.removeEventListener('message', handleWorkerMessage);
      if (cancelled || !sceneRef.current) return;

      try {
      const { payload, error } = event.data;
      if (error) {
        console.warn('Mesh generation failed:', error);
        return;
      }
      if (!payload) return;
      const { vertices, faces, faceColors: computedFaceColors, faceTriangulations, stats } = payload;
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

      meshBoundsRef.current = computeMeshBounds(vertices);

      const updateStat = (ids: string[], value: string) => {
        ids.forEach((id) => {
          const element = document.getElementById(id);
          if (element) element.innerText = value;
        });
      };
      updateStat(['stat-colors'], stats.colorCount.toString());
      updateStat(['stat-vertices'], stats.vertexCount.toString());
      updateStat(['stat-faces'], stats.faceCount.toString());
      updateStat(['stat-edges'], stats.edgeCount.toString());

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
    };

    const handleWorkerError = (event: ErrorEvent) => {
      console.warn('Mesh generation worker error:', event.message);
      worker.removeEventListener('message', handleWorkerMessage);
      worker.removeEventListener('error', handleWorkerError);
      if (!cancelled) {
        onGeometryGenerationChange?.(false);
      }
    };

    worker.addEventListener('message', handleWorkerMessage);
    worker.addEventListener('error', handleWorkerError);
    worker.postMessage({
      requestId,
      meshOptions: {
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
      },
      palette: paletteColors ?? palette,
      colorMode,
      colorOptions: { roleColorCount, sideModulo, sideOffset },
    } satisfies MeshWorkRequest);

    return () => {
      cancelled = true;
      worker.removeEventListener('message', handleWorkerMessage);
      worker.removeEventListener('error', handleWorkerError);
      if (embossTimeoutId !== null) {
        window.clearTimeout(embossTimeoutId);
      }
    };
  }, [tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, operators, palette, paletteColors, colorMode, roleColorCount, roleGeometryDetail, roleShapeBasis, sideModulo, sideOffset, edgeColor, embossEnabled, embossWidth, embossDepth, embossSmoothness, faceRoughness, faceOpacity, generationOptions, mode, radialType, radialSides, radialBuildOptions, fitRequestKey, onGeometryGenerationChange]);

  return <div id="canvas-container" ref={containerRef} className="w-full h-full" />;
});

TilingCanvas.displayName = 'TilingCanvas';
