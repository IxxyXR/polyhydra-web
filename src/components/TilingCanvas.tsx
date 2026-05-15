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

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    scene.add(ambientLight);

    const directLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directLight.position.set(5, 5, 5);
    scene.add(directLight);

    const meshGroup = new THREE.Group();
    scene.add(meshGroup);

    sceneRef.current = { scene, camera, renderer, controls, meshGroup };

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
    const { meshGroup, camera } = sceneRef.current;

    while (meshGroup.children.length > 0) {
      const child = meshGroup.children[0] as THREE.Mesh;
      if (child.geometry) child.geometry.dispose();
      if (Array.isArray(child.material)) {
        child.material.forEach((m) => m.dispose());
      } else if ((child as any).material) {
        (child as any).material.dispose();
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

    if (showFaces) {
      const posAttr: number[] = [];
      const colorAttr: number[] = [];
      const tmpColor = new THREE.Color();

      faces.forEach((face, fIdx) => {
        tmpColor.set(computedFaceColors[fIdx] || '#ffffff');
        const triIndices = triangulateFaces([face], vertices);
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

      const material = new THREE.MeshPhongMaterial({
        vertexColors: true,
        side: THREE.DoubleSide,
        flatShading: true,
        wireframe: wireframe,
        transparent: true,
        opacity: 0.9,
        shininess: 30,
        polygonOffset: true,
        polygonOffsetFactor: 1,
        polygonOffsetUnits: 1,
      });
      faceMesh = new THREE.Mesh(coloredGeom, material);
      faceMesh.renderOrder = 0;
      meshGroup.add(faceMesh);
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
      containerRef.current?.removeEventListener('click', onClick);
      containerRef.current?.removeEventListener('mousemove', onMouseMove);
    };
  }, [tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, faceHighlight, operators, palette, paletteColors, colorMode, edgeColor, generationOptions, mode, radialType, radialSides, finalization, fitRequestKey]);

  return <div id="canvas-container" ref={containerRef} className="w-full h-full" />;
};
