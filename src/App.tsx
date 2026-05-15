import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import {
  Settings,
  Layers,
  Grid2X2,
  Maximize,
  Info,
  ChevronRight,
  Hexagon,
  Square,
  Triangle as TriangleIcon,
  Circle,
  Eye,
  EyeOff,
  X,
  Pencil,
  List,
  Shuffle,
  ArrowLeft,
  ArrowRight,
  GripVertical,
  Download,
  Search,
  Plus,
  Github,
  Link2,
  Check
} from 'lucide-react';
import { TilingCanvas } from './components/TilingCanvas';
import {
  MULTIGRID_DEFAULTS,
  MultiGridSettings,
  TilingGenerationOptions,
  UNIFORM_TILINGS,
} from './lib/tiling-geometries';
import { RadialPolyType, RADIAL_SHAPE_GROUPS, RADIAL_SOLID_NAMES, RADIAL_TYPES_WITH_SIDES } from './lib/radial-solids';
import { PALETTES, PaletteKey } from './lib/palettes';
import { exportObj, exportOff, exportSvg, sendToBlender } from './lib/export';
import { ColorMode } from './lib/coloring';
import { MeshFinalizationMode } from './lib/mesh-finalization';
import { createOmniOperatorDiagramSvg, createEmptyDiagramSvg } from './lib/omni-diagram';
import { AppPreset, EXAMPLE_PRESETS, getUserPresets, saveUserPreset, deleteUserPreset } from './lib/presets';
import {
  createOperatorSpec,
  DEFAULT_OMNI_PARAMS,
  OMNI_ATOMS,
  OMNI_POINT_CLASSES,
  OMNI_PRESETS,
  OMNI_VALID_OPERATORS,
  findOmniAtom,
  findPresetName,
  getOmniParamVisibility,
  getUnknownAtoms,
  isCompatibleSubset,
  isCompleteOperator,
  isValidSubset,
  joinAtomList,
  orderAtoms,
  parseOperatorSpec,
  parseAtomList,
  resolveOperatorNotation,
  serializeOperatorSpec,
  applyOperator,
  hasMeshEdgeCrossings,
  OperatorSpec,
} from './lib/conway-operators';

interface OperatorState extends OperatorSpec {
  id: string;
  enabled: boolean;
}

const APP_DEFAULTS = {
  mode: '2d' as const,
  radialType: 'Prism' as RadialPolyType,
  radialSides: 5,
  tilingType: '4.4.4.4',
  rows: 5,
  cols: 5,
  showEdges: false,
  showVertices: false,
  showFaces: true,
  wireframe: false,
  faceHighlight: false,
  finalization: 'planarize' as MeshFinalizationMode,
  palette: 'vibrant' as PaletteKey,
  colorMode: 'role' as ColorMode,
  edgeColor: '#3b82f6',
  embossEnabled: true,
  embossWidth: 0.015,
  embossDepth: 0.005,
  embossSmoothness: 0.8,
  ambientLightIntensity: 0.5,
  keyLightIntensity: 0.8,
  keyLightAzimuth: 45,
  keyLightElevation: 35,
  faceRoughness: 0.66,
  faceOpacity: 0.9,
};

const NO_PRESET_VALUE = '';
const CUSTOM_PRESET_VALUE = '__custom__';
const OPERATOR_ACTION_BUTTON_CLASS = 'rounded-md border border-neutral-700/70 bg-neutral-800/55 p-1 text-neutral-300 transition-colors hover:bg-neutral-700/85 hover:text-white';
const OPERATOR_DELETE_BUTTON_CLASS = 'rounded-md border border-neutral-700/70 bg-neutral-800/55 p-1 text-neutral-300 transition-colors hover:border-red-800/60 hover:bg-red-950/35 hover:text-red-300';
const POLYHYDRA_WEB_REPO_URL = 'https://github.com/IxxyXR/polyhydra-web';

const REGULAR_TILING_KEYS = new Set([
  '3.3.3.3.3.3',
  '4.4.4.4',
  '6.6.6',
]);

const UNIFORM_TILING_KEYS = new Set([
  '3.6.3.6',
  '4.8.8',
  '3.12.12',
  '3.4.6.4',
  '4.6.12',
  '3.3.4.3.4',
  '3.3.3.4.4',
  '3.3.3.3.6',
]);

const TWO_UNIFORM_TILING_KEYS = new Set([
  'dissected-rhombitrihexagonal',
  'dissected-truncated-hexagonal-1',
  'dissected-truncated-hexagonal-2',
  'hexagonal-truncated-triangular',
  'demiregular-hexagonal',
  'dissected-truncated-trihexagonal',
  'demiregular-square',
  'dissected-hexagonal-1',
  'dissected-hexagonal-2',
  'dissected-hexagonal-3',
  'alternating-trihexagonal',
  'dissected-rhombihexagonal',
  'alternating-trihex-square',
  'trihex-square',
  'alternating-tri-square',
  'semi-snub-tri-square',
  'tri-square-square-1',
  'tri-square-square-2',
  'tri-tri-square-1',
  'tri-tri-square-2',
]);

const CATALAN_LAVES_TILING_KEYS = new Set([
  'tetrakis-square',
  'cairo-pentagonal',
  'rhombille',
  'triakis-triangular',
  'deltoidal-trihexagonal',
  'kisrhombille',
  'floret-pentagonal',
  'prismatic-pentagonal',
]);

const TILING_GROUP_ORDER = ['Regular', 'Uniform', '2-Uniform', 'Catalan/Laves', 'Other'] as const;

const URL_KEYS = {
  mode: 'm',
  finalization: 'fn',
  radialType: 'rt',
  radialSides: 'rs',
  tiling: 't',
  size: 's',
  rows: 'r',
  cols: 'c',
  edges: 'e',
  vertices: 'v',
  faces: 'f',
  wireframe: 'w',
  palette: 'p',
  paletteOrder: 'po',
  colorMode: 'cm',
  edgeColor: 'ec',
  embossEnabled: 'em',
  embossWidth: 'ew',
  embossDepth: 'ed',
  embossSmoothness: 'es',
  ambientLightIntensity: 'a',
  keyLightIntensity: 'k',
  keyLightAzimuth: 'ka',
  keyLightElevation: 'ke',
  faceRoughness: 'rf',
  faceOpacity: 'fo',
  multigridDimensions: 'gd',
  multigridDivisions: 'gv',
  multigridOffset: 'go',
  multigridRandomize: 'gr',
  multigridSharedVertices: 'gs',
  multigridMinDistance: 'gn',
  multigridMaxDistance: 'gx',
  multigridColorRatio: 'gq',
  multigridColorIntersect: 'gi',
  multigridColorIndex: 'gj',
  multigridRandomSeed: 'gz',
  operators: 'o',
} as const;

const MODE_TO_URL: Record<'2d' | '3d', string> = {
  '2d': '2',
  '3d': '3',
};

const FINALIZATION_TO_URL: Record<MeshFinalizationMode, string> = {
  planarize: 'p',
  canonicalize: 'c',
  none: 'n',
};

const COLOR_MODE_TO_URL: Record<ColorMode, string> = {
  role: 'r',
  sides: 's',
  value: 'v',
};

const TILING_URL_VALUES = [
  '3.3.3.3.3.3',
  '4.4.4.4',
  '6.6.6',
  '3.6.3.6',
  '4.8.8',
  '3.12.12',
  '3.4.6.4',
  '4.6.12',
  '3.3.4.3.4',
  '3.3.3.4.4',
  '3.3.3.3.6',
  'tetrakis-square',
  'cairo-pentagonal',
  'rhombille',
  'triakis-triangular',
  'deltoidal-trihexagonal',
  'kisrhombille',
  'floret-pentagonal',
  'prismatic-pentagonal',
  'durer-1',
  'durer-2',
  'dissected-rhombitrihexagonal',
  'dissected-truncated-hexagonal-1',
  'dissected-truncated-hexagonal-2',
  'hexagonal-truncated-triangular',
  'demiregular-hexagonal',
  'dissected-truncated-trihexagonal',
  'demiregular-square',
  'dissected-hexagonal-1',
  'dissected-hexagonal-2',
  'dissected-hexagonal-3',
  'alternating-trihexagonal',
  'dissected-rhombihexagonal',
  'alternating-trihex-square',
  'trihex-square',
  'alternating-tri-square',
  'semi-snub-tri-square',
  'tri-square-square-1',
  'tri-square-square-2',
  'tri-tri-square-1',
  'tri-tri-square-2',
  'multigrid',
] as const;

const RADIAL_TYPE_URL_VALUES = [
  'Tetrahedron',
  'Cube',
  'Octahedron',
  'Dodecahedron',
  'Icosahedron',
  'TruncatedTetrahedron',
  'Cuboctahedron',
  'TruncatedCube',
  'TruncatedOctahedron',
  'Rhombicuboctahedron',
  'TruncatedCuboctahedron',
  'SnubCube',
  'Icosidodecahedron',
  'TruncatedDodecahedron',
  'TruncatedIcosahedron',
  'Rhombicosidodecahedron',
  'TruncatedIcosidodecahedron',
  'SnubDodecahedron',
  'TriakisTetrahedron',
  'RhombicDodecahedron',
  'TriakisOctahedron',
  'TetrakisHexahedron',
  'DeltoidalIcositetrahedron',
  'DisdyakisDodecahedron',
  'PentagonalIcositetrahedron',
  'RhombicTriacontahedron',
  'TriakisIcosahedron',
  'PentakisDodecahedron',
  'DeltoidalHexecontahedron',
  'DisdyakisTriacontahedron',
  'PentagonalHexecontahedron',
  'Prism',
  'Antiprism',
  'Trapezohedron',
  'Pyramid',
  'Dipyramid',
  'ElongatedPyramid',
  'ElongatedDipyramid',
  'GyroelongatedPyramid',
  'GyroelongatedDipyramid',
  'Cupola',
  'ElongatedCupola',
  'GyroelongatedCupola',
  'OrthoBicupola',
  'GyroBicupola',
  'ElongatedOrthoBicupola',
  'ElongatedGyroBicupola',
  'GyroelongatedBicupola',
] as const;

const TILING_KEY_TO_ALIAS = Object.fromEntries(
  TILING_URL_VALUES.map((value, index) => [value, index.toString(36)])
) as Record<string, string>;

const TILING_ALIAS_TO_KEY = Object.fromEntries(
  TILING_URL_VALUES.map((value, index) => [index.toString(36), value])
) as Record<string, string>;

const RADIAL_TYPE_KEY_TO_ALIAS = Object.fromEntries(
  RADIAL_TYPE_URL_VALUES.map((value, index) => [value, index.toString(36)])
) as Record<string, string>;

const RADIAL_TYPE_ALIAS_TO_KEY = Object.fromEntries(
  RADIAL_TYPE_URL_VALUES.map((value, index) => [index.toString(36), value])
) as Record<string, string>;

function getUrlParam(params: URLSearchParams, shortKey: string, legacyKey: string) {
  return params.get(shortKey) ?? params.get(legacyKey);
}

function encodeAliasedValue(value: string, aliases: Record<string, string>) {
  return aliases[value] ?? value;
}

function decodeAliasedValue(value: string | null, aliases: Record<string, string>) {
  if (value === null) return null;
  return aliases[value] ?? value;
}

function encodePaletteOrder(paletteKey: PaletteKey, paletteColors: string[] | null) {
  if (!paletteColors) return null;

  const baseColors = PALETTES[paletteKey].colors;
  if (paletteColors.length !== baseColors.length) {
    return null;
  }

  const used = new Array(baseColors.length).fill(false);
  const indices: number[] = [];

  for (const color of paletteColors) {
    const index = baseColors.findIndex((baseColor, baseIndex) => !used[baseIndex] && baseColor === color);
    if (index === -1) {
      return null;
    }
    used[index] = true;
    indices.push(index);
  }

  const isIdentity = indices.every((value, index) => value === index);
  return isIdentity ? null : indices.map((value) => value.toString(36)).join('');
}

function decodePaletteOrder(paletteKey: PaletteKey, encoded: string | null) {
  if (!encoded) return null;

  const baseColors = PALETTES[paletteKey].colors;
  if (encoded.length !== baseColors.length) {
    return null;
  }

  const indices = encoded.split('').map((char) => Number.parseInt(char, 36));
  if (indices.some((value) => !Number.isFinite(value) || value < 0 || value >= baseColors.length)) {
    return null;
  }

  if (new Set(indices).size !== baseColors.length) {
    return null;
  }

  return indices.map((index) => baseColors[index]);
}

function parseBooleanParamValue(value: string | null, fallback: boolean) {
  if (value === null) return fallback;
  if (value === '1' || value === 'true') return true;
  if (value === '0' || value === 'false') return false;
  return fallback;
}

function setParamIfNeeded(
  params: URLSearchParams,
  key: string,
  value: string | number | boolean,
  defaultValue: string | number | boolean,
) {
  if (value !== defaultValue) {
    params.set(key, String(value));
  }
}

function encodeOperatorParam(value: number) {
  const clamped = Math.min(Math.max(Math.round(value * 100), 0), 99);
  return clamped.toString(36).padStart(2, '0');
}

function decodeOperatorParam(value: string, fallback: number) {
  const parsed = Number.parseInt(value, 36);
  return Number.isFinite(parsed) ? parsed / 100 : fallback;
}

function serializeCompactOperator(operator: OperatorState) {
  let atomMask = 0;
  const selectedAtoms = new Set(parseAtomList(operator.notation));
  OMNI_ATOMS.forEach((atom, index) => {
    if (selectedAtoms.has(atom)) {
      atomMask += 2 ** index;
    }
  });

  const encodedParams = [
    encodeOperatorParam(operator.tVe),
    encodeOperatorParam(operator.tVf),
    encodeOperatorParam(operator.tFe),
  ].join('');
  const defaultParams = encodeOperatorParam(DEFAULT_OMNI_PARAMS.tVe).repeat(3);
  const payload = encodedParams === defaultParams
    ? atomMask.toString(36)
    : `${atomMask.toString(36)}.${encodedParams}`;

  return `${operator.enabled ? '' : '!'}${payload}`;
}

function parseCompactOperator(token: string): OperatorState | null {
  const enabled = !token.startsWith('!');
  const payload = enabled ? token : token.slice(1);
  const [maskRaw, paramRaw] = payload.split('.');
  if (!maskRaw) return null;

  const atomMask = Number.parseInt(maskRaw, 36);
  if (!Number.isFinite(atomMask)) return null;

  const atoms: string[] = [];
  OMNI_ATOMS.forEach((atom, index) => {
    const bit = 2 ** index;
    if (Math.floor(atomMask / bit) % 2 === 1) {
      atoms.push(atom);
    }
  });

  if (atoms.length === 0) return null;

  const params = paramRaw && paramRaw.length === 6
    ? {
        tVe: decodeOperatorParam(paramRaw.slice(0, 2), DEFAULT_OMNI_PARAMS.tVe),
        tVf: decodeOperatorParam(paramRaw.slice(2, 4), DEFAULT_OMNI_PARAMS.tVf),
        tFe: decodeOperatorParam(paramRaw.slice(4, 6), DEFAULT_OMNI_PARAMS.tFe),
      }
    : DEFAULT_OMNI_PARAMS;

  return createOperator(joinAtomList(atoms), enabled, params);
}

function createOperator(notation: string, enabled = true, overrides: Partial<OperatorSpec> = {}): OperatorState {
  return {
    id: Math.random().toString(36).substring(7) + Date.now(),
    enabled,
    ...createOperatorSpec(notation, overrides),
  };
}

function buildAppSearchParams(state: {
  mode: '2d' | '3d';
  finalization: MeshFinalizationMode;
  radialType: RadialPolyType;
  radialSides: number;
  tilingType: string;
  rows: number;
  cols: number;
  showEdges: boolean;
  showVertices: boolean;
  showFaces: boolean;
  wireframe: boolean;
  palette: PaletteKey;
  paletteColors: string[] | null;
  colorMode: ColorMode;
  edgeColor: string;
  embossEnabled: boolean;
  embossWidth: number;
  embossDepth: number;
  embossSmoothness: number;
  ambientLightIntensity: number;
  keyLightIntensity: number;
  keyLightAzimuth: number;
  keyLightElevation: number;
  faceRoughness: number;
  faceOpacity: number;
  multigridSettings: MultiGridSettings;
  operators: OperatorState[];
}) {
  const params = new URLSearchParams();
  setParamIfNeeded(params, URL_KEYS.mode, MODE_TO_URL[state.mode], MODE_TO_URL[APP_DEFAULTS.mode]);
  setParamIfNeeded(params, URL_KEYS.finalization, FINALIZATION_TO_URL[state.finalization], FINALIZATION_TO_URL[APP_DEFAULTS.finalization]);
  setParamIfNeeded(
    params,
    URL_KEYS.radialType,
    encodeAliasedValue(state.radialType, RADIAL_TYPE_KEY_TO_ALIAS),
    encodeAliasedValue(APP_DEFAULTS.radialType, RADIAL_TYPE_KEY_TO_ALIAS)
  );
  setParamIfNeeded(params, URL_KEYS.radialSides, state.radialSides, APP_DEFAULTS.radialSides);
  setParamIfNeeded(
    params,
    URL_KEYS.tiling,
    encodeAliasedValue(state.tilingType, TILING_KEY_TO_ALIAS),
    encodeAliasedValue(APP_DEFAULTS.tilingType, TILING_KEY_TO_ALIAS)
  );
  if (state.rows === state.cols) {
    setParamIfNeeded(params, URL_KEYS.size, state.rows, APP_DEFAULTS.rows);
  } else {
    setParamIfNeeded(params, URL_KEYS.rows, state.rows, APP_DEFAULTS.rows);
    setParamIfNeeded(params, URL_KEYS.cols, state.cols, APP_DEFAULTS.cols);
  }
  setParamIfNeeded(params, URL_KEYS.edges, Number(state.showEdges), Number(APP_DEFAULTS.showEdges));
  setParamIfNeeded(params, URL_KEYS.vertices, Number(state.showVertices), Number(APP_DEFAULTS.showVertices));
  setParamIfNeeded(params, URL_KEYS.faces, Number(state.showFaces), Number(APP_DEFAULTS.showFaces));
  setParamIfNeeded(params, URL_KEYS.wireframe, Number(state.wireframe), Number(APP_DEFAULTS.wireframe));
  setParamIfNeeded(params, URL_KEYS.palette, state.palette, APP_DEFAULTS.palette);
  const encodedPaletteOrder = encodePaletteOrder(state.palette, state.paletteColors);
  if (encodedPaletteOrder) {
    params.set(URL_KEYS.paletteOrder, encodedPaletteOrder);
  }
  setParamIfNeeded(params, URL_KEYS.colorMode, COLOR_MODE_TO_URL[state.colorMode], COLOR_MODE_TO_URL[APP_DEFAULTS.colorMode]);
  setParamIfNeeded(params, URL_KEYS.edgeColor, state.edgeColor, APP_DEFAULTS.edgeColor);
  setParamIfNeeded(params, URL_KEYS.embossEnabled, Number(state.embossEnabled), Number(APP_DEFAULTS.embossEnabled));
  setParamIfNeeded(params, URL_KEYS.embossWidth, state.embossWidth, APP_DEFAULTS.embossWidth);
  setParamIfNeeded(params, URL_KEYS.embossDepth, state.embossDepth, APP_DEFAULTS.embossDepth);
  setParamIfNeeded(params, URL_KEYS.embossSmoothness, state.embossSmoothness, APP_DEFAULTS.embossSmoothness);
  setParamIfNeeded(params, URL_KEYS.ambientLightIntensity, state.ambientLightIntensity, APP_DEFAULTS.ambientLightIntensity);
  setParamIfNeeded(params, URL_KEYS.keyLightIntensity, state.keyLightIntensity, APP_DEFAULTS.keyLightIntensity);
  setParamIfNeeded(params, URL_KEYS.keyLightAzimuth, state.keyLightAzimuth, APP_DEFAULTS.keyLightAzimuth);
  setParamIfNeeded(params, URL_KEYS.keyLightElevation, state.keyLightElevation, APP_DEFAULTS.keyLightElevation);
  setParamIfNeeded(params, URL_KEYS.faceRoughness, state.faceRoughness, APP_DEFAULTS.faceRoughness);
  setParamIfNeeded(params, URL_KEYS.faceOpacity, state.faceOpacity, APP_DEFAULTS.faceOpacity);
  setParamIfNeeded(params, URL_KEYS.multigridDimensions, state.multigridSettings.dimensions, MULTIGRID_DEFAULTS.dimensions);
  setParamIfNeeded(params, URL_KEYS.multigridDivisions, state.multigridSettings.divisions, MULTIGRID_DEFAULTS.divisions);
  setParamIfNeeded(params, URL_KEYS.multigridOffset, state.multigridSettings.offset, MULTIGRID_DEFAULTS.offset);
  setParamIfNeeded(params, URL_KEYS.multigridRandomize, Number(state.multigridSettings.randomize), Number(MULTIGRID_DEFAULTS.randomize));
  setParamIfNeeded(params, URL_KEYS.multigridSharedVertices, Number(state.multigridSettings.sharedVertices), Number(MULTIGRID_DEFAULTS.sharedVertices));
  setParamIfNeeded(params, URL_KEYS.multigridMinDistance, state.multigridSettings.minDistance, MULTIGRID_DEFAULTS.minDistance);
  setParamIfNeeded(params, URL_KEYS.multigridMaxDistance, state.multigridSettings.maxDistance, MULTIGRID_DEFAULTS.maxDistance);
  setParamIfNeeded(params, URL_KEYS.multigridColorRatio, state.multigridSettings.colorRatio, MULTIGRID_DEFAULTS.colorRatio);
  setParamIfNeeded(params, URL_KEYS.multigridColorIntersect, state.multigridSettings.colorIntersect, MULTIGRID_DEFAULTS.colorIntersect);
  setParamIfNeeded(params, URL_KEYS.multigridColorIndex, state.multigridSettings.colorIndex, MULTIGRID_DEFAULTS.colorIndex);
  setParamIfNeeded(params, URL_KEYS.multigridRandomSeed, state.multigridSettings.randomSeed, MULTIGRID_DEFAULTS.randomSeed);
  if (state.operators.length > 0) {
    params.set(URL_KEYS.operators, state.operators.map(serializeCompactOperator).join(';'));
  }
  return params;
}

function parseOperatorsFromUrlParam(urlOps: string): OperatorState[] {
  const compactEntries = urlOps.split(';').filter(Boolean);
  if (compactEntries.length > 0 && compactEntries.every((entry) => entry.includes('.') || /^[!0-9a-z]+$/i.test(entry))) {
    const parsedCompact = compactEntries
      .map(parseCompactOperator)
      .filter((operator): operator is OperatorState => operator !== null);
    if (parsedCompact.length > 0) {
      return parsedCompact;
    }
  }

  const entries = urlOps.includes(';')
    ? urlOps.split(';').filter(Boolean)
    : (() => {
        const fragments = urlOps.split(',').filter(Boolean);
        if (fragments.length <= 1) {
          return fragments;
        }

        const grouped: string[] = [];
        let current = '';

        for (const fragment of fragments) {
          current = current ? `${current},${fragment}` : fragment;
          const decodedCurrent = decodeURIComponent(current);
          if (decodedCurrent.split('~').length >= 4) {
            grouped.push(current);
            current = '';
          }
        }

        if (current) {
          grouped.push(current);
        }

        return grouped;
      })();

  return entries.map((entry) => {
    const decoded = decodeURIComponent(entry);
    const isEnabled = !decoded.startsWith('!');
    const serialized = isEnabled ? decoded : decoded.substring(1);
    const spec = parseOperatorSpec(serialized);
    return createOperator(spec.notation, isEnabled, spec);
  });
}

export default function App() {
  const [mode, setMode] = useState<'2d' | '3d'>(APP_DEFAULTS.mode);
  const [radialType, setRadialType] = useState<RadialPolyType>(APP_DEFAULTS.radialType);
  const [radialSides, setRadialSides] = useState(APP_DEFAULTS.radialSides);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [tilingType, setTilingType] = useState(APP_DEFAULTS.tilingType);
  const [rows, setRows] = useState(APP_DEFAULTS.rows);
  const [cols, setCols] = useState(APP_DEFAULTS.cols);
  const [showEdges, setShowEdges] = useState(APP_DEFAULTS.showEdges);
  const [showVertices, setShowVertices] = useState(APP_DEFAULTS.showVertices);
  const [showFaces, setShowFaces] = useState(APP_DEFAULTS.showFaces);
  const [wireframe, setWireframe] = useState(APP_DEFAULTS.wireframe);
  const [faceHighlight, setFaceHighlight] = useState(APP_DEFAULTS.faceHighlight);
  const [finalization, setFinalization] = useState<MeshFinalizationMode>(APP_DEFAULTS.finalization);
  const [isReady, setIsReady] = useState(false);
  const isPopStateRef = useRef(false);
  const [operators, setOperators] = useState<OperatorState[]>([]);
  const [palette, setPalette] = useState<PaletteKey>(APP_DEFAULTS.palette);
  const [shuffledColors, setShuffledColors] = useState<string[] | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>(APP_DEFAULTS.colorMode);
  const [edgeColor, setEdgeColor] = useState(APP_DEFAULTS.edgeColor);
  const [embossEnabled, setEmbossEnabled] = useState(APP_DEFAULTS.embossEnabled);
  const [embossWidth, setEmbossWidth] = useState(APP_DEFAULTS.embossWidth);
  const [embossDepth, setEmbossDepth] = useState(APP_DEFAULTS.embossDepth);
  const [embossSmoothness, setEmbossSmoothness] = useState(APP_DEFAULTS.embossSmoothness);
  const [ambientLightIntensity, setAmbientLightIntensity] = useState(APP_DEFAULTS.ambientLightIntensity);
  const [keyLightIntensity, setKeyLightIntensity] = useState(APP_DEFAULTS.keyLightIntensity);
  const [keyLightAzimuth, setKeyLightAzimuth] = useState(APP_DEFAULTS.keyLightAzimuth);
  const [keyLightElevation, setKeyLightElevation] = useState(APP_DEFAULTS.keyLightElevation);
  const [faceRoughness, setFaceRoughness] = useState(APP_DEFAULTS.faceRoughness);
  const [faceOpacity, setFaceOpacity] = useState(APP_DEFAULTS.faceOpacity);
  const [multigridSettings, setMultigridSettings] = useState<MultiGridSettings>(MULTIGRID_DEFAULTS);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [tilingMenuOpen, setTilingMenuOpen] = useState(false);
  const [displayMenuOpen, setDisplayMenuOpen] = useState(false);
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [rawEditorOpen, setRawEditorOpen] = useState(false);
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const [hoveredGridAtom, setHoveredGridAtom] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [blenderStatus, setBlenderStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [blenderError, setBlenderError] = useState<string | null>(null);
  const [blenderAvailable, setBlenderAvailable] = useState(false);
  const [hoveredDotType, setHoveredDotType] = useState<string | null>(null);
  const [dotPopup, setDotPopup] = useState<{ type: string; x: number; y: number } | null>(null);
  const [presetsMenuOpen, setPresetsMenuOpen] = useState(false);
  const [userPresets, setUserPresets] = useState<AppPreset[]>(() => getUserPresets());
  const [newPresetName, setNewPresetName] = useState('');
  const [savePresetInputVisible, setSavePresetInputVisible] = useState(false);
  const [fitRequestKey, setFitRequestKey] = useState(0);
  const selectedShapeButtonRef = useRef<HTMLButtonElement | null>(null);
  const selectedTilingButtonRef = useRef<HTMLButtonElement | null>(null);

  // Onboarding
  const [onboardingDismissed, setOnboardingDismissed] = useState(() =>
    !!localStorage.getItem('polyhydra-onboarding-done')
  );
  const [shapeEverOpened, setShapeEverOpened] = useState(false);
  const [tilingEverOpened, setTilingEverOpened] = useState(false);
  const [presetOrRandomUsed, setPresetOrRandomUsed] = useState(false);
  const [sliderMoved, setSliderMoved] = useState(false);
  const [diagramOrGridClicked, setDiagramOrGridClicked] = useState(false);
  const [initialHadOperators] = useState(() =>
    new URLSearchParams(window.location.search).has(URL_KEYS.operators) || new URLSearchParams(window.location.search).has('ops')
  );

  const step1Complete = mode === '3d' ? shapeEverOpened : tilingEverOpened;
  const step2Complete = initialHadOperators || operators.length > 0;
  const step3Complete = presetOrRandomUsed;
  const step4Complete = diagramOrGridClicked;
  const step5Complete = sliderMoved;
  const allOnboardingComplete = step1Complete && step2Complete && step3Complete && step4Complete && step5Complete;
  const showOnboarding = !onboardingDismissed;
  const activeOnboardingStep = !step1Complete ? 1 : !step2Complete ? 2 : !step3Complete ? 3 : !step4Complete ? 4 : !step5Complete ? 5 : 6;
  const onboardingStep1Label = mode === '3d' ? 'Pick a shape' : 'Pick a tiling';

  const dismissOnboarding = () => {
    localStorage.setItem('polyhydra-onboarding-done', '1');
    setOnboardingDismissed(true);
  };

  const requestFitToExtents = () => {
    setFitRequestKey((current) => current + 1);
  };

  const setModeAndFit = (nextMode: '2d' | '3d') => {
    setMode(nextMode);
    requestFitToExtents();
  };

  // Poll for Blender availability
  useEffect(() => {
    const check = async () => {
      try {
        await fetch('http://localhost:8765/polyhydra', {
          method: 'GET',
          mode: 'no-cors',
          signal: AbortSignal.timeout(2000),
        });
        setBlenderAvailable(true);
      } catch {
        setBlenderAvailable(false);
      }
    };
    check();
    const id = setInterval(check, 5000);
    return () => clearInterval(id);
  }, []);

  const applyParamsFromUrl = useCallback((search: string) => {
    const params = new URLSearchParams(search);

    const parseIntParam = (value: string | null, fallback: number) => {
      const parsed = Number.parseInt(value ?? '', 10);
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const parseFloatParam = (value: string | null, fallback: number) => {
      const parsed = Number.parseFloat(value ?? '');
      return Number.isFinite(parsed) ? parsed : fallback;
    };
    const urlMode = getUrlParam(params, URL_KEYS.mode, 'mode');
    setMode(
      urlMode === '2d' || urlMode === '3d'
        ? urlMode
        : urlMode === MODE_TO_URL['2d']
          ? '2d'
          : urlMode === MODE_TO_URL['3d']
            ? '3d'
            : APP_DEFAULTS.mode
    );

    const urlFinalization = getUrlParam(params, URL_KEYS.finalization, 'finalization');
    setFinalization(
      urlFinalization === 'none' || urlFinalization === 'planarize' || urlFinalization === 'canonicalize'
        ? urlFinalization
        : urlFinalization === FINALIZATION_TO_URL.none
          ? 'none'
          : urlFinalization === FINALIZATION_TO_URL.planarize
            ? 'planarize'
            : urlFinalization === FINALIZATION_TO_URL.canonicalize
              ? 'canonicalize'
        : APP_DEFAULTS.finalization
    );

    const urlRadialType = decodeAliasedValue(
      getUrlParam(params, URL_KEYS.radialType, 'radialType'),
      RADIAL_TYPE_ALIAS_TO_KEY
    );
    setRadialType(
      urlRadialType && RADIAL_SOLID_NAMES[urlRadialType as RadialPolyType]
        ? urlRadialType as RadialPolyType
        : APP_DEFAULTS.radialType
    );
    const urlRadialSides = getUrlParam(params, URL_KEYS.radialSides, 'radialSides');
    {
      const parsed = parseIntParam(urlRadialSides, APP_DEFAULTS.radialSides);
      setRadialSides(parsed >= 3 && parsed <= 16 ? parsed : APP_DEFAULTS.radialSides);
    }

    const urlTiling = decodeAliasedValue(
      getUrlParam(params, URL_KEYS.tiling, 'tiling'),
      TILING_ALIAS_TO_KEY
    );
    setTilingType(urlTiling && UNIFORM_TILINGS[urlTiling] ? urlTiling : APP_DEFAULTS.tilingType);

    const urlSize = params.get(URL_KEYS.size);
    const urlRows = getUrlParam(params, URL_KEYS.rows, 'rows');
    const urlCols = getUrlParam(params, URL_KEYS.cols, 'cols');
    if (urlSize) {
      const size = parseIntParam(urlSize, APP_DEFAULTS.rows);
      setRows(size);
      setCols(size);
    } else if (urlRows && urlCols) {
      setRows(parseIntParam(urlRows, APP_DEFAULTS.rows));
      setCols(parseIntParam(urlCols, APP_DEFAULTS.cols));
    } else if (urlRows) {
      const size = parseIntParam(urlRows, APP_DEFAULTS.rows);
      setRows(size);
      setCols(size);
    } else if (urlCols) {
      const size = parseIntParam(urlCols, APP_DEFAULTS.cols);
      setRows(size);
      setCols(size);
    } else {
      setRows(APP_DEFAULTS.rows);
      setCols(APP_DEFAULTS.cols);
    }

    setShowEdges(parseBooleanParamValue(getUrlParam(params, URL_KEYS.edges, 'edges'), APP_DEFAULTS.showEdges));
    setShowVertices(parseBooleanParamValue(getUrlParam(params, URL_KEYS.vertices, 'vertices'), APP_DEFAULTS.showVertices));
    setShowFaces(parseBooleanParamValue(getUrlParam(params, URL_KEYS.faces, 'faces'), APP_DEFAULTS.showFaces));
    setWireframe(parseBooleanParamValue(getUrlParam(params, URL_KEYS.wireframe, 'wireframe'), APP_DEFAULTS.wireframe));

    const urlPalette = getUrlParam(params, URL_KEYS.palette, 'palette');
    const resolvedPalette = urlPalette && PALETTES[urlPalette as PaletteKey] ? urlPalette as PaletteKey : APP_DEFAULTS.palette;
    setPalette(resolvedPalette);
    setShuffledColors(decodePaletteOrder(resolvedPalette, params.get(URL_KEYS.paletteOrder)));

    const urlColorMode = getUrlParam(params, URL_KEYS.colorMode, 'colorMode');
    setColorMode(
      urlColorMode === 'role' || urlColorMode === 'sides' || urlColorMode === 'value'
        ? urlColorMode
        : urlColorMode === COLOR_MODE_TO_URL.role
          ? 'role'
          : urlColorMode === COLOR_MODE_TO_URL.sides
            ? 'sides'
            : urlColorMode === COLOR_MODE_TO_URL.value
              ? 'value'
        : APP_DEFAULTS.colorMode
    );

    const urlEdgeColor = getUrlParam(params, URL_KEYS.edgeColor, 'edgeColor');
    setEdgeColor(urlEdgeColor ?? APP_DEFAULTS.edgeColor);

    const urlEmboss = getUrlParam(params, URL_KEYS.embossEnabled, 'emboss');
    setEmbossEnabled(parseBooleanParamValue(urlEmboss, APP_DEFAULTS.embossEnabled));

    const parsedEmbossWidth = parseFloatParam(getUrlParam(params, URL_KEYS.embossWidth, 'embossWidth'), APP_DEFAULTS.embossWidth);
    setEmbossWidth(Math.min(Math.max(Math.abs(parsedEmbossWidth), 0), 0.3));

    const parsedEmbossDepth = parseFloatParam(getUrlParam(params, URL_KEYS.embossDepth, 'embossDepth'), APP_DEFAULTS.embossDepth);
    setEmbossDepth(Math.min(Math.max(parsedEmbossDepth, -0.04), 0.04));

    const parsedEmbossSmoothness = getUrlParam(params, URL_KEYS.embossSmoothness, 'embossSmooth');
    if (parsedEmbossSmoothness !== null) {
      const value = parseFloatParam(parsedEmbossSmoothness, APP_DEFAULTS.embossSmoothness);
      setEmbossSmoothness(Math.min(Math.max(value, 0), 1));
    } else {
      const parsedEmbossProfile = params.get('embossProfile');
      setEmbossSmoothness(parsedEmbossProfile === 'linear' ? 0 : APP_DEFAULTS.embossSmoothness);
    }

    const parsedAmbient = parseFloatParam(getUrlParam(params, URL_KEYS.ambientLightIntensity, 'ambient'), APP_DEFAULTS.ambientLightIntensity);
    setAmbientLightIntensity(Math.min(Math.max(parsedAmbient, 0), 1.5));

    const parsedKey = parseFloatParam(getUrlParam(params, URL_KEYS.keyLightIntensity, 'key'), APP_DEFAULTS.keyLightIntensity);
    setKeyLightIntensity(Math.min(Math.max(parsedKey, 0), 2));

    const parsedKeyAzimuth = parseFloatParam(getUrlParam(params, URL_KEYS.keyLightAzimuth, 'keyAz'), APP_DEFAULTS.keyLightAzimuth);
    setKeyLightAzimuth(Math.min(Math.max(parsedKeyAzimuth, -180), 180));

    const parsedKeyElevation = parseFloatParam(getUrlParam(params, URL_KEYS.keyLightElevation, 'keyEl'), APP_DEFAULTS.keyLightElevation);
    setKeyLightElevation(Math.min(Math.max(parsedKeyElevation, -85), 85));

    const parsedRoughness = getUrlParam(params, URL_KEYS.faceRoughness, 'rough');
    if (parsedRoughness !== null) {
      const value = parseFloatParam(parsedRoughness, APP_DEFAULTS.faceRoughness);
      setFaceRoughness(Math.min(Math.max(value, 0), 1));
    } else {
      const parsedShininess = parseFloatParam(params.get('shine'), 40);
      const normalizedShininess = Math.min(Math.max(parsedShininess, 0), 120);
      setFaceRoughness(1 - (normalizedShininess / 120));
    }

    const parsedOpacity = parseFloatParam(getUrlParam(params, URL_KEYS.faceOpacity, 'opacity'), APP_DEFAULTS.faceOpacity);
    setFaceOpacity(Math.min(Math.max(parsedOpacity, 0), 1));

    setMultigridSettings({
      dimensions: parseIntParam(getUrlParam(params, URL_KEYS.multigridDimensions, 'mgDim'), MULTIGRID_DEFAULTS.dimensions),
      divisions: parseIntParam(getUrlParam(params, URL_KEYS.multigridDivisions, 'mgDiv'), MULTIGRID_DEFAULTS.divisions),
      offset: parseFloatParam(getUrlParam(params, URL_KEYS.multigridOffset, 'mgOff'), MULTIGRID_DEFAULTS.offset),
      randomize: parseBooleanParamValue(getUrlParam(params, URL_KEYS.multigridRandomize, 'mgRand'), MULTIGRID_DEFAULTS.randomize),
      sharedVertices: getUrlParam(params, URL_KEYS.multigridSharedVertices, 'mgShared') === null
        ? MULTIGRID_DEFAULTS.sharedVertices
        : parseBooleanParamValue(getUrlParam(params, URL_KEYS.multigridSharedVertices, 'mgShared'), MULTIGRID_DEFAULTS.sharedVertices),
      minDistance: parseFloatParam(getUrlParam(params, URL_KEYS.multigridMinDistance, 'mgMin'), MULTIGRID_DEFAULTS.minDistance),
      maxDistance: parseFloatParam(getUrlParam(params, URL_KEYS.multigridMaxDistance, 'mgMax'), MULTIGRID_DEFAULTS.maxDistance),
      colorRatio: parseFloatParam(getUrlParam(params, URL_KEYS.multigridColorRatio, 'mgRatio'), MULTIGRID_DEFAULTS.colorRatio),
      colorIntersect: parseFloatParam(getUrlParam(params, URL_KEYS.multigridColorIntersect, 'mgIntersect'), MULTIGRID_DEFAULTS.colorIntersect),
      colorIndex: parseFloatParam(getUrlParam(params, URL_KEYS.multigridColorIndex, 'mgIndex'), MULTIGRID_DEFAULTS.colorIndex),
      randomSeed: parseIntParam(getUrlParam(params, URL_KEYS.multigridRandomSeed, 'mgSeed'), MULTIGRID_DEFAULTS.randomSeed),
    });

    const urlOps = getUrlParam(params, URL_KEYS.operators, 'ops');
    if (urlOps) {
      const loadedOperators = parseOperatorsFromUrlParam(urlOps);
      setOperators(loadedOperators);
      setSelectedOperatorId(loadedOperators[0]?.id ?? null);
    } else {
      setOperators([]);
      setSelectedOperatorId(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync state with URL
  useEffect(() => {
    applyParamsFromUrl(window.location.search);
    setIsReady(true);
    requestFitToExtents();

    const handlePopState = () => {
      isPopStateRef.current = true;
      applyParamsFromUrl(window.location.search);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyParamsFromUrl]);

  useEffect(() => {
    const params = buildAppSearchParams({
      mode,
      finalization,
      radialType,
      radialSides,
      tilingType,
      rows,
      cols,
      showEdges,
      showVertices,
      showFaces,
      wireframe,
      palette,
      paletteColors: shuffledColors,
      colorMode,
      edgeColor,
      embossEnabled,
      embossWidth,
      embossDepth,
      embossSmoothness,
      ambientLightIntensity,
      keyLightIntensity,
      keyLightAzimuth,
      keyLightElevation,
      faceRoughness,
      faceOpacity,
      multigridSettings,
      operators,
    });

    if (!isReady) return;
    if (isPopStateRef.current) {
      isPopStateRef.current = false;
      return;
    }
    const newSearch = '?' + params.toString();
    if (newSearch === window.location.search) return;
    window.history.pushState(null, '', window.location.pathname + newSearch);
  }, [mode, finalization, radialType, radialSides, tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, operators, palette, shuffledColors, colorMode, edgeColor, embossEnabled, embossWidth, embossDepth, embossSmoothness, ambientLightIntensity, keyLightIntensity, keyLightAzimuth, keyLightElevation, faceRoughness, faceOpacity, multigridSettings, isReady]);


  const applyPreset = (preset: AppPreset) => {
    applyParamsFromUrl('?' + preset.params);
    requestFitToExtents();
    setPresetsMenuOpen(false);
    setSavePresetInputVisible(false);
    setNewPresetName('');
  };

  const saveCurrentPreset = () => {
    if (!newPresetName.trim()) return;
    const params = buildAppSearchParams({ mode, finalization, radialType, radialSides, tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, palette, paletteColors: shuffledColors, colorMode, edgeColor, embossEnabled, embossWidth, embossDepth, embossSmoothness, ambientLightIntensity, keyLightIntensity, keyLightAzimuth, keyLightElevation, faceRoughness, faceOpacity, multigridSettings, operators });
    saveUserPreset({ name: newPresetName.trim(), params: params.toString() });
    setUserPresets(getUserPresets());
    setNewPresetName('');
    setSavePresetInputVisible(false);
  };

  const copyCurrentAsExamplePreset = async () => {
    const params = buildAppSearchParams({ mode, finalization, radialType, radialSides, tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, palette, paletteColors: shuffledColors, colorMode, edgeColor, embossEnabled, embossWidth, embossDepth, embossSmoothness, ambientLightIntensity, keyLightIntensity, keyLightAzimuth, keyLightElevation, faceRoughness, faceOpacity, multigridSettings, operators });
    const entry = `{ name: 'name', params: '${params.toString()}'},`;
    await navigator.clipboard.writeText(entry);
  };

  const addOperator = (notation: string, overrides: Partial<OperatorSpec> = {}) => {
    if (!notation.trim()) return;
    const nextOperator = createOperator(notation.trim(), true, overrides);
    setOperators((current) => [...current, nextOperator]);
    setSelectedOperatorId(nextOperator.id);
  };

  const addBlankOperator = () => {
    const nextOperator = createOperator('', true);
    setOperators((current) => [...current, nextOperator]);
    setSelectedOperatorId(nextOperator.id);
  };

  const removeOperator = (id: string) => {
    setOperators((current) => {
      const index = current.findIndex((op) => op.id === id);
      const remaining = current.filter((op) => op.id !== id);
      if (selectedOperatorId === id) {
        const fallback = remaining[Math.min(index, remaining.length - 1)] ?? remaining[index - 1] ?? null;
        setSelectedOperatorId(fallback?.id ?? null);
      }
      return remaining;
    });
  };

  const randomizeSelectedOperator = () => {
    if (!selectedOperatorId) return;
    const randomIndex = Math.floor(Math.random() * OMNI_VALID_OPERATORS.length);
    const randomAtoms = orderAtoms(OMNI_VALID_OPERATORS[randomIndex]);
    const notation = joinAtomList(randomAtoms);
    setOperators((current) => current.map((op) =>
      op.id === selectedOperatorId ? { ...op, notation } : op
    ));
  };

  const selectedOperator = operators.find((op) => op.id === selectedOperatorId) ?? null;
  const selectedOperatorNotation = selectedOperator ? resolveOperatorNotation(selectedOperator.notation) : '';
  const selectedAtoms = parseAtomList(selectedOperatorNotation);
  const orderedSelectedAtoms = orderAtoms(selectedAtoms);
  const uniqueSelectedAtoms = Array.from(new Set(selectedAtoms));
  const unknownSelectedAtoms = getUnknownAtoms(uniqueSelectedAtoms);
  const selectedOperatorIsComplete = unknownSelectedAtoms.length === 0 && isCompleteOperator(uniqueSelectedAtoms);
  const selectedOperatorIsValid = unknownSelectedAtoms.length === 0 && isValidSubset(uniqueSelectedAtoms);
  const selectedMatchingPresetName = unknownSelectedAtoms.length === 0 ? findPresetName(uniqueSelectedAtoms) : null;
  const selectedPresetValue = !selectedOperatorNotation.trim()
    ? NO_PRESET_VALUE
    : (selectedMatchingPresetName ?? CUSTOM_PRESET_VALUE);
  const selectedOperatorDiagramSvg = createOmniOperatorDiagramSvg(selectedOperatorNotation, hoveredGridAtom) ?? (selectedOperatorNotation.trim() === '' ? createEmptyDiagramSvg(hoveredGridAtom) : null);
  const activeOperators = operators.filter((op) => op.enabled);

  const updateSelectedOperatorNotation = (notation: string) => {
    if (!selectedOperatorId) return;
    setOperators((current) => current.map((op) =>
      op.id === selectedOperatorId ? { ...op, notation } : op
    ));
  };

  const selectOperator = (id: string) => {
    setSelectedOperatorId(id);
    setRawEditorOpen(false);
    setPresetPickerOpen(false);
    setDotPopup(null);
    setHoveredDotType(null);
  };

  const toggleGridAtom = (atom: string) => {
    if (!selectedOperatorId) return;

    const nextAtoms = new Set(uniqueSelectedAtoms);
    if (nextAtoms.has(atom)) {
      nextAtoms.delete(atom);
    } else if (isCompatibleSubset([...nextAtoms], atom)) {
      nextAtoms.add(atom);
    } else {
      return;
    }

    updateSelectedOperatorNotation(joinAtomList(orderAtoms(nextAtoms)));
  };

  const toggleOperator = (id: string) => {
    setOperators(operators.map(op =>
      op.id === id ? { ...op, enabled: !op.enabled } : op
    ));
  };

  const updateOperatorParams = (id: string, field: keyof Pick<OperatorSpec, 'tVe' | 'tVf' | 'tFe'>, value: string) => {
    const parsed = Number.parseFloat(value);
    setOperators(operators.map((op) =>
      op.id === id
        ? { ...op, [field]: Number.isFinite(parsed) ? parsed : DEFAULT_OMNI_PARAMS[field] }
        : op
    ));
  };

  const updateMultigridSetting = <K extends keyof MultiGridSettings>(field: K, value: MultiGridSettings[K]) => {
    setMultigridSettings((current) => {
      if (field === 'minDistance') {
        const minDistance = value as number;
        return {
          ...current,
          minDistance,
          maxDistance: Math.max(current.maxDistance, minDistance),
        };
      }

      if (field === 'maxDistance') {
        const maxDistance = value as number;
        return {
          ...current,
          maxDistance,
          minDistance: Math.min(current.minDistance, maxDistance),
        };
      }

      return { ...current, [field]: value };
    });
  };

  const selectedTiling = UNIFORM_TILINGS[tilingType];
  const selectedPalette = PALETTES[palette];
  const radialTypeUsesSides = RADIAL_TYPES_WITH_SIDES.has(radialType);

  const selectedOperatorHasCrossings = useMemo(() => {
    if (!selectedOperatorId) return false;
    const tiling = UNIFORM_TILINGS[tilingType];
    if (!tiling || tilingType === 'multigrid') return false;
    const selectedIdx = operators.findIndex(op => op.id === selectedOperatorId);
    if (selectedIdx === -1 || !operators[selectedIdx].enabled) return false;
    try {
      let { vertices, faces } = tiling.generate(2, 2);
      for (let i = 0; i <= selectedIdx; i++) {
        if (operators[i].enabled) {
          ({ vertices, faces } = applyOperator({ vertices, faces }, operators[i]));
        }
      }
      return hasMeshEdgeCrossings({ vertices, faces });
    } catch {
      return false;
    }
  }, [operators, tilingType, selectedOperatorId]);
  const isMultigrid = tilingType === 'multigrid';
  const generationOptions: TilingGenerationOptions = {
    multigrid: multigridSettings,
  };
  const tilingGroups = Object.entries(UNIFORM_TILINGS).reduce<Record<string, Array<[string, typeof selectedTiling]>>>((groups, [key, tiling]) => {
    let group = 'Other';
    if (REGULAR_TILING_KEYS.has(key)) {
      group = 'Regular';
    } else if (UNIFORM_TILING_KEYS.has(key)) {
      group = 'Uniform';
    } else if (TWO_UNIFORM_TILING_KEYS.has(key)) {
      group = '2-Uniform';
    } else if (CATALAN_LAVES_TILING_KEYS.has(key)) {
      group = 'Catalan/Laves';
    }

    if (!groups[group]) {
      groups[group] = [];
    }

    groups[group].push([key, tiling]);
    return groups;
  }, {});

  useEffect(() => {
    if (!shapeMenuOpen) return;
    const rafId = window.requestAnimationFrame(() => {
      selectedShapeButtonRef.current?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [shapeMenuOpen, radialType]);

  useEffect(() => {
    if (!tilingMenuOpen) return;
    const rafId = window.requestAnimationFrame(() => {
      selectedTilingButtonRef.current?.scrollIntoView({
        block: 'center',
        inline: 'nearest',
      });
    });
    return () => window.cancelAnimationFrame(rafId);
  }, [tilingMenuOpen, tilingType]);

  return (
    <div id="app-root" className="flex h-screen bg-neutral-950 text-neutral-100 font-sans overflow-hidden">
      {/* Sidebar */}
      <motion.div
        initial={false}
        animate={{ width: sidebarOpen ? 360 : 0 }}
        className="relative h-full shrink-0 overflow-visible z-20"
      >
        <button
          onClick={() => setSidebarOpen((current) => !current)}
          className="absolute right-0 top-6 z-30 flex h-10 w-5 translate-x-1/2 items-center justify-center rounded-r-xl border border-neutral-800 border-l-0 bg-neutral-900/90 text-neutral-500 transition-colors hover:bg-neutral-800 hover:text-white"
          title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
          aria-label={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
        >
          {sidebarOpen ? <ArrowLeft className="h-3.5 w-3.5" /> : <ArrowRight className="h-3.5 w-3.5" />}
        </button>
        <div className="h-full w-full overflow-hidden">
        <aside className="h-full w-[360px] bg-neutral-900/50 backdrop-blur-xl border-r border-neutral-800 flex flex-col overflow-hidden">
        <div className="p-6 overflow-y-auto flex-1">
          <div className="flex items-center justify-between gap-3 mb-8">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 bg-blue-600 rounded-lg">
                <Layers className="w-6 h-6 text-white" />
              </div>
              <div>
                <h1 className="font-bold text-xl tracking-tight text-white">Polyhydra</h1>
                <p className="text-xs text-neutral-400 font-mono uppercase tracking-widest">Three.js Powered</p>
              </div>
            </div>
            <a
              href={POLYHYDRA_WEB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="shrink-0 rounded-lg border border-neutral-800 bg-neutral-800/30 p-2 text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-white"
              title="Polyhydra Web repository"
              aria-label="Open Polyhydra Web repository"
            >
              <Github className="w-4 h-4" />
            </a>
          </div>

          <div className="space-y-6">
            {/* Presets */}
            <section>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-800/20 overflow-hidden">
                <button
                  onClick={() => setPresetsMenuOpen(!presetsMenuOpen)}
                  className="w-full flex items-center justify-between gap-2 px-3 py-2 text-left transition-colors hover:bg-neutral-800/40"
                >
                  <span className="text-xs font-semibold text-neutral-300">Presets</span>
                  <ChevronRight className={`w-3.5 h-3.5 text-neutral-500 transition-transform ${presetsMenuOpen ? 'rotate-90 text-white' : ''}`} />
                </button>
                <AnimatePresence initial={false}>
                  {presetsMenuOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-neutral-800"
                    >
                      <div className="p-3 space-y-4">
                        <div>
                          <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold mb-2 px-1">Examples</div>
                          <div className="space-y-0.5">
                            {EXAMPLE_PRESETS.map((preset) => (
                              <button
                                key={preset.name}
                                onClick={() => applyPreset(preset)}
                                className="w-full text-left px-3 py-1.5 rounded-lg hover:bg-neutral-700/50 transition-colors group"
                              >
                                <span className="text-xs text-neutral-300 group-hover:text-white transition-colors">{preset.name}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {(userPresets.length > 0 || savePresetInputVisible) && (
                          <div>
                            <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold mb-2 px-1">Favourites</div>
                            <div className="space-y-0.5">
                              {userPresets.map((preset, index) => (
                                <div key={index} className="flex items-center gap-1">
                                  <button
                                    onClick={() => applyPreset(preset)}
                                    className="flex-1 text-left px-3 py-2 rounded-xl hover:bg-neutral-700/50 transition-colors group"
                                  >
                                    <div className="text-xs font-semibold text-white group-hover:text-blue-300 transition-colors">{preset.name}</div>
                                  </button>
                                  <button
                                    onClick={() => { deleteUserPreset(index); setUserPresets(getUserPresets()); }}
                                    className={OPERATOR_DELETE_BUTTON_CLASS}
                                    title="Delete preset"
                                  >
                                    <X className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          {savePresetInputVisible ? (
                            <div className="flex items-center gap-2">
                              <input
                                type="text"
                                placeholder="Preset name…"
                                value={newPresetName}
                                onChange={(e) => setNewPresetName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') saveCurrentPreset();
                                  if (e.key === 'Escape') { setSavePresetInputVisible(false); setNewPresetName(''); }
                                }}
                                autoFocus
                                className="flex-1 rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-xs text-white placeholder-neutral-500 outline-none focus:border-blue-600"
                              />
                              <button
                                onClick={saveCurrentPreset}
                                disabled={!newPresetName.trim()}
                                className="rounded-lg border border-blue-700/60 bg-blue-950/20 px-3 py-2 text-[10px] font-bold uppercase tracking-widest text-blue-300 transition-colors hover:bg-blue-900/40 disabled:opacity-40"
                              >
                                Save
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setSavePresetInputVisible(true)}
                              className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-neutral-700/50 bg-neutral-800/30 text-[10px] font-semibold uppercase tracking-widest text-neutral-400 transition-colors hover:bg-neutral-800/60 hover:text-white"
                            >
                              <Plus className="w-3 h-3" />
                              Save current as favourite
                            </button>
                          )}
                        </div>

                        {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                        {(import.meta as any).env?.DEV && (
                          <button
                            onClick={copyCurrentAsExamplePreset}
                            className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-xl border border-orange-700/50 bg-orange-950/20 text-[10px] font-semibold uppercase tracking-widest text-orange-400 transition-colors hover:bg-orange-900/40"
                            title="Copies a ready-to-paste AppPreset entry to the clipboard"
                          >
                            [DEV] Copy as example preset
                          </button>
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            {/* Mode toggle */}
            <section>
              <div className="flex gap-1 p-1 bg-neutral-800/40 rounded-xl border border-neutral-800">
                <button
                  onClick={() => setModeAndFit('2d')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mode === '2d' ? 'bg-blue-600 text-white shadow' : 'text-neutral-400 hover:text-white'}`}
                >
                  2D Tilings
                </button>
                <button
                  onClick={() => setModeAndFit('3d')}
                  className={`flex-1 py-2 text-xs font-semibold rounded-lg transition-all ${mode === '3d' ? 'bg-blue-600 text-white shadow' : 'text-neutral-400 hover:text-white'}`}
                >
                  3D Shapes
                </button>
              </div>
            </section>

            {/* 3D shape picker */}
            {mode === '3d' && (
              <section>
                <div className="rounded-2xl border border-neutral-800 bg-neutral-800/20 overflow-hidden">
                  <AnimatePresence>
                    {showOnboarding && activeOnboardingStep === 1 && (
                      <motion.div
                        key="callout-shape-1"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <div className="callout-animate mx-3 mt-3 flex items-center gap-2.5 rounded-xl bg-yellow-400 px-3 py-2.5 text-xs font-semibold text-yellow-900 shadow-lg shadow-yellow-900/30">
                          <span className="flex items-center justify-center w-4 h-4 rounded-full bg-yellow-900 text-yellow-300 text-[10px] font-bold shrink-0">1</span>
                          <span>Click below to browse and pick a 3D shape</span>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                  <button
                    onClick={() => {
                      if (!shapeMenuOpen) setShapeEverOpened(true);
                      setShapeMenuOpen(!shapeMenuOpen);
                    }}
                    className="w-full p-4 text-left transition-colors hover:bg-neutral-800/40"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold mb-2">Active Shape</div>
                        <div className="text-sm font-semibold text-white truncate">{RADIAL_SOLID_NAMES[radialType]}</div>
                      </div>
                      <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400">
                        <ChevronRight className={`w-4 h-4 transition-transform ${shapeMenuOpen ? 'rotate-90 text-white' : ''}`} />
                      </div>
                    </div>
                  </button>
                  <AnimatePresence initial={false}>
                    {shapeMenuOpen && (
                      <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="border-t border-neutral-800"
                      >
                        <div className="max-h-72 overflow-y-auto p-2 space-y-3">
                          {RADIAL_SHAPE_GROUPS.map(group => (
                            <div key={group.name} className="space-y-1">
                              <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{group.name}</div>
                              {group.types.map(type => (
                                <button
                                  key={type}
                                  ref={radialType === type ? selectedShapeButtonRef : null}
                                  onClick={() => { setRadialType(type); requestFitToExtents(); setShapeMenuOpen(false); }}
                                  className={`w-full rounded-xl p-3 text-left transition-all ${radialType === type ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20' : 'bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800'}`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="font-medium text-sm truncate">{RADIAL_SOLID_NAMES[type]}</div>
                                    {radialType === type && <ChevronRight className="w-4 h-4 shrink-0" />}
                                  </div>
                                </button>
                              ))}
                            </div>
                          ))}
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </section>
            )}

            {/* 2D tiling picker */}
            {mode === '2d' && <section>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-800/20 overflow-hidden">
                <AnimatePresence>
                  {showOnboarding && activeOnboardingStep === 1 && (
                    <motion.div
                      key="callout-1"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="callout-animate mx-3 mt-3 flex items-center gap-2.5 rounded-xl bg-yellow-400 px-3 py-2.5 text-xs font-semibold text-yellow-900 shadow-lg shadow-yellow-900/30">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-yellow-900 text-yellow-300 text-[10px] font-bold shrink-0">1</span>
                        <span>Click below to browse and pick a tiling pattern</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <button
                  onClick={() => {
                    if (!tilingMenuOpen) setTilingEverOpened(true);
                    setTilingMenuOpen(!tilingMenuOpen);
                  }}
                  className="w-full p-4 text-left transition-colors hover:bg-neutral-800/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold mb-2">
                        Active Tiling
                      </div>
                      <div className="text-sm font-semibold text-white truncate">{selectedTiling?.name}</div>
                    </div>
                    <div className="mt-1 flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400">
                      <ChevronRight className={`w-4 h-4 transition-transform ${tilingMenuOpen ? 'rotate-90 text-white' : ''}`} />
                    </div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {tilingMenuOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-neutral-800"
                    >
                      <div className="max-h-72 overflow-y-auto p-2 space-y-3">
                        {TILING_GROUP_ORDER.map((groupName) => {
                          const entries = tilingGroups[groupName];
                          if (!entries?.length) {
                            return null;
                          }

                          return (
                            <div key={groupName} className="space-y-1">
                              <div className="px-2 pt-1 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                {groupName}
                              </div>
                              {entries.map(([key, tiling]) => (
                                <button
                                  key={key}
                                  ref={tilingType === key ? selectedTilingButtonRef : null}
                                  onClick={() => {
                                    setTilingType(key);
                                    if (key === 'multigrid') {
                                      setColorMode((current) => current === 'role' ? 'value' : current);
                                    }
                                    requestFitToExtents();
                                    setTilingMenuOpen(false);
                                  }}
                                  className={`w-full rounded-xl p-3 text-left transition-all ${
                                    tilingType === key
                                      ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/20'
                                      : 'bg-neutral-900/40 text-neutral-300 hover:bg-neutral-800'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-3">
                                    <div className="min-w-0">
                                      <div className="font-medium text-sm truncate">{tiling.name}</div>
                                    </div>
                                    {tilingType === key && <ChevronRight className="w-4 h-4 shrink-0" />}
                                  </div>
                                </button>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>}

            <section>
              <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Settings className="w-3 h-3" />
                Settings
              </h2>
              <div className="space-y-4 bg-neutral-800/20 p-4 rounded-2xl border border-neutral-800">
                {mode === '3d' ? (
                  <div className="space-y-2">
                    {radialTypeUsesSides ? (
                      <>
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-400">Sides</span>
                          <span className="text-blue-400 font-mono">{radialSides}</span>
                        </div>
                        <input
                          type="range"
                          min="3"
                          max="16"
                          value={radialSides}
                          onChange={e => setRadialSides(parseInt(e.target.value, 10))}
                          className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </>
                    ) : (
                      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 px-3 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                        Fixed Solid
                      </div>
                    )}
                  </div>
                ) : isMultigrid ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-400">Dimensions</span>
                        <span className="text-blue-400 font-mono">{multigridSettings.dimensions}</span>
                      </div>
                      <input
                        type="range"
                        min="3"
                        max="30"
                        value={multigridSettings.dimensions}
                        onChange={(e) => updateMultigridSetting('dimensions', parseInt(e.target.value, 10))}
                        className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-400">Divisions</span>
                        <span className="text-blue-400 font-mono">{multigridSettings.divisions}</span>
                      </div>
                      <input
                        type="range"
                        min="1"
                        max="30"
                        value={multigridSettings.divisions}
                        onChange={(e) => updateMultigridSetting('divisions', parseInt(e.target.value, 10))}
                        className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-400">Offset</span>
                        <span className="text-blue-400 font-mono">{multigridSettings.offset.toFixed(2)}</span>
                      </div>
                      <input
                        type="range"
                        min="-2"
                        max="2"
                        step="0.01"
                        value={multigridSettings.offset}
                        onChange={(e) => updateMultigridSetting('offset', Number.parseFloat(e.target.value))}
                        className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3 space-y-3">
                      <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold">Cropping</div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-400">Min Distance</span>
                          <span className="text-blue-400 font-mono">{multigridSettings.minDistance.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.01"
                          value={multigridSettings.minDistance}
                          onChange={(e) => updateMultigridSetting('minDistance', Number.parseFloat(e.target.value))}
                          className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                      <div className="space-y-2">
                        <div className="flex justify-between text-xs">
                          <span className="text-neutral-400">Max Distance</span>
                          <span className="text-blue-400 font-mono">{multigridSettings.maxDistance.toFixed(2)}</span>
                        </div>
                        <input
                          type="range"
                          min="0"
                          max="2"
                          step="0.01"
                          value={multigridSettings.maxDistance}
                          onChange={(e) => updateMultigridSetting('maxDistance', Number.parseFloat(e.target.value))}
                          className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                        />
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-400">Rows</span>
                        <span className="text-blue-400 font-mono">{rows}</span>
                      </div>
                      <input 
                        type="range" min="2" max="30" value={rows} 
                        onChange={(e) => setRows(parseInt(e.target.value))}
                        className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-400">Columns</span>
                        <span className="text-blue-400 font-mono">{cols}</span>
                      </div>
                      <input 
                        type="range" min="2" max="30" value={cols} 
                        onChange={(e) => setCols(parseInt(e.target.value))}
                        className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                      />
                    </div>
                  </>
                )}
              </div>
            </section>

            <section>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-800/20 overflow-hidden">
                <button
                  onClick={() => setDisplayMenuOpen(!displayMenuOpen)}
                  className="w-full p-3 text-left transition-colors hover:bg-neutral-800/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        <Eye className="w-3 h-3" />
                        Appearance
                      </div>
                      <div className="flex items-center gap-2">
                        <div className="flex -space-x-1">
                          {selectedPalette.colors.slice(0, 5).map((c, i) => (
                            <div
                              key={i}
                              className="h-3 w-3 rounded-full border border-neutral-900"
                              style={{ backgroundColor: c }}
                            />
                          ))}
                        </div>
                        <div
                          className="h-2 w-6 rounded-full border border-neutral-700"
                          style={{ backgroundColor: edgeColor }}
                          title="Edge colour"
                        />
                      </div>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400">
                      <ChevronRight className={`w-4 h-4 transition-transform ${displayMenuOpen ? 'rotate-90 text-white' : ''}`} />
                    </div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {displayMenuOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-neutral-800"
                    >
                      <div className="p-3 space-y-4">
                        <div className="space-y-2.5">
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Faces</div>
                          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                            <button
                              onClick={() => setPaletteMenuOpen(!paletteMenuOpen)}
                              className="w-full p-3 text-left transition-colors hover:bg-neutral-800/40"
                            >
                              <div className="flex items-center justify-between gap-3">
                                <div className="min-w-0">
                                  <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold mb-1">
                                    Face Palette
                                  </div>
                                  <div className="text-xs font-semibold text-white truncate">{selectedPalette.name}</div>
                                  <div className="flex items-center gap-2 mt-2">
                                    <div className="flex -space-x-1">
                                      {(shuffledColors ?? selectedPalette.colors).slice(0, 5).map((c, i) => (
                                        <div
                                          key={i}
                                          className="w-3 h-3 rounded-full border border-neutral-900"
                                          style={{ backgroundColor: c }}
                                        />
                                      ))}
                                    </div>
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        const colors = [...selectedPalette.colors];
                                        for (let i = colors.length - 1; i > 0; i--) {
                                          const j = Math.floor(Math.random() * (i + 1));
                                          [colors[i], colors[j]] = [colors[j], colors[i]];
                                        }
                                        setShuffledColors(colors);
                                      }}
                                      className="p-0.5 text-neutral-500 hover:text-white transition-colors"
                                      title="Shuffle palette order"
                                    >
                                      <Shuffle className="w-3 h-3" />
                                    </button>
                                  </div>
                                </div>
                                <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400">
                                  <ChevronRight className={`w-4 h-4 transition-transform ${paletteMenuOpen ? 'rotate-90 text-white' : ''}`} />
                                </div>
                              </div>
                            </button>

                            <AnimatePresence initial={false}>
                              {paletteMenuOpen && (
                                <motion.div
                                  initial={{ height: 0, opacity: 0 }}
                                  animate={{ height: 'auto', opacity: 1 }}
                                  exit={{ height: 0, opacity: 0 }}
                                  className="border-t border-neutral-800"
                                >
                                  <div className="p-2 grid grid-cols-2 gap-2">
                                    {Object.entries(PALETTES).map(([key, p]) => (
                                      <button
                                        key={key}
                                        onClick={() => {
                                          setPalette(key as PaletteKey);
                                          setShuffledColors(null);
                                          setPaletteMenuOpen(false);
                                        }}
                                        className={`flex items-center gap-2 p-2 rounded-lg text-[10px] font-medium transition-all border ${
                                          palette === key
                                            ? 'bg-neutral-800 border-neutral-700 text-white'
                                            : 'bg-neutral-900/40 border-neutral-800/50 text-neutral-500 hover:bg-neutral-800/60'
                                        }`}
                                      >
                                        <div className="flex -space-x-1">
                                          {p.colors.slice(0, 3).map((c, i) => (
                                            <div key={i} className="w-2 h-2 rounded-full border border-neutral-900" style={{ backgroundColor: c }} />
                                          ))}
                                        </div>
                                        {p.name}
                                      </button>
                                    ))}
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setColorMode('role')}
                              className={`rounded-lg border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                                colorMode === 'role'
                                  ? 'border-blue-700/60 bg-blue-950/20 text-blue-300'
                                  : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/60'
                              }`}
                            >
                              By Role
                            </button>
                            <button
                              onClick={() => setColorMode('sides')}
                              className={`rounded-lg border px-3 py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                                colorMode === 'sides'
                                  ? 'border-blue-700/60 bg-blue-950/20 text-blue-300'
                                  : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/60'
                              }`}
                            >
                              By Sides
                            </button>
                          </div>
                          <label className="flex items-center justify-between cursor-pointer group px-1 py-1">
                            <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">Show Faces</span>
                            <input type="checkbox" checked={showFaces} onChange={(e) => setShowFaces(e.target.checked)} className="w-4 h-4 rounded border-neutral-700 text-blue-600 bg-neutral-800 focus:ring-blue-600" />
                          </label>
                          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-3">
                            <div className="mb-3 text-sm text-neutral-300">Lighting</div>
                            <div className="space-y-3">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Ambient</span>
                                  <span className="font-mono text-neutral-300">{ambientLightIntensity.toFixed(2)}</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1.5"
                                  step="0.05"
                                  value={ambientLightIntensity}
                                  onChange={(e) => setAmbientLightIntensity(parseFloat(e.target.value))}
                                  className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Key Light</span>
                                  <span className="font-mono text-neutral-300">{keyLightIntensity.toFixed(2)}</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="2"
                                  step="0.05"
                                  value={keyLightIntensity}
                                  onChange={(e) => setKeyLightIntensity(parseFloat(e.target.value))}
                                  className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Key Azimuth</span>
                                  <span className="font-mono text-neutral-300">{keyLightAzimuth.toFixed(0)}°</span>
                                </div>
                                <input
                                  type="range"
                                  min="-180"
                                  max="180"
                                  step="1"
                                  value={keyLightAzimuth}
                                  onChange={(e) => setKeyLightAzimuth(parseFloat(e.target.value))}
                                  className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Key Elevation</span>
                                  <span className="font-mono text-neutral-300">{keyLightElevation.toFixed(0)}°</span>
                                </div>
                                <input
                                  type="range"
                                  min="-85"
                                  max="85"
                                  step="1"
                                  value={keyLightElevation}
                                  onChange={(e) => setKeyLightElevation(parseFloat(e.target.value))}
                                  className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Roughness</span>
                                  <span className="font-mono text-neutral-300">{faceRoughness.toFixed(2)}</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.02"
                                  value={faceRoughness}
                                  onChange={(e) => setFaceRoughness(parseFloat(e.target.value))}
                                  className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Opacity</span>
                                  <span className="font-mono text-neutral-300">{faceOpacity.toFixed(2)}</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.02"
                                  value={faceOpacity}
                                  onChange={(e) => setFaceOpacity(parseFloat(e.target.value))}
                                  className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2.5 border-t border-neutral-800 pt-3">
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Edges</div>
                          <div className="flex items-center justify-between gap-3 px-1 py-1">
                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Edge Colour</span>
                            <label className="flex items-center gap-2">
                              <span className="font-mono text-[10px] text-neutral-400">{edgeColor}</span>
                              <input
                                type="color"
                                value={edgeColor}
                                onChange={(e) => setEdgeColor(e.target.value)}
                                className="h-8 w-10 cursor-pointer rounded border border-neutral-700 bg-transparent p-0"
                              />
                            </label>
                          </div>
                          <label className="flex items-center justify-between cursor-pointer group px-1 py-1">
                            <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">Show Edges</span>
                            <input type="checkbox" checked={showEdges} onChange={(e) => setShowEdges(e.target.checked)} className="w-4 h-4 rounded border-neutral-700 text-blue-600 bg-neutral-800 focus:ring-blue-600" />
                          </label>
                          <div className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-3">
                            <div className="mb-3 text-sm text-neutral-300">Emboss</div>
                            <label className="flex items-center justify-between cursor-pointer group">
                              <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">Emboss Faces</span>
                              <input
                                type="checkbox"
                                checked={embossEnabled}
                                onChange={(e) => setEmbossEnabled(e.target.checked)}
                                className="w-4 h-4 rounded border-neutral-700 text-blue-600 bg-neutral-800 focus:ring-blue-600"
                              />
                            </label>
                            <div className={`mt-3 space-y-3 transition-opacity ${embossEnabled ? 'opacity-100' : 'opacity-50'}`}>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Emboss Width</span>
                                  <span className="font-mono text-neutral-300">{embossWidth.toFixed(3)}</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="0.3"
                                  step="0.005"
                                  value={embossWidth}
                                  onChange={(e) => setEmbossWidth(parseFloat(e.target.value))}
                                  disabled={!embossEnabled}
                                  className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Emboss Depth</span>
                                  <span className="font-mono text-neutral-300">{embossDepth.toFixed(3)}</span>
                                </div>
                                <input
                                  type="range"
                                  min="-0.04"
                                  max="0.04"
                                  step="0.0025"
                                  value={embossDepth}
                                  onChange={(e) => setEmbossDepth(parseFloat(e.target.value))}
                                  disabled={!embossEnabled}
                                  className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Emboss Smoothness</span>
                                  <span className="font-mono text-neutral-300">{embossSmoothness.toFixed(2)}</span>
                                </div>
                                <input
                                  type="range"
                                  min="0"
                                  max="1"
                                  step="0.05"
                                  value={embossSmoothness}
                                  onChange={(e) => setEmbossSmoothness(parseFloat(e.target.value))}
                                  disabled={!embossEnabled}
                                  className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer disabled:cursor-not-allowed"
                                />
                              </div>
                            </div>
                          </div>
                        </div>
                        <div className="space-y-2.5 border-t border-neutral-800 pt-3">
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Debug</div>
                          <label className="flex items-center justify-between cursor-pointer group px-1 py-1">
                            <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">Show Vertices</span>
                            <input type="checkbox" checked={showVertices} onChange={(e) => setShowVertices(e.target.checked)} className="w-4 h-4 rounded border-neutral-700 text-blue-600 bg-neutral-800 focus:ring-blue-600" />
                          </label>
                          <label className="flex items-center justify-between cursor-pointer group px-1 py-1">
                            <span className="text-xs text-neutral-500 group-hover:text-neutral-400 transition-colors">Wireframe</span>
                            <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} className="w-3.5 h-3.5 rounded border-neutral-700 text-blue-600 bg-neutral-800 focus:ring-blue-600 opacity-60" />
                          </label>
                          <label className="flex items-center justify-between cursor-pointer group px-1 py-1">
                            <span className="text-xs text-neutral-500 group-hover:text-neutral-400 transition-colors">Face Highlight</span>
                            <input type="checkbox" checked={faceHighlight} onChange={(e) => setFaceHighlight(e.target.checked)} className="w-3.5 h-3.5 rounded border-neutral-700 text-blue-600 bg-neutral-800 focus:ring-blue-600 opacity-60" />
                          </label>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

            <section>
              <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layers className="w-3 h-3" />
                Operators
              </h2>
              <div className="space-y-3 bg-neutral-800/20 p-4 rounded-2xl border border-neutral-800">
                <AnimatePresence>
                  {showOnboarding && activeOnboardingStep === 2 && (
                    <motion.div
                      key="callout-2"
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="callout-animate mb-3 flex items-center gap-2.5 rounded-xl bg-yellow-400 px-3 py-2.5 text-xs font-semibold text-yellow-900 shadow-lg shadow-yellow-900/30">
                        <span className="flex items-center justify-center w-4 h-4 rounded-full bg-yellow-900 text-yellow-300 text-[10px] font-bold shrink-0">2</span>
                        <span>Click <span className="font-black">Add Operator</span> below to transform the tiling</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-[10px] font-semibold text-neutral-500 uppercase tracking-widest">Omni Operators</h3>
                  <div className="flex items-center gap-2">
                        <button
                          onClick={addBlankOperator}
                          className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-bold"
                        >
                          <Plus className="w-3 h-3" />
                          Add Operator
                        </button>
                        {operators.length > 0 && (
                          <button
                            onClick={() => {
                              setOperators([]);
                              setSelectedOperatorId(null);
                            }}
                            className="text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-bold"
                          >
                            Clear Stack
                          </button>
                        )}
                  </div>
                </div>

                {operators.length > 0 && (
                  <Reorder.Group
                    axis="y"
                    values={operators}
                    onReorder={(nextOperators) => {
                      setOperators(nextOperators);
                      if (selectedOperatorId && !nextOperators.some((op) => op.id === selectedOperatorId)) {
                        setSelectedOperatorId(nextOperators[0]?.id ?? null);
                      }
                    }}
                    className="space-y-1 mb-4"
                  >
                        {operators.map((op, idx) => (
                          <Reorder.Item
                            key={op.id}
                            value={op}
                            onClick={() => selectOperator(op.id)}
                            className={`rounded-lg border px-3 py-2 text-xs transition-colors hover:border-neutral-700 cursor-grab active:cursor-grabbing ${selectedOperatorId === op.id ? 'border-blue-700/60 bg-blue-950/20' : 'border-neutral-800/50 bg-neutral-900/50'} ${!op.enabled ? 'opacity-50' : ''}`}
                          >
                            <AnimatePresence>
                              {showOnboarding && activeOnboardingStep === 3 && (
                                <motion.div
                                  key="callout-3"
                                  initial={{ opacity: 0, height: 0 }}
                                  animate={{ opacity: 1, height: 'auto' }}
                                  exit={{ opacity: 0, height: 0 }}
                                  className="overflow-hidden"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  <div className="callout-animate mb-2 flex items-center gap-2.5 rounded-xl bg-yellow-400 px-3 py-2.5 text-xs font-semibold text-yellow-900 shadow-lg shadow-yellow-900/30">
                                    <span className="flex items-center justify-center w-4 h-4 rounded-full bg-yellow-900 text-yellow-300 text-[10px] font-bold shrink-0">3</span>
                                    <span>Use <span className="inline-flex items-center gap-1 font-black"><List className="w-3 h-3" />Preset</span> or <span className="inline-flex items-center gap-1 font-black"><Shuffle className="w-3 h-3" />Random</span> below to apply an operator</span>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <GripVertical className="w-3 h-3 shrink-0 text-neutral-600" />
                                <span className="w-4 shrink-0 font-mono text-[10px] text-neutral-500">{idx + 1}.</span>
                                <div className="min-w-0">
                                  <div className={`${op.enabled ? 'text-blue-400' : 'text-neutral-500'} truncate font-mono font-bold`}>
                                    {findPresetName(parseAtomList(resolveOperatorNotation(op.notation))) ?? (resolveOperatorNotation(op.notation) || 'New Operator')}
                                  </div>
                                  <div className="truncate font-mono text-[10px] text-neutral-500">
                                    {resolveOperatorNotation(op.notation) || 'No atoms'}
                                  </div>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOperatorId(op.id);
                                      setRawEditorOpen((current) => selectedOperatorId === op.id ? !current : true);
                                      setPresetPickerOpen(false);
                                    }}
                                    className={OPERATOR_ACTION_BUTTON_CLASS}
                                    title="Edit raw atoms"
                                  >
                                    <Pencil className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOperatorId(op.id);
                                      setPresetPickerOpen((current) => selectedOperatorId === op.id ? !current : true);
                                      setRawEditorOpen(false);
                                    }}
                                    className={OPERATOR_ACTION_BUTTON_CLASS}
                                    title="Choose preset"
                                  >
                                    <List className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelectedOperatorId(op.id);
                                      const randomIndex = Math.floor(Math.random() * OMNI_VALID_OPERATORS.length);
                                    const randomAtoms = orderAtoms(OMNI_VALID_OPERATORS[randomIndex]);
                                    const notation = joinAtomList(randomAtoms);
                                    setOperators((current) => current.map((item) =>
                                      item.id === op.id ? { ...item, notation } : item
                                      ));
                                      setRawEditorOpen(false);
                                      setPresetPickerOpen(false);
                                      setPresetOrRandomUsed(true);
                                    }}
                                    className={OPERATOR_ACTION_BUTTON_CLASS}
                                    title="Random operator"
                                  >
                                    <Shuffle className="w-3 h-3" />
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      toggleOperator(op.id);
                                    }}
                                    className={OPERATOR_ACTION_BUTTON_CLASS}
                                    title={op.enabled ? 'Disable' : 'Enable'}
                                  >
                                    {op.enabled ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                                  </button>
                                  <button
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      removeOperator(op.id);
                                    }}
                                    className={OPERATOR_DELETE_BUTTON_CLASS}
                                  >
                                    <X className="w-3 h-3" />
                                  </button>
                              </div>
                            </div>
                            {(() => {
                              const visibility = getOmniParamVisibility(op.notation);
                              const isSelectedOperator = selectedOperatorId === op.id;
                              if (!visibility.showP1 && !visibility.showP2 && !visibility.showP3 && !isSelectedOperator) {
                                return null;
                              }

                              return (
                                <div
                                  className="mt-3 grid gap-2"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {!isSelectedOperator && visibility.showP1 && (
                                    <label className="grid gap-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                          ve
                                        </span>
                                        <span className="font-mono text-[10px] text-neutral-400">
                                          {op.tVe.toFixed(2)}
                                        </span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0.01"
                                        max="0.99"
                                        step="0.01"
                                        value={op.tVe}
                                        onChange={(e) => updateOperatorParams(op.id, 'tVe', e.target.value)}
                                        className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                      />
                                    </label>
                                  )}
                                  {!isSelectedOperator && visibility.showP2 && (
                                    <label className="grid gap-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                          vf
                                        </span>
                                        <span className="font-mono text-[10px] text-neutral-400">
                                          {op.tVf.toFixed(2)}
                                        </span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0.01"
                                        max="0.99"
                                        step="0.01"
                                        value={op.tVf}
                                        onChange={(e) => updateOperatorParams(op.id, 'tVf', e.target.value)}
                                        className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                      />
                                    </label>
                                  )}
                                  {!isSelectedOperator && visibility.showP3 && (
                                    <label className="grid gap-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                          fe
                                        </span>
                                        <span className="font-mono text-[10px] text-neutral-400">
                                          {op.tFe.toFixed(2)}
                                        </span>
                                      </div>
                                      <input
                                        type="range"
                                        min="0.01"
                                        max="0.99"
                                        step="0.01"
                                        value={op.tFe}
                                        onChange={(e) => updateOperatorParams(op.id, 'tFe', e.target.value)}
                                        className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                      />
                                    </label>
                                  )}
                                  {isSelectedOperator && (
                                    <>
                                      <AnimatePresence initial={false}>
                                        {rawEditorOpen && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div className="p-3 space-y-2">
                                              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                                Raw Atom List
                                              </div>
                                              <input
                                                type="text"
                                                value={selectedOperatorNotation}
                                                onChange={(e) => updateSelectedOperatorNotation(e.target.value)}
                                                placeholder="ve-vf,ve1-ve1,vf-vf,vf-vf!"
                                                className="w-full px-3 py-2 rounded-lg text-xs border bg-neutral-800/40 border-neutral-700/50 text-neutral-200 placeholder:text-neutral-500 focus:outline-none focus:border-blue-500 font-mono"
                                              />
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>

                                      <AnimatePresence initial={false}>
                                        {presetPickerOpen && (
                                          <motion.div
                                            initial={{ height: 0, opacity: 0 }}
                                            animate={{ height: 'auto', opacity: 1 }}
                                            exit={{ height: 0, opacity: 0 }}
                                            className="overflow-hidden rounded-xl border border-neutral-800 bg-neutral-900/40"
                                            onClick={(e) => e.stopPropagation()}
                                          >
                                            <div className="p-3 space-y-2">
                                              <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                                Conway Preset
                                              </div>
                                              <select
                                                value={selectedPresetValue}
                                                onPointerDown={(e) => e.stopPropagation()}
                                                onClick={(e) => e.stopPropagation()}
                                                onChange={(e) => {
                                                  e.stopPropagation();
                                                  const presetName = e.target.value;
                                                  if (selectedOperatorId && presetName && presetName !== CUSTOM_PRESET_VALUE) {
                                                    const notation = OMNI_PRESETS[presetName];
                                                    setOperators((current) => current.map((item) =>
                                                      item.id === selectedOperatorId ? { ...item, notation } : item
                                                    ));
                                                    requestFitToExtents();
                                                    setPresetOrRandomUsed(true);
                                                  }
                                                }}
                                                className="w-full px-3 py-2 rounded-lg text-xs border bg-neutral-800/40 border-neutral-700/50 text-neutral-200 focus:outline-none focus:border-blue-500"
                                              >
                                                <option value={NO_PRESET_VALUE}>---</option>
                                                <option value={CUSTOM_PRESET_VALUE}>(custom)</option>
                                                {Object.keys(OMNI_PRESETS).map((presetName) => (
                                                  <option key={presetName} value={presetName}>
                                                    {presetName}
                                                  </option>
                                                ))}
                                              </select>
                                              <p className="text-[10px] text-neutral-500 font-mono break-all">
                                                {selectedPresetValue === NO_PRESET_VALUE
                                                  ? 'Select a preset to replace the current operator.'
                                                  : selectedPresetValue === CUSTOM_PRESET_VALUE
                                                    ? '(custom)'
                                                    : OMNI_PRESETS[selectedPresetValue]}
                                              </p>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>

                                      <AnimatePresence>
                                        {showOnboarding && activeOnboardingStep === 4 && (
                                          <motion.div
                                            key="callout-4"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden"
                                          >
                                            <div className="callout-animate mb-3 flex items-center gap-2.5 rounded-xl bg-yellow-400 px-3 py-2.5 text-xs font-semibold text-yellow-900 shadow-lg shadow-yellow-900/30">
                                              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-yellow-900 text-yellow-300 text-[10px] font-bold shrink-0">4</span>
                                              <span>Edit the operator by clicking the diagram or grid</span>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>

                                      <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-2">
                                        {selectedOperatorDiagramSvg && (
                                          <div className="mb-2 rounded-lg border border-neutral-800 bg-neutral-950/60 p-3">
                                            <div className="mb-2 flex items-center justify-between">
                                              <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold">Symbol</div>
                                              <div className="text-[10px] font-mono font-bold text-blue-300 transition-opacity" style={{ opacity: hoveredDotType ? 1 : 0 }}>{hoveredDotType ?? '·'}</div>
                                            </div>
                                            <div
                                              className="mx-auto aspect-square w-28 text-white"
                                              onMouseMove={(e) => {
                                                const type = (e.target as Element).getAttribute('data-type');
                                                setHoveredDotType(type || null);
                                              }}
                                              onMouseLeave={() => setHoveredDotType(null)}
                                              onClick={(e) => {
                                                setDiagramOrGridClicked(true);
                                                const type = (e.target as Element).getAttribute('data-type');
                                                if (type) {
                                                  setDotPopup((prev) => prev?.type === type ? null : { type, x: e.clientX, y: e.clientY });
                                                } else {
                                                  setDotPopup(null);
                                                }
                                              }}
                                              dangerouslySetInnerHTML={{ __html: selectedOperatorDiagramSvg }}
                                            />
                                            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px]">
                                              {selectedOperatorIsValid && !selectedOperatorIsComplete ? (
                                                <motion.span
                                                  animate={{
                                                    backgroundColor: ['rgba(120,53,15,0.3)', 'rgba(180,83,9,0.55)', 'rgba(120,53,15,0.3)'],
                                                    color: ['rgb(252,211,77)', 'rgb(255,255,255)', 'rgb(252,211,77)'],
                                                    borderColor: ['rgba(180,83,9,0.4)', 'rgba(251,191,36,0.75)', 'rgba(180,83,9,0.4)'],
                                                  }}
                                                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                                                  className="rounded-full border px-2 py-1 font-semibold uppercase tracking-widest"
                                                  title="Choose more atoms to complete this operator"
                                                >
                                                  Incomplete
                                                </motion.span>
                                              ) : (
                                                <span
                                                  className={`rounded-full border px-2 py-1 font-semibold uppercase tracking-widest ${
                                                    selectedOperatorIsComplete
                                                      ? 'border-emerald-800/40 bg-emerald-900/30 text-emerald-300'
                                                      : 'border-red-800/40 bg-red-900/30 text-red-300'
                                                  }`}
                                                >
                                                  {selectedOperatorIsComplete ? 'Complete' : 'Invalid'}
                                                </span>
                                              )}
                                              {selectedMatchingPresetName && (
                                                <span className="rounded-full border border-blue-800/40 bg-blue-900/20 px-2 py-1 font-semibold text-blue-300 uppercase tracking-widest">
                                                  {selectedMatchingPresetName}
                                                </span>
                                              )}
                                              {orderedSelectedAtoms.length > 0 && (
                                                <span className="font-mono text-neutral-500">
                                                  {orderedSelectedAtoms.length} atoms
                                                </span>
                                              )}
                                            </div>
                                          </div>
                                        )}
                                        <div className="mb-2 flex items-center justify-between gap-2">
                                          <span className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold">
                                            Atom Grid
                                          </span>
                                          <span className="text-[10px] font-mono text-neutral-500">
                                            {hoveredGridAtom ?? ''}
                                          </span>
                                        </div>
                                        <div
                                          className="grid gap-1 w-full"
                                          style={{
                                            gridTemplateColumns: `repeat(${OMNI_POINT_CLASSES.length + 1}, minmax(0, 1fr))`,
                                          }}
                                        >
                                          <div />
                                          {OMNI_POINT_CLASSES.map((pointClass) => (
                                            <div
                                              key={`col-${pointClass}`}
                                              className="aspect-square flex items-center justify-center text-[10px] font-bold text-neutral-500"
                                            >
                                              {pointClass}
                                            </div>
                                          ))}

                                          {OMNI_POINT_CLASSES.map((rowClass) => (
                                            <React.Fragment key={`row-${rowClass}`}>
                                              <div className="aspect-square flex items-center justify-center text-[10px] font-bold text-neutral-500">
                                                {rowClass}
                                              </div>
                                              {OMNI_POINT_CLASSES.map((colClass) => {
                                                const atom = findOmniAtom(rowClass, colClass);
                                                if (!atom) {
                                                  return (
                                                    <div
                                                      key={`${rowClass}-${colClass}`}
                                                      className="aspect-square rounded-md"
                                                    />
                                                  );
                                                }

                                                const isSelected = uniqueSelectedAtoms.includes(atom);
                                                const isCompatible = isSelected || isCompatibleSubset(uniqueSelectedAtoms.filter((selected) => selected !== atom), atom);
                                                const isDotHighlighted = !isSelected && isCompatible && hoveredDotType !== null && (rowClass === hoveredDotType || colClass === hoveredDotType);
                                                const baseClass = isSelected
                                                  ? 'bg-blue-600 border-blue-500 shadow-sm shadow-blue-900/30'
                                                  : isDotHighlighted
                                                    ? 'bg-amber-500/70 border-amber-400/80 animate-pulse'
                                                    : isCompatible
                                                      ? 'bg-emerald-800/50 border-emerald-700/60 hover:bg-emerald-700/60'
                                                      : 'opacity-0 cursor-not-allowed pointer-events-none';

                                                return (
                                                  <button
                                                    key={`${rowClass}-${colClass}`}
                                                    type="button"
                                                    onMouseEnter={() => setHoveredGridAtom(atom)}
                                                    onMouseLeave={() => setHoveredGridAtom((current) => current === atom ? null : current)}
                                                    onClick={() => { setDiagramOrGridClicked(true); toggleGridAtom(atom); }}
                                                    disabled={!isSelected && !isCompatible}
                                                    className={`aspect-square rounded-md border transition-colors ${baseClass}`}
                                                    title={atom}
                                                  />
                                                );
                                              })}
                                            </React.Fragment>
                                          ))}
                                        </div>
                                      </div>

                                      <AnimatePresence>
                                        {showOnboarding && activeOnboardingStep === 5 && (
                                          <motion.div
                                            key="callout-5"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden"
                                          >
                                            <div className="callout-animate mb-2 flex items-center gap-2.5 rounded-xl bg-yellow-400 px-3 py-2.5 text-xs font-semibold text-yellow-900 shadow-lg shadow-yellow-900/30">
                                              <span className="flex items-center justify-center w-4 h-4 rounded-full bg-yellow-900 text-yellow-300 text-[10px] font-bold shrink-0">5</span>
                                              {(visibility.showP1 || visibility.showP2 || visibility.showP3)
                                                ? <span>Adjust the vertices by moving the sliders</span>
                                                : <span>Some configurations will have sliders here that you can adjust. Try adjusting the operator until you see a slider</span>
                                              }
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>

                                      {visibility.showP1 && (
                                        <label className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">ve</span>
                                            <span className="font-mono text-[10px] text-neutral-400">{op.tVe.toFixed(2)}</span>
                                          </div>
                                          <input
                                            type="range"
                                            min="0.01"
                                            max="0.99"
                                            step="0.01"
                                            value={op.tVe}
                                            onChange={(e) => { setSliderMoved(true); updateOperatorParams(op.id, 'tVe', e.target.value); }}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                          />
                                        </label>
                                      )}
                                      {visibility.showP2 && (
                                        <label className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">vf</span>
                                            <span className="font-mono text-[10px] text-neutral-400">{op.tVf.toFixed(2)}</span>
                                          </div>
                                          <input
                                            type="range"
                                            min="0.01"
                                            max="0.99"
                                            step="0.01"
                                            value={op.tVf}
                                            onChange={(e) => { setSliderMoved(true); updateOperatorParams(op.id, 'tVf', e.target.value); }}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                          />
                                        </label>
                                      )}
                                      {visibility.showP3 && (
                                        <label className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">fe</span>
                                            <span className="font-mono text-[10px] text-neutral-400">{op.tFe.toFixed(2)}</span>
                                          </div>
                                          <input
                                            type="range"
                                            min="0.01"
                                            max="0.99"
                                            step="0.01"
                                            value={op.tFe}
                                            onChange={(e) => { setSliderMoved(true); updateOperatorParams(op.id, 'tFe', e.target.value); }}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                          />
                                        </label>
                                      )}

                                      <AnimatePresence>
                                        {selectedOperatorHasCrossings && (visibility.showP1 || visibility.showP2 || visibility.showP3) && (
                                          <motion.div
                                            key="crossing-warning"
                                            initial={{ opacity: 0, height: 0 }}
                                            animate={{ opacity: 1, height: 'auto' }}
                                            exit={{ opacity: 0, height: 0 }}
                                            className="overflow-hidden"
                                          >
                                            <div className="mt-1 flex items-center gap-2 rounded-lg border border-red-800/50 bg-red-950/40 px-2.5 py-2 text-[10px] text-red-300">
                                              <span className="shrink-0">⚠</span>
                                              <span>Edges are crossing — adjust sliders to fix</span>
                                            </div>
                                          </motion.div>
                                        )}
                                      </AnimatePresence>

                                      {unknownSelectedAtoms.length > 0 && (
                                        <p className="text-[10px] text-red-400 font-mono break-all">
                                          Unknown atoms: {unknownSelectedAtoms.join(', ')}
                                        </p>
                                      )}

                                      <AnimatePresence>
                                        {dotPopup && (
                                          <>
                                            <div className="fixed inset-0 z-40" onClick={() => setDotPopup(null)} />
                                            <motion.div
                                              key="dot-popup"
                                              initial={{ opacity: 0, scale: 0.92, y: -4 }}
                                              animate={{ opacity: 1, scale: 1, y: 0 }}
                                              exit={{ opacity: 0, scale: 0.92, y: -4 }}
                                              style={{ position: 'fixed', left: Math.min(dotPopup.x + 10, window.innerWidth - 180), top: dotPopup.y + 10 }}
                                              className="z-50 w-40 rounded-xl border border-neutral-700 bg-neutral-900/95 p-3 shadow-2xl backdrop-blur-sm"
                                              onClick={(e) => e.stopPropagation()}
                                            >
                                              <div className="mb-2 flex items-center justify-between">
                                                <span className="text-[10px] font-bold uppercase tracking-widest text-blue-300">{dotPopup.type}</span>
                                                <button onClick={() => setDotPopup(null)} className="text-neutral-500 hover:text-white transition-colors"><X className="h-3 w-3" /></button>
                                              </div>
                                              <div className="space-y-1">
                                                {(() => {
                                                  const TYPE_FAMILIES: Record<string, string[]> = {
                                                    've': ['ve', 've0', 've1'],
                                                    've0': ['ve', 've0', 've1'],
                                                    've1': ['ve', 've0', 've1'],
                                                  };
                                                  const queryTypes = TYPE_FAMILIES[dotPopup.type] ?? [dotPopup.type];
                                                  const seen = new Set<string>();
                                                  return queryTypes.flatMap((rowType) =>
                                                    OMNI_POINT_CLASSES.flatMap((otherClass) => {
                                                      const atom = findOmniAtom(rowType as (typeof OMNI_POINT_CLASSES)[number], otherClass);
                                                      if (!atom || seen.has(atom)) return [];
                                                      seen.add(atom);
                                                      const alreadySelected = uniqueSelectedAtoms.includes(atom);
                                                      const compatible = alreadySelected || isCompatibleSubset(uniqueSelectedAtoms.filter((a) => a !== atom), atom);
                                                      return [(
                                                        <button
                                                          key={atom}
                                                          onMouseEnter={() => setHoveredGridAtom(atom)}
                                                          onMouseLeave={() => setHoveredGridAtom((current) => current === atom ? null : current)}
                                                          onClick={() => { toggleGridAtom(atom); setDotPopup(null); setHoveredGridAtom(null); }}
                                                          disabled={!compatible}
                                                          className={`w-full rounded-lg px-2 py-1.5 text-left text-[10px] font-mono transition-colors ${
                                                            alreadySelected
                                                              ? 'bg-blue-600/80 text-white'
                                                              : compatible
                                                                ? 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50'
                                                                : 'cursor-not-allowed text-neutral-600 opacity-40'
                                                          }`}
                                                        >
                                                          <span className="font-mono text-neutral-500 text-[9px]">{atom}</span>
                                                          {alreadySelected && <span className="ml-1 text-blue-200">✓</span>}
                                                        </button>
                                                      )];
                                                    })
                                                  );
                                                })()}
                                              </div>
                                            </motion.div>
                                          </>
                                        )}
                                      </AnimatePresence>
                                    </>
                                  )}
                                </div>
                              );
                            })()}
                          </Reorder.Item>
                        ))}
                      </Reorder.Group>
                    )}
                  </div>
            </section>

            {mode === '3d' && (
              <section>
                <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Maximize className="w-3 h-3" />
                  Final Step
                </h2>
                <div className="space-y-3 bg-neutral-800/20 p-4 rounded-2xl border border-neutral-800">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Mesh Finalization</span>
                    <span className="text-[10px] font-mono text-blue-400">
                      {finalization === 'none' ? 'off' : finalization}
                    </span>
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      ['none', 'Off'],
                      ['planarize', 'Planarize'],
                      ['canonicalize', 'Canonical'],
                    ] as Array<[MeshFinalizationMode, string]>).map(([value, label]) => (
                      <button
                        key={value}
                        onClick={() => setFinalization(value)}
                        className={`rounded-lg border px-2 py-2 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                          finalization === value
                            ? 'border-blue-700/60 bg-blue-950/20 text-blue-300'
                            : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/60'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <p className="text-[10px] leading-4 text-neutral-500">
                    Applied after the operator stack. Planarize only flattens faces. Canonical also drives edges toward unit-sphere tangency.
                  </p>
                </div>
              </section>
            )}

            <section>
              <AnimatePresence>
                {showOnboarding && allOnboardingComplete && (
                  <motion.div
                    key="callout-finish"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="callout-animate mb-4 flex items-start gap-2.5 rounded-xl bg-yellow-400 px-3 py-2.5 text-xs font-semibold text-yellow-900 shadow-lg shadow-yellow-900/30">
                      <span className="flex items-center justify-center w-4 h-4 rounded-full bg-yellow-900 text-yellow-300 text-[10px] font-bold shrink-0 mt-0.5">✓</span>
                      <span>When you're happy you can export or share the current {mode === '3d' ? 'shape' : 'tiling pattern'}. You can also return to the top at any time and choose a different base {mode === '3d' ? 'shape' : 'tiling'} to apply the operators to.</span>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
              <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Download className="w-3 h-3" />
                Export/Share
              </h2>
              <div className={`grid gap-2 ${mode === '3d' ? 'grid-cols-2' : 'grid-cols-3'}`}>
                {mode === '2d' && (
                <button
                  onClick={() => exportSvg(mode, tilingType, rows, cols, activeOperators, palette, colorMode, edgeColor, radialType, radialSides, generationOptions, finalization)}
                  className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                >
                  SVG
                </button>
                )}
                <button
                  onClick={() => exportObj(mode, tilingType, rows, cols, activeOperators, palette, colorMode, radialType, radialSides, generationOptions, finalization)}
                  className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                >
                  OBJ+MTL
                </button>
                <button
                  onClick={() => exportOff(mode, tilingType, rows, cols, activeOperators, palette, colorMode, radialType, radialSides, generationOptions, finalization)}
                  className="px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                >
                  OFF
                </button>
              </div>
              {blenderAvailable ? (
                <>
                  <button
                    onClick={async () => {
                      setBlenderStatus('sending');
                      setBlenderError(null);
                      const result = await sendToBlender(mode, tilingType, rows, cols, activeOperators, palette, colorMode, radialType, radialSides, generationOptions, finalization);
                      setBlenderStatus(result.ok ? 'ok' : 'error');
                      if (!result.ok) setBlenderError(result.error ?? null);
                      setTimeout(() => setBlenderStatus('idle'), 3000);
                    }}
                    disabled={blenderStatus === 'sending'}
                    className={`mt-2 w-full px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                      blenderStatus === 'ok'
                        ? 'bg-green-800/60 border-green-600/50 text-green-300'
                        : blenderStatus === 'error'
                        ? 'bg-red-800/60 border-red-600/50 text-red-300'
                        : 'bg-orange-900/30 border-orange-700/50 text-orange-400 hover:bg-orange-900/60 hover:text-orange-200'
                    }`}
                  >
                    {blenderStatus === 'sending' ? 'Sending...' : blenderStatus === 'ok' ? 'Sent to Blender!' : blenderStatus === 'error' ? 'Error' : 'Send to Blender'}
                  </button>
                  {blenderStatus === 'error' && blenderError && (
                    <p className="mt-1 text-[9px] text-red-400">{blenderError}</p>
                  )}
                </>
              ) : (
                <a
                  href="https://github.com/IxxyXR/polyhydra-web/releases/latest"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-2 w-full px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200 text-center block"
                >
                  Get Blender Add-on
                </a>
              )}
              <button
                onClick={async () => {
                  const params = buildAppSearchParams({
                    mode,
                    finalization,
                    radialType,
                    radialSides,
                    tilingType,
                    rows,
                    cols,
                    showEdges,
                    showVertices,
                    showFaces,
                    wireframe,
                    palette,
                    paletteColors: shuffledColors,
                    colorMode,
                    edgeColor,
                    embossEnabled,
                    embossWidth,
                    embossDepth,
                    embossSmoothness,
                    ambientLightIntensity,
                    keyLightIntensity,
                    keyLightAzimuth,
                    keyLightElevation,
                    faceRoughness,
                    faceOpacity,
                    multigridSettings,
                    operators,
                  });
                  const url = `${window.location.origin}${window.location.pathname}?${params.toString()}`;
                  if (navigator.share) {
                    await navigator.share({ url });
                  } else {
                    await navigator.clipboard.writeText(url);
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  }
                }}
                className="mt-2 w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
              >
                {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Link2 className="w-3 h-3" />}
                {copied ? 'Link Copied!' : 'Share'}
              </button>
            </section>
          </div>
        </div>

        <div className="p-6 border-t border-neutral-800 bg-neutral-900/80">
          <div className="flex items-center gap-3 text-neutral-500">
            <Info className="w-4 h-4" />
            <p className="text-[10px] leading-relaxed uppercase tracking-tight">
              Interactive 2D tiling visualization using half-edge topological data structures.
            </p>
          </div>
          <div className="mt-4 flex flex-wrap gap-3 font-mono text-[10px] text-neutral-500">
            <span title="Vertices">V <span id="stat-vertices">-</span></span>
            <span title="Faces">F <span id="stat-faces">-</span></span>
            <span title="Edges">E <span id="stat-edges">-</span></span>
            <span title="Colours Used" className="text-blue-400">C <span id="stat-colors">-</span></span>
          </div>
        </div>
        </aside>
        </div>
      </motion.div>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col min-w-0">
        <div className="w-full h-full">
          <TilingCanvas
            tilingType={tilingType}
            rows={rows}
            cols={cols}
            showEdges={showEdges}
            showVertices={showVertices}
            showFaces={showFaces}
            wireframe={wireframe}
            faceHighlight={faceHighlight}
            operators={activeOperators}
            palette={palette}
            paletteColors={shuffledColors ?? undefined}
            colorMode={colorMode}
            edgeColor={edgeColor}
            embossEnabled={embossEnabled}
            embossWidth={embossWidth}
            embossDepth={embossDepth}
            embossSmoothness={embossSmoothness}
            ambientLightIntensity={ambientLightIntensity}
            keyLightIntensity={keyLightIntensity}
            keyLightAzimuth={keyLightAzimuth}
            keyLightElevation={keyLightElevation}
            faceRoughness={faceRoughness}
            faceOpacity={faceOpacity}
            generationOptions={generationOptions}
            mode={mode}
            radialType={radialType}
            radialSides={radialSides}
            finalization={finalization}
            fitRequestKey={fitRequestKey}
          />
        </div>

        <AnimatePresence>
          {showOnboarding && (
            <motion.div
              key="onboarding"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="absolute bottom-20 right-6 z-20 w-60 rounded-2xl border border-neutral-700/60 bg-neutral-900/90 p-4 shadow-2xl backdrop-blur-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-300">Getting Started</span>
                <button onClick={dismissOnboarding} className="text-neutral-500 transition-colors hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-3">
                {[
                  { step: 1, label: onboardingStep1Label, done: step1Complete },
                  ...(!initialHadOperators ? [{ step: 2, label: 'Add an operator', done: step2Complete }] : []),
                  { step: initialHadOperators ? 2 : 3, label: 'Choose a preset or click Random', done: step3Complete },
                  { step: initialHadOperators ? 3 : 4, label: 'Edit the operator via diagram or grid', done: step4Complete },
                  { step: initialHadOperators ? 4 : 5, label: 'Adjust the sliders', done: step5Complete },
                ].map(({ step, label, done }) => (
                  <div key={step} className="flex items-start gap-3">
                    <div
                      className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                        done
                          ? 'bg-emerald-600 text-white'
                          : step === activeOnboardingStep
                            ? 'bg-blue-600 text-white'
                            : 'bg-neutral-700 text-neutral-500'
                      }`}
                    >
                      {done ? '✓' : step}
                    </div>
                    <span
                      className={`text-xs leading-relaxed transition-colors ${
                        done
                          ? 'text-neutral-600 line-through'
                          : step === activeOnboardingStep
                            ? 'text-white'
                            : 'text-neutral-500'
                      }`}
                    >
                      {label}
                    </span>
                  </div>
                ))}
              </div>
              <AnimatePresence>
                {allOnboardingComplete && (
                  <motion.div
                    key="completion"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="overflow-hidden"
                  >
                    <div className="mt-4">
                      <button
                        onClick={dismissOnboarding}
                        className="w-full rounded-lg bg-yellow-400 px-3 py-1.5 text-xs font-bold text-yellow-900 transition-colors hover:bg-yellow-300"
                      >
                        Finish
                      </button>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </motion.div>
          )}
        </AnimatePresence>

        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-10 flex items-center gap-4 rounded-full border border-neutral-800 bg-neutral-900/60 px-4 py-2 backdrop-blur-md">
          <div className="flex items-center gap-2">
             <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
             <span className="text-[10px] text-neutral-400 uppercase tracking-widest font-mono">Live Rendering</span>
           </div>
          <div className="w-px h-4 bg-neutral-800" />
          <button
            onClick={requestFitToExtents}
            className="flex items-center gap-2 rounded-full border border-neutral-700/80 bg-neutral-800/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-blue-700/60 hover:bg-blue-950/30 hover:text-white"
            title="Zoom to extents"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Zoom to Extents</span>
          </button>
          <div className="w-px h-4 bg-neutral-800" />
          <div className="flex gap-4">
            <TriangleIcon className="w-4 h-4 text-neutral-600" />
            <Square className="w-4 h-4 text-neutral-600" />
            <Hexagon className="w-4 h-4 text-neutral-600" />
          </div>
        </div>
      </main>
    </div>
  );
}
