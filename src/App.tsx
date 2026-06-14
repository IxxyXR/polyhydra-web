import React, { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence, Reorder } from 'motion/react';
import {
  Settings,
  Layers,
  Grid2X2,
  ChevronRight,
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
  Check,
  Headset
} from 'lucide-react';
import { TilingCanvas, TilingCanvasHandle } from './components/TilingCanvas';
import {
  MULTIGRID_DEFAULTS,
  MultiGridSettings,
  TilingGenerationOptions,
  UNIFORM_TILINGS,
} from './lib/tiling-geometries';
import { RadialBuildOptions, RadialPolyType, RADIAL_SHAPE_GROUPS, RADIAL_SOLID_NAMES, RADIAL_TYPES_WITH_SIDES } from './lib/radial-solids';
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
  joinAtomList,
  orderAtoms,
  parseOperatorSpec,
  parseAtomList,
  resolveOperatorNotation,
  serializeOperatorSpec,
  applyOperator,
  hasMeshEdgeCrossings,
  operatorHasInherentCrossings,
  getInherentCrossingCulprits,
  getOperatorParamRanges,
  generateRandomValidOperator,
  findCleanOperatorParams,
  classifyOperator,
  normalizeFaceFilter,
  operatorSupportsFaceFilter,
  OperatorSpec,
  FaceFilterMeasure,
  FaceFilterProperty,
  FaceFilterSpec,
  RoleShapeBasis,
} from './lib/conway-operators';
import {
  ClonerMode,
  ClonerStackItem,
  DeformerAxis,
  DeformerMode,
  DeformerStackItem,
  getPointGroupBaseOrder,
  getPointGroupCopyCount,
  isClonerStackItem,
  isDeformerStackItem,
  isOperatorStackItem,
  OperatorStackItem,
  POINT_ORBIT_SITES,
  POINT_GROUP_SYMMETRIES,
  PointOrbitSite,
  PointGroupSymmetry,
  StackItem,
  usesPointGroupOrder,
  WALLPAPER_PLANES,
  WALLPAPER_SYMMETRIES,
  WallpaperPlane,
  WallpaperSymmetry,
} from './lib/stack-items';

type OperatorState = OperatorStackItem;
type StackItemState = StackItem;

const DEFORMER_LABELS: Record<DeformerMode, string> = {
  stretch: 'Stretch',
  taper: 'Taper',
  spherify: 'Spherify',
  cylinderize: 'Cylinder',
  planarize: 'Planarize',
  canonicalize: 'Canonical',
  transform: 'Transform',
};

const CLONER_LABELS: Record<ClonerMode, string> = {
  point: '3D Symmetry',
  wallpaper: '2D Symmetry',
  array: 'Array',
};

function clampRangeValue(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function formatSliderValue(value: number, precision = 0) {
  if (!Number.isFinite(value)) return '0';
  return value.toFixed(precision);
}

function SliderValueField({
  value,
  min,
  max,
  step,
  onValueCommit,
  disabled,
  precision = 0,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onValueCommit: (value: number) => void;
  disabled?: boolean;
  precision?: number;
  suffix?: string;
}) {
  const [inputValue, setInputValue] = useState(() => formatSliderValue(value, precision));

  useEffect(() => {
    setInputValue(formatSliderValue(value, precision));
  }, [value, precision]);

  const commitValue = (rawValue: string) => {
    const parsed = Number.parseFloat(rawValue);
    if (!Number.isFinite(parsed)) {
      setInputValue(formatSliderValue(value, precision));
      return;
    }

    const clamped = clampRangeValue(parsed, min, max);
    onValueCommit(clamped);
    setInputValue(formatSliderValue(clamped, precision));
  };

  return (
    <label className="inline-flex items-center gap-1 justify-end">
      <input
        type="number"
        min={min}
        max={max}
        step={step}
        value={inputValue}
        disabled={disabled}
        onChange={(event) => setInputValue(event.currentTarget.value)}
        onBlur={(event) => commitValue(event.currentTarget.value)}
        className="slider-value-field w-14 text-right rounded border border-neutral-700 bg-neutral-800/60 px-2 py-0.5 text-[10px] font-mono text-neutral-100 focus:outline-none focus:border-blue-500 disabled:cursor-not-allowed disabled:opacity-55"
        style={{ appearance: 'none' }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
        }}
      />
      {suffix ? <span className="text-[10px] text-neutral-400">{suffix}</span> : null}
    </label>
  );
}

function getDefaultWallpaperUnitOffset(group: WallpaperSymmetry, width: number, height: number) {
  if (group === 'p1') {
    return { unitOffsetX: 0, unitOffsetY: 0 };
  }

  if (group === 'pm') {
    return { unitOffsetX: width * 0.25, unitOffsetY: 0 };
  }

  if (group === 'pg') {
    return { unitOffsetX: width * 0.2, unitOffsetY: height * 0.2 };
  }

  if (group === 'p4m' || group === 'p4g') {
    return { unitOffsetX: width * 0.25, unitOffsetY: height * 0.15 };
  }

  if (group === 'p2' || group === 'pmm' || group === 'pmg' || group === 'pgg' || group === 'cmm' || group === 'p4') {
    return { unitOffsetX: width * 0.25, unitOffsetY: height * 0.25 };
  }

  return { unitOffsetX: width * 0.25, unitOffsetY: height * 0.15 };
}

const APP_DEFAULTS = {
  mode: '2d' as const,
  radialType: 'Prism' as RadialPolyType,
  radialSides: 5,
  boxXSegments: 1,
  boxYSegments: 1,
  boxZSegments: 1,
  coneHeightSegments: 1,
  coneTaper: 1,
  torusProfileSides: 8,
  tilingType: '4.4.4.4',
  rows: 5,
  cols: 5,
  showEdges: false,
  showVertices: false,
  showFaces: true,
  wireframe: false,
  palette: 'vibrant' as PaletteKey,
  colorMode: 'role' as ColorMode,
  roleColorCount: 8,
  roleGeometryDetail: 3,
  roleShapeBasis: 'lengths-angles' as RoleShapeBasis,
  sideModulo: 8,
  sideOffset: 0,
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
  faceOpacity: 1,
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
  radialType: 'rt',
  radialSides: 'rs',
  boxXSegments: 'bx',
  boxYSegments: 'by',
  boxZSegments: 'bz',
  coneHeightSegments: 'ch',
  coneTaper: 'ct',
  torusProfileSides: 'tp',
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
  roleColorCount: 'rc',
  roleGeometryDetail: 'rd',
  roleShapeBasis: 'rb',
  sideModulo: 'sm',
  sideOffset: 'so',
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

const COLOR_MODE_TO_URL: Record<ColorMode, string> = {
  role: 'r',
  sides: 's',
  value: 'v',
};

function normalizeColorModeForTiling(colorMode: ColorMode, tilingType: string): ColorMode {
  return colorMode === 'value' ? 'role' : colorMode;
}

function getRenderColorMode(colorMode: ColorMode, tilingType: string): ColorMode {
  return tilingType === 'multigrid' && colorMode === 'role' ? 'value' : colorMode;
}

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
  'Rotunda',
  'ElongatedRotunda',
  'GyroelongatedRotunda',
  'OrthoBicupola',
  'GyroBicupola',
  'ElongatedOrthoBicupola',
  'ElongatedGyroBicupola',
  'GyroelongatedBicupola',
  'OrthoBirotunda',
  'GyroBirotunda',
  'ElongatedOrthoBirotunda',
  'ElongatedGyroBirotunda',
  'GyroelongatedBirotunda',
  'OrthoCupolaRotunda',
  'GyroCupolaRotunda',
  'ElongatedOrthoCupolaRotunda',
  'ElongatedGyroCupolaRotunda',
  'GyroelongatedCupolaRotunda',
  'Box',
  'Cone',
  'Torus',
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

function encodeSignedDeformerAmount(value: number) {
  return value < 0 ? `n${encodeOperatorParam(Math.abs(value))}` : encodeOperatorParam(value);
}

function decodeSignedDeformerAmount(value: string, fallback: number) {
  return value.startsWith('n')
    ? -decodeOperatorParam(value.slice(1), fallback)
    : decodeOperatorParam(value, fallback);
}

const FACE_FILTER_PROPERTY_TO_URL: Record<FaceFilterProperty, string> = {
  sides: 's',
};
const FACE_FILTER_PROPERTY_FROM_URL: Record<string, FaceFilterProperty> = {
  s: 'sides',
};
const FACE_FILTER_MEASURE_TO_URL: Record<FaceFilterMeasure, string> = {
  equal: 'e',
  'less-than': 'l',
  'is-even': 'v',
};
const FACE_FILTER_MEASURE_FROM_URL: Record<string, FaceFilterMeasure> = {
  e: 'equal',
  l: 'less-than',
  v: 'is-even',
};

function encodeFaceFilter(filter?: FaceFilterSpec) {
  if (!filter) return '';
  const normalized = normalizeFaceFilter(filter);
  return [
    'f',
    FACE_FILTER_PROPERTY_TO_URL[normalized.property],
    FACE_FILTER_MEASURE_TO_URL[normalized.measure],
    normalized.negate ? '1' : '0',
    normalized.value.toString(36).padStart(2, '0'),
    normalized.enabled ? '1' : '0',
  ].join('');
}

function decodeFaceFilter(value: string): FaceFilterSpec | undefined {
  if (!value.startsWith('f') || value.length < 6) return undefined;
  const property = FACE_FILTER_PROPERTY_FROM_URL[value[1]];
  const measure = FACE_FILTER_MEASURE_FROM_URL[value[2]];
  const parsedValue = Number.parseInt(value.slice(4, 6), 36);
  if (!property || !measure || !Number.isFinite(parsedValue)) return undefined;

  return normalizeFaceFilter({
    enabled: value[6] === undefined ? true : value[6] === '1',
    property,
    measure,
    negate: value[3] === '1',
    value: parsedValue,
  });
}

function serializeCompactOperator(operator: OperatorState) {
  let atomMask = 0;
  const atoms = parseAtomList(resolveOperatorNotation(operator.notation));
  if (atoms.length > 0 && getUnknownAtoms(atoms).length > 0) {
    const serialized = serializeOperatorSpec(operator);
    return `${operator.enabled ? '' : '!'}${serialized}`;
  }

  const selectedAtoms = new Set(atoms);
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
  const filterPayload = encodeFaceFilter(operator.faceFilter);

  const finalizationPayload = operator.finalizationAfter === 'canonicalize' ? '|c' : operator.finalizationAfter === 'none' ? '|n' : '';
  return `${operator.enabled ? '' : '!'}${payload}${filterPayload ? `~${filterPayload}` : ''}${finalizationPayload}`;
}

function serializeCompactStackItem(item: StackItemState) {
  if (isOperatorStackItem(item)) {
    return serializeCompactOperator(item);
  }

  if (isDeformerStackItem(item)) {
    const modeChar = item.mode === 'stretch' ? 's' : item.mode === 'taper' ? 't' : item.mode === 'spherify' ? 'p' : item.mode === 'planarize' ? 'q' : item.mode === 'canonicalize' ? 'k' : item.mode === 'cylinderize' ? 'z' : 'r';
    const prefix = `${item.enabled ? '' : '!'}d${modeChar}`;
    if (item.mode === 'planarize' || item.mode === 'canonicalize') {
      return prefix;
    }
    if (item.mode === 'transform') {
      const flags = (item.level ? 1 : 0) | (item.center ? 2 : 0);
      return [
        prefix,
        encodeOperatorParam((item.translateX + 10) / 20),
        encodeOperatorParam((item.translateY + 10) / 20),
        encodeOperatorParam((item.translateZ + 10) / 20),
        encodeOperatorParam((item.rotateX + 180) / 360),
        encodeOperatorParam((item.rotateY + 180) / 360),
        encodeOperatorParam((item.rotateZ + 180) / 360),
        encodeOperatorParam(item.scaleX / 4),
        encodeOperatorParam(item.scaleY / 4),
        encodeOperatorParam(item.scaleZ / 4),
        flags.toString(16),
      ].join('.');
    }
    if (item.mode === 'stretch') {
      return `${prefix}.${encodeOperatorParam(item.amount)}.${encodeOperatorParam(item.stretchStart)}.${encodeOperatorParam(item.stretchEnd)}.${item.axis}`;
    }
    const encodedAmount = item.mode === 'spherify' || item.mode === 'cylinderize'
      ? encodeSignedDeformerAmount(item.amount)
      : encodeOperatorParam(item.amount);
    return `${prefix}.${encodedAmount}${item.axis}`;
  }

  const mode = item.mode === 'point' ? 'p' : item.mode === 'array' ? 'a' : 'w';
  return [
    `${item.enabled ? '' : '!'}c${mode}`,
    item.mode === 'point' ? item.pointGroup : item.wallpaperGroup,
    Math.min(Math.max(Math.round(item.copies), 1), 48).toString(36),
    encodeOperatorParam(item.radius / 10),
    Math.min(Math.max(Math.round(item.xRepeats), 1), 24).toString(36),
    Math.min(Math.max(Math.round(item.yRepeats), 1), 24).toString(36),
    encodeOperatorParam(item.cellWidth / 20),
    encodeOperatorParam(item.cellHeight / 20),
    encodeOperatorParam((item.skewX + 10) / 20),
    encodeOperatorParam((item.skewY + 10) / 20),
    encodeOperatorParam(item.unitScale / 4),
    encodeOperatorParam((item.unitOffsetX + 10) / 20),
    encodeOperatorParam((item.unitOffsetY + 10) / 20),
    encodeOperatorParam(item.spacingX / 4),
    encodeOperatorParam(item.spacingY / 4),
    item.wallpaperAutoFit ? '1' : '0',
    item.wallpaperPlane,
    item.pointAutoFit ? '1' : '0',
    encodeOperatorParam(item.pointGap / 2),
    item.pointOrbitSite,
    // Array cloner state (indices 20-27, appended so older tokens still parse).
    Math.min(Math.max(Math.round(item.arrayCopies), 1), 64).toString(36),
    encodeOperatorParam((item.arrayTranslateX + 10) / 20),
    encodeOperatorParam((item.arrayTranslateY + 10) / 20),
    encodeOperatorParam((item.arrayTranslateZ + 10) / 20),
    encodeOperatorParam((item.arrayRotateX + 180) / 360),
    encodeOperatorParam((item.arrayRotateY + 180) / 360),
    encodeOperatorParam((item.arrayRotateZ + 180) / 360),
    encodeOperatorParam(item.arrayScale / 3),
  ].join('.');
}

function parseCompactOperator(token: string): OperatorState | null {
  const enabled = !token.startsWith('!');
  const fullPayload = enabled ? token : token.slice(1);
  const [mainPart, finalizationRaw] = fullPayload.split('|');
  const [payload, filterRaw] = mainPart.split('~');
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

  const params = paramRaw && paramRaw.length === 6
    ? {
        tVe: decodeOperatorParam(paramRaw.slice(0, 2), DEFAULT_OMNI_PARAMS.tVe),
        tVf: decodeOperatorParam(paramRaw.slice(2, 4), DEFAULT_OMNI_PARAMS.tVf),
        tFe: decodeOperatorParam(paramRaw.slice(4, 6), DEFAULT_OMNI_PARAMS.tFe),
      }
    : DEFAULT_OMNI_PARAMS;

  const finalizationAfter: MeshFinalizationMode = finalizationRaw === 'c' ? 'canonicalize' : finalizationRaw === 'n' ? 'none' : 'planarize';
  return {
    ...createOperator(joinAtomList(atoms), enabled, {
      ...params,
      faceFilter: filterRaw ? decodeFaceFilter(filterRaw) : undefined,
    }),
    finalizationAfter,
  };
}

function parseCompactStackItem(token: string): StackItemState | null {
  const enabled = !token.startsWith('!');
  const payload = enabled ? token : token.slice(1);

  if (payload.startsWith('d')) {
    const parts = payload.slice(1).split('.');
    const modeRaw = parts[0];
    const mode: DeformerMode = modeRaw === 't' ? 'taper' : modeRaw === 'p' ? 'spherify' : modeRaw === 'q' ? 'planarize' : modeRaw === 'k' ? 'canonicalize' : modeRaw === 'z' ? 'cylinderize' : modeRaw === 'r' ? 'transform' : 'stretch';
    if (mode === 'planarize' || mode === 'canonicalize') {
      return { ...createDeformer(mode), enabled };
    }
    if (mode === 'transform') {
      const flags = Number.parseInt(parts[10] ?? '0', 16);
      return {
        ...createDeformer(mode),
        enabled,
        translateX: decodeOperatorParam(parts[1] ?? '', 0.5) * 20 - 10,
        translateY: decodeOperatorParam(parts[2] ?? '', 0.5) * 20 - 10,
        translateZ: decodeOperatorParam(parts[3] ?? '', 0.5) * 20 - 10,
        rotateX: decodeOperatorParam(parts[4] ?? '', 0.5) * 360 - 180,
        rotateY: decodeOperatorParam(parts[5] ?? '', 0.5) * 360 - 180,
        rotateZ: decodeOperatorParam(parts[6] ?? '', 0.5) * 360 - 180,
        scaleX: decodeOperatorParam(parts[7] ?? '', 0.25) * 4,
        scaleY: decodeOperatorParam(parts[8] ?? '', 0.25) * 4,
        scaleZ: decodeOperatorParam(parts[9] ?? '', 0.25) * 4,
        level: !!(flags & 1),
        center: !!(flags & 2),
      };
    }
    if (mode === 'stretch' && parts.length >= 5) {
      const axisRaw = parts[4];
      const axis: DeformerAxis = axisRaw === 'x' || axisRaw === 'y' || axisRaw === 'z' ? axisRaw : 'y';
      return {
        ...createDeformer(mode),
        enabled,
        amount: decodeOperatorParam(parts[1] ?? '', 0.25),
        stretchStart: decodeOperatorParam(parts[2] ?? '', 0.75),
        stretchEnd: decodeOperatorParam(parts[3] ?? '', 0.25),
        axis,
      };
    }
    const paramsRaw = parts[1] ?? '';
    const axisRaw = paramsRaw.at(-1);
    const axis: DeformerAxis = axisRaw === 'x' || axisRaw === 'y' || axisRaw === 'z' ? axisRaw : 'y';
    const amountRaw = paramsRaw.slice(0, -1);
    return {
      ...createDeformer(mode),
      enabled,
      amount: mode === 'spherify' || mode === 'cylinderize'
        ? decodeSignedDeformerAmount(amountRaw, 0.5)
        : decodeOperatorParam(amountRaw.slice(0, 2), 0.25),
      axis,
    };
  }

  if (payload.startsWith('c')) {
    const parts = payload.slice(1).split('.');
    const [modeRaw] = parts;
    const mode: ClonerMode = modeRaw === 'w' ? 'wallpaper' : modeRaw === 'a' ? 'array' : 'point';
    const isLegacy = parts.length === 4;
    const groupRaw = isLegacy ? null : parts[1];
    const copiesRaw = isLegacy ? parts[1] : parts[2];
    const radiusRaw = isLegacy ? '' : parts[3];
    const xRepeatsRaw = isLegacy ? parts[1] : parts[4];
    const yRepeatsRaw = isLegacy ? parts[1] : parts[5];
    const cellWidthRaw = isLegacy ? parts[2] : parts[6];
    const cellHeightRaw = isLegacy ? parts[2] : parts[7];
    const skewXRaw = isLegacy ? '' : parts[8];
    const skewYRaw = isLegacy ? '' : parts[9];
    const unitScaleRaw = isLegacy ? '' : parts[10];
    const unitOffsetXRaw = isLegacy ? '' : parts[11];
    const unitOffsetYRaw = isLegacy ? '' : parts[12];
    const spacingXRaw = isLegacy ? '' : parts[13];
    const spacingYRaw = isLegacy ? '' : parts[14];
    const wallpaperAutoFitRaw = isLegacy ? '1' : parts[15];
    const wallpaperPlaneRaw = isLegacy ? 'xy' : parts[16];
    const pointAutoFitRaw = isLegacy ? '1' : parts[17];
    const pointGapRaw = isLegacy ? '' : parts[18];
    const pointOrbitSiteRaw = isLegacy ? 'generic' : parts[19];
    const arrayCopiesParsed = Number.parseInt(parts[20] ?? '', 36);
    const copies = Number.parseInt(copiesRaw ?? '', 36);
    const xRepeats = Number.parseInt(xRepeatsRaw ?? '', 36);
    const yRepeats = Number.parseInt(yRepeatsRaw ?? '', 36);
    const pointGroup = POINT_GROUP_SYMMETRIES.includes(groupRaw as PointGroupSymmetry)
      ? groupRaw as PointGroupSymmetry
      : 'O';
    const wallpaperGroup = WALLPAPER_SYMMETRIES.includes(groupRaw as WallpaperSymmetry)
      ? groupRaw as WallpaperSymmetry
      : 'p1';
    return {
      ...createCloner(mode),
      enabled,
      copies: Number.isFinite(copies) ? Math.min(Math.max(copies, 1), 48) : 4,
      pointGroup,
      pointAutoFit: pointAutoFitRaw !== '0',
      pointGap: decodeOperatorParam(pointGapRaw ?? '', 0.075) * 2,
      pointOrbitSite: POINT_ORBIT_SITES.includes(pointOrbitSiteRaw as PointOrbitSite)
        ? pointOrbitSiteRaw as PointOrbitSite
        : 'generic',
      wallpaperGroup,
      wallpaperPlane: WALLPAPER_PLANES.includes(wallpaperPlaneRaw as WallpaperPlane)
        ? wallpaperPlaneRaw as WallpaperPlane
        : 'xy',
      radius: decodeOperatorParam(radiusRaw ?? '', 0.2) * 10,
      xRepeats: Number.isFinite(xRepeats) ? Math.min(Math.max(xRepeats, 1), 24) : 2,
      yRepeats: Number.isFinite(yRepeats) ? Math.min(Math.max(yRepeats, 1), 24) : 2,
      cellWidth: decodeOperatorParam(cellWidthRaw ?? '', 0.08) * 20,
      cellHeight: decodeOperatorParam(cellHeightRaw ?? '', 0.08) * 20,
      cellOffsetX: 0.25,
      cellOffsetY: 0.5,
      skewX: decodeOperatorParam(skewXRaw ?? '', 0.5) * 20 - 10,
      skewY: decodeOperatorParam(skewYRaw ?? '', 0.5) * 20 - 10,
      unitScale: decodeOperatorParam(unitScaleRaw ?? '', 0.25) * 4,
      unitOffsetX: decodeOperatorParam(unitOffsetXRaw ?? '', 0.5) * 20 - 10,
      unitOffsetY: decodeOperatorParam(unitOffsetYRaw ?? '', 0.5) * 20 - 10,
      wallpaperAutoFit: wallpaperAutoFitRaw !== '0',
      spacingX: decodeOperatorParam(spacingXRaw ?? '', 0.25) * 4,
      spacingY: decodeOperatorParam(spacingYRaw ?? '', 0.25) * 4,
      arrayCopies: Number.isFinite(arrayCopiesParsed) ? Math.min(Math.max(arrayCopiesParsed, 1), 64) : 3,
      arrayTranslateX: decodeOperatorParam(parts[21] ?? '', 0.575) * 20 - 10,
      arrayTranslateY: decodeOperatorParam(parts[22] ?? '', 0.5) * 20 - 10,
      arrayTranslateZ: decodeOperatorParam(parts[23] ?? '', 0.5) * 20 - 10,
      arrayRotateX: decodeOperatorParam(parts[24] ?? '', 0.5) * 360 - 180,
      arrayRotateY: decodeOperatorParam(parts[25] ?? '', 0.5) * 360 - 180,
      arrayRotateZ: decodeOperatorParam(parts[26] ?? '', 0.5) * 360 - 180,
      arrayScale: decodeOperatorParam(parts[27] ?? '', 1 / 3) * 3,
    };
  }

  return parseCompactOperator(token);
}

function collapseRedundantEmptyOperators(items: StackItemState[]) {
  let hasEmptyOperator = false;
  return items.filter((item) => {
    if (!isOperatorStackItem(item) || resolveOperatorNotation(item.notation).trim() !== '') {
      return true;
    }

    if (hasEmptyOperator) {
      return false;
    }

    hasEmptyOperator = true;
    return true;
  });
}

function createOperator(notation: string, enabled = true, overrides: Partial<OperatorSpec> = {}): OperatorState {
  return {
    id: Math.random().toString(36).substring(7) + Date.now(),
    enabled,
    kind: 'operator',
    finalizationAfter: 'planarize',
    ...createOperatorSpec(notation, overrides),
  };
}

function createDeformer(mode: DeformerMode = 'stretch'): DeformerStackItem {
  return {
    id: Math.random().toString(36).substring(7) + Date.now(),
    enabled: true,
    kind: 'deformer',
    mode,
    amount: mode === 'spherify' || mode === 'cylinderize' ? 0.5 : 0.25,
    axis: 'y',
    stretchStart: 0.75,
    stretchEnd: 0.25,
    translateX: 0,
    translateY: 0,
    translateZ: 0,
    rotateX: 0,
    rotateY: 0,
    rotateZ: 0,
    scaleX: 1,
    scaleY: 1,
    scaleZ: 1,
    level: false,
    center: false,
  };
}

function createCloner(mode: ClonerMode = 'point'): ClonerStackItem {
  return {
    id: Math.random().toString(36).substring(7) + Date.now(),
    enabled: true,
    kind: 'cloner',
    mode,
    pointGroup: 'O',
    pointAutoFit: true,
    pointGap: 0.15,
    pointOrbitSite: 'generic',
    wallpaperGroup: 'p1',
    wallpaperPlane: 'xy',
    copies: 6,
    radius: 2,
    xRepeats: 2,
    yRepeats: 2,
    cellWidth: 1.6,
    cellHeight: 1.6,
    cellOffsetX: 0.25,
    cellOffsetY: 0.5,
    skewX: 0,
    skewY: 0,
    unitScale: 1,
    unitOffsetX: 0,
    unitOffsetY: 0,
    wallpaperAutoFit: true,
    spacingX: 1,
    spacingY: 1,
    spacing: 1.1,
    rotation: 0,
    arrayCopies: 3,
    arrayTranslateX: 1.5,
    arrayTranslateY: 0,
    arrayTranslateZ: 0,
    arrayRotateX: 0,
    arrayRotateY: 0,
    arrayRotateZ: 0,
    arrayScale: 1,
  };
}

function buildAppSearchParams(state: {
  mode: '2d' | '3d';
  radialType: RadialPolyType;
  radialSides: number;
  boxXSegments: number;
  boxYSegments: number;
  boxZSegments: number;
  coneHeightSegments: number;
  coneTaper: number;
  torusProfileSides: number;
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
  roleColorCount: number;
  roleGeometryDetail: number;
  roleShapeBasis: RoleShapeBasis;
  sideModulo: number;
  sideOffset: number;
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
  operators: StackItemState[];
}) {
  const params = new URLSearchParams();
  setParamIfNeeded(params, URL_KEYS.mode, MODE_TO_URL[state.mode], MODE_TO_URL[APP_DEFAULTS.mode]);
  setParamIfNeeded(
    params,
    URL_KEYS.radialType,
    encodeAliasedValue(state.radialType, RADIAL_TYPE_KEY_TO_ALIAS),
    encodeAliasedValue(APP_DEFAULTS.radialType, RADIAL_TYPE_KEY_TO_ALIAS)
  );
  setParamIfNeeded(params, URL_KEYS.radialSides, state.radialSides, APP_DEFAULTS.radialSides);
  setParamIfNeeded(params, URL_KEYS.boxXSegments, state.boxXSegments, APP_DEFAULTS.boxXSegments);
  setParamIfNeeded(params, URL_KEYS.boxYSegments, state.boxYSegments, APP_DEFAULTS.boxYSegments);
  setParamIfNeeded(params, URL_KEYS.boxZSegments, state.boxZSegments, APP_DEFAULTS.boxZSegments);
  setParamIfNeeded(params, URL_KEYS.coneHeightSegments, state.coneHeightSegments, APP_DEFAULTS.coneHeightSegments);
  setParamIfNeeded(params, URL_KEYS.coneTaper, state.coneTaper, APP_DEFAULTS.coneTaper);
  setParamIfNeeded(params, URL_KEYS.torusProfileSides, state.torusProfileSides, APP_DEFAULTS.torusProfileSides);
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
  setParamIfNeeded(params, URL_KEYS.roleColorCount, state.roleColorCount, APP_DEFAULTS.roleColorCount);
  setParamIfNeeded(params, URL_KEYS.roleGeometryDetail, state.roleGeometryDetail, APP_DEFAULTS.roleGeometryDetail);
  setParamIfNeeded(params, URL_KEYS.roleShapeBasis, state.roleShapeBasis, APP_DEFAULTS.roleShapeBasis);
  setParamIfNeeded(params, URL_KEYS.sideModulo, state.sideModulo, APP_DEFAULTS.sideModulo);
  setParamIfNeeded(params, URL_KEYS.sideOffset, state.sideOffset, APP_DEFAULTS.sideOffset);
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
    params.set(URL_KEYS.operators, state.operators.map(serializeCompactStackItem).join(';'));
  }
  return params;
}

function parseOperatorsFromUrlParam(urlOps: string): StackItemState[] {
  const compactOperatorPattern = /^!?(?:[0-9a-z]+(?:\.[0-9a-z]{6})?(?:~f[srv][elv][01][0-9a-z]{2}[01]?)?(?:\|[cn])?|d[stpqkzr](?:\.[a-z0-9]+)*|c[apw](?:\.[a-z0-9]+)+)$/i;
  const parseLegacyEntry = (entry: string) => {
    const decoded = decodeURIComponent(entry);
    const isEnabled = !decoded.startsWith('!');
    const serialized = isEnabled ? decoded : decoded.substring(1);
    const spec = parseOperatorSpec(serialized);
    return createOperator(spec.notation, isEnabled, spec);
  };

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

  return collapseRedundantEmptyOperators(entries.map((entry) => {
    if (compactOperatorPattern.test(entry)) {
      return parseCompactStackItem(entry) ?? parseLegacyEntry(entry);
    }
    return parseLegacyEntry(entry);
  }));
}

export default function App() {
  const [mode, setMode] = useState<'2d' | '3d'>(APP_DEFAULTS.mode);
  const [radialType, setRadialType] = useState<RadialPolyType>(APP_DEFAULTS.radialType);
  const [radialSides, setRadialSides] = useState(APP_DEFAULTS.radialSides);
  const [boxXSegments, setBoxXSegments] = useState(APP_DEFAULTS.boxXSegments);
  const [boxYSegments, setBoxYSegments] = useState(APP_DEFAULTS.boxYSegments);
  const [boxZSegments, setBoxZSegments] = useState(APP_DEFAULTS.boxZSegments);
  const [coneHeightSegments, setConeHeightSegments] = useState(APP_DEFAULTS.coneHeightSegments);
  const [coneTaper, setConeTaper] = useState(APP_DEFAULTS.coneTaper);
  const [torusProfileSides, setTorusProfileSides] = useState(APP_DEFAULTS.torusProfileSides);
  const [shapeMenuOpen, setShapeMenuOpen] = useState(false);
  const [tilingType, setTilingType] = useState(APP_DEFAULTS.tilingType);
  const [rows, setRows] = useState(APP_DEFAULTS.rows);
  const [cols, setCols] = useState(APP_DEFAULTS.cols);
  const [showEdges, setShowEdges] = useState(APP_DEFAULTS.showEdges);
  const [showVertices, setShowVertices] = useState(APP_DEFAULTS.showVertices);
  const [showFaces, setShowFaces] = useState(APP_DEFAULTS.showFaces);
  const [wireframe, setWireframe] = useState(APP_DEFAULTS.wireframe);
  const [isReady, setIsReady] = useState(false);
  const isPopStateRef = useRef(false);
  const [operators, setOperators] = useState<StackItemState[]>([]);
  const [palette, setPalette] = useState<PaletteKey>(APP_DEFAULTS.palette);
  const [shuffledColors, setShuffledColors] = useState<string[] | null>(null);
  const [colorMode, setColorMode] = useState<ColorMode>(APP_DEFAULTS.colorMode);
  const [roleColorCount, setRoleColorCount] = useState(APP_DEFAULTS.roleColorCount);
  const [roleGeometryDetail, setRoleGeometryDetail] = useState(APP_DEFAULTS.roleGeometryDetail);
  const [roleShapeBasis, setRoleShapeBasis] = useState<RoleShapeBasis>(APP_DEFAULTS.roleShapeBasis);
  const [sideModulo, setSideModulo] = useState(APP_DEFAULTS.sideModulo);
  const [sideOffset, setSideOffset] = useState(APP_DEFAULTS.sideOffset);
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
  const [lightingMenuOpen, setLightingMenuOpen] = useState(false);
  const [paletteMenuOpen, setPaletteMenuOpen] = useState(false);
  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(null);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [advancedWallpaperOpen, setAdvancedWallpaperOpen] = useState(false);
  const [rawEditorOpen, setRawEditorOpen] = useState(false);
  const [presetPickerOpen, setPresetPickerOpen] = useState(false);
  const [hoveredGridAtom, setHoveredGridAtom] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [blenderStatus, setBlenderStatus] = useState<'idle' | 'sending' | 'ok' | 'error'>('idle');
  const [blenderError, setBlenderError] = useState<string | null>(null);
  const sendToBlenderNow = async () => {
    setBlenderStatus('sending');
    setBlenderError(null);
    const result = await sendToBlender(mode, tilingType, rows, cols, activeOperators, palette, getRenderColorMode(colorMode, tilingType), roleColorCount, roleGeometryDetail, roleShapeBasis, sideModulo, sideOffset, radialType, radialSides, radialBuildOptions, generationOptions);
    if (result.ok) {
      setBlenderStatus('ok');
      setTimeout(() => setBlenderStatus('idle'), 3000);
    } else {
      // The localhost probe only happens here, on an explicit click — so no
      // Local Network Access prompt fires on page load. On failure we surface
      // the choice (open Blender + retry, or download the add-on).
      setBlenderError(result.error ?? null);
      setBlenderStatus('error');
    }
  };
  const [hoveredDotType, setHoveredDotType] = useState<string | null>(null);
  const [dotPopup, setDotPopup] = useState<{ type: string; x: number; y: number } | null>(null);
  const [presetsMenuOpen, setPresetsMenuOpen] = useState(false);
  const [userPresets, setUserPresets] = useState<AppPreset[]>(() => getUserPresets());
  const [newPresetName, setNewPresetName] = useState('');
  const [savePresetInputVisible, setSavePresetInputVisible] = useState(false);
  const [fitRequestKey, setFitRequestKey] = useState(0);
  const [webXrSupported, setWebXrSupported] = useState<boolean | null>(null);
  const [webXrError, setWebXrError] = useState<string | null>(null);
  const [isGeometryGenerating, setIsGeometryGenerating] = useState(true);
  const tilingCanvasRef = useRef<TilingCanvasHandle | null>(null);
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
  const [showPresetTutorialStep, setShowPresetTutorialStep] = useState(() => initialHadOperators);

  const step1Complete = mode === '3d' ? shapeEverOpened : tilingEverOpened;
  const step2Complete = !showPresetTutorialStep && operators.length > 0;
  const step3Complete = presetOrRandomUsed;
  const step4Complete = diagramOrGridClicked;
  const step5Complete = sliderMoved;
  const allOnboardingComplete = step1Complete && step2Complete && step3Complete && step4Complete && step5Complete;
  const showOnboarding = !onboardingDismissed;
  const isPresetTutorialStep = showOnboarding && showPresetTutorialStep;
  const activeOnboardingStep = isPresetTutorialStep
    ? 0
    : !step1Complete
      ? 1
      : !step2Complete
        ? 2
        : !step3Complete
          ? 3
          : !step4Complete
            ? 4
            : !step5Complete
              ? 5
              : 6;
  const onboardingStep1Label = mode === '3d' ? 'Pick a shape' : 'Pick a tiling';
  const onboardingStepItems = useMemo(() => {
    const baseSteps = [
      { step: 1, label: onboardingStep1Label, done: step1Complete },
      { step: 2, label: 'Add an operator', done: step2Complete },
      { step: 3, label: 'Choose a preset or click Random', done: step3Complete },
      { step: 4, label: 'Edit the operator via diagram or grid', done: step4Complete },
      { step: 5, label: 'Adjust the sliders', done: step5Complete },
    ];

    if (!isPresetTutorialStep) return baseSteps;
    return [{ step: 0, label: 'Opened with a preset. Want a brief tutorial?', done: false }, ...baseSteps];
  }, [isPresetTutorialStep, onboardingStep1Label, step1Complete, step2Complete, step3Complete, step4Complete, step5Complete]);

  const isAddOperatorOnboardingLocked = showOnboarding && activeOnboardingStep === 2;

  const dismissOnboarding = () => {
    localStorage.setItem('polyhydra-onboarding-done', '1');
    setOnboardingDismissed(true);
  };

  const requestFitToExtents = () => {
    setFitRequestKey((current) => current + 1);
  };

  const handleGeometryGenerationChange = useCallback((isGenerating: boolean) => {
    setIsGeometryGenerating(isGenerating);
  }, []);

  const enterWebXR = async () => {
    setWebXrError(null);
    try {
      await tilingCanvasRef.current?.enterWebXR();
    } catch (error) {
      setWebXrError(error instanceof Error ? error.message : 'Unable to start WebXR.');
    }
  };

  const setModeAndFit = (nextMode: '2d' | '3d') => {
    setMode(nextMode);
    requestFitToExtents();
  };

  const clearToDefaults = () => {
    setMode(APP_DEFAULTS.mode);
    setRadialType(APP_DEFAULTS.radialType);
    setRadialSides(APP_DEFAULTS.radialSides);
    setBoxXSegments(APP_DEFAULTS.boxXSegments);
    setBoxYSegments(APP_DEFAULTS.boxYSegments);
    setBoxZSegments(APP_DEFAULTS.boxZSegments);
    setConeHeightSegments(APP_DEFAULTS.coneHeightSegments);
    setConeTaper(APP_DEFAULTS.coneTaper);
    setTorusProfileSides(APP_DEFAULTS.torusProfileSides);
    setTilingType(APP_DEFAULTS.tilingType);
    setRows(APP_DEFAULTS.rows);
    setCols(APP_DEFAULTS.cols);
    setShowEdges(APP_DEFAULTS.showEdges);
    setShowVertices(APP_DEFAULTS.showVertices);
    setShowFaces(APP_DEFAULTS.showFaces);
    setWireframe(APP_DEFAULTS.wireframe);
    setPalette(APP_DEFAULTS.palette);
    setShuffledColors(null);
    setColorMode(APP_DEFAULTS.colorMode);
    setRoleColorCount(APP_DEFAULTS.roleColorCount);
    setRoleGeometryDetail(APP_DEFAULTS.roleGeometryDetail);
    setRoleShapeBasis(APP_DEFAULTS.roleShapeBasis);
    setSideModulo(APP_DEFAULTS.sideModulo);
    setSideOffset(APP_DEFAULTS.sideOffset);
    setEdgeColor(APP_DEFAULTS.edgeColor);
    setEmbossEnabled(APP_DEFAULTS.embossEnabled);
    setEmbossWidth(APP_DEFAULTS.embossWidth);
    setEmbossDepth(APP_DEFAULTS.embossDepth);
    setEmbossSmoothness(APP_DEFAULTS.embossSmoothness);
    setAmbientLightIntensity(APP_DEFAULTS.ambientLightIntensity);
    setKeyLightIntensity(APP_DEFAULTS.keyLightIntensity);
    setKeyLightAzimuth(APP_DEFAULTS.keyLightAzimuth);
    setKeyLightElevation(APP_DEFAULTS.keyLightElevation);
    setFaceRoughness(APP_DEFAULTS.faceRoughness);
    setFaceOpacity(APP_DEFAULTS.faceOpacity);
    setMultigridSettings({ ...MULTIGRID_DEFAULTS });
    setOperators([]);
    setSelectedOperatorId(null);
    setPresetOrRandomUsed(false);
    setSliderMoved(false);
    setDiagramOrGridClicked(false);
    setShapeEverOpened(false);
    setTilingEverOpened(false);
    setShowPresetTutorialStep(false);
    setAddMenuOpen(false);
    setShapeMenuOpen(false);
    setTilingMenuOpen(false);
    setDisplayMenuOpen(false);
    setLightingMenuOpen(false);
    setPaletteMenuOpen(false);
    setAdvancedWallpaperOpen(false);
    setRawEditorOpen(false);
    setPresetPickerOpen(false);
    setHoveredDotType(null);
    setDotPopup(null);
    setHoveredGridAtom(null);
    requestFitToExtents();
  };

  const startPresetTutorial = () => {
    clearToDefaults();
  };

  const skipPresetTutorial = () => {
    setShowPresetTutorialStep(false);
    dismissOnboarding();
  };

  useEffect(() => {
    let active = true;

    const checkWebXR = async () => {
      const supported = await tilingCanvasRef.current?.isWebXRSupported();
      if (active) {
        setWebXrSupported(supported ?? false);
      }
    };

    window.setTimeout(checkWebXR, 0);

    return () => {
      active = false;
    };
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
      setRadialSides(parsed >= 3 && parsed <= 64 ? parsed : APP_DEFAULTS.radialSides);
    }
    const parsedBoxXSegments = parseIntParam(getUrlParam(params, URL_KEYS.boxXSegments, 'boxXSegments'), APP_DEFAULTS.boxXSegments);
    const parsedBoxYSegments = parseIntParam(getUrlParam(params, URL_KEYS.boxYSegments, 'boxYSegments'), APP_DEFAULTS.boxYSegments);
    const parsedBoxZSegments = parseIntParam(getUrlParam(params, URL_KEYS.boxZSegments, 'boxZSegments'), APP_DEFAULTS.boxZSegments);
    const parsedConeHeightSegments = parseIntParam(getUrlParam(params, URL_KEYS.coneHeightSegments, 'coneHeightSegments'), APP_DEFAULTS.coneHeightSegments);
    const parsedConeTaper = parseFloatParam(getUrlParam(params, URL_KEYS.coneTaper, 'coneTaper'), APP_DEFAULTS.coneTaper);
    const parsedTorusProfileSides = parseIntParam(getUrlParam(params, URL_KEYS.torusProfileSides, 'torusProfileSides'), APP_DEFAULTS.torusProfileSides);
    setBoxXSegments(Math.min(Math.max(parsedBoxXSegments, 1), 32));
    setBoxYSegments(Math.min(Math.max(parsedBoxYSegments, 1), 32));
    setBoxZSegments(Math.min(Math.max(parsedBoxZSegments, 1), 32));
    setConeHeightSegments(Math.min(Math.max(parsedConeHeightSegments, 1), 32));
    setConeTaper(Math.min(Math.max(parsedConeTaper, 0), 2));
    setTorusProfileSides(Math.min(Math.max(parsedTorusProfileSides, 3), 32));

    const urlTiling = decodeAliasedValue(
      getUrlParam(params, URL_KEYS.tiling, 'tiling'),
      TILING_ALIAS_TO_KEY
    );
    const resolvedTilingType = urlTiling && UNIFORM_TILINGS[urlTiling] ? urlTiling : APP_DEFAULTS.tilingType;
    setTilingType(resolvedTilingType);

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
    const resolvedColorMode: ColorMode = urlColorMode === 'role' || urlColorMode === 'sides' || urlColorMode === 'value'
      ? urlColorMode
      : urlColorMode === COLOR_MODE_TO_URL.role
        ? 'role'
        : urlColorMode === COLOR_MODE_TO_URL.sides
          ? 'sides'
          : urlColorMode === COLOR_MODE_TO_URL.value
            ? 'value'
            : APP_DEFAULTS.colorMode;
    setColorMode(normalizeColorModeForTiling(resolvedColorMode, resolvedTilingType));

    const parsedRoleColorCount = parseIntParam(getUrlParam(params, URL_KEYS.roleColorCount, 'roleColors'), APP_DEFAULTS.roleColorCount);
    setRoleColorCount(Math.min(Math.max(parsedRoleColorCount, 2), 8));

    const parsedRoleGeometryDetail = parseIntParam(getUrlParam(params, URL_KEYS.roleGeometryDetail, 'roleDetail'), APP_DEFAULTS.roleGeometryDetail);
    setRoleGeometryDetail(Math.min(Math.max(parsedRoleGeometryDetail, 0), 5));

    const urlRoleShapeBasis = getUrlParam(params, URL_KEYS.roleShapeBasis, 'roleBasis');
    setRoleShapeBasis(
      urlRoleShapeBasis === 'sides' || urlRoleShapeBasis === 'angles' || urlRoleShapeBasis === 'lengths-angles'
        ? urlRoleShapeBasis
        : APP_DEFAULTS.roleShapeBasis
    );

    const parsedSideModulo = parseIntParam(getUrlParam(params, URL_KEYS.sideModulo, 'sideModulo'), APP_DEFAULTS.sideModulo);
    const legacySideBasis = getUrlParam(params, 'sb', 'sideBasis');
    const resolvedSideModulo =
      legacySideBasis === 'modulo' && params.get(URL_KEYS.sideModulo) === null
        ? APP_DEFAULTS.sideModulo
        : Math.min(Math.max(parsedSideModulo, 2), APP_DEFAULTS.sideModulo);
    setSideModulo(resolvedSideModulo);

    const parsedSideOffset = parseIntParam(getUrlParam(params, URL_KEYS.sideOffset, 'sideOffset'), APP_DEFAULTS.sideOffset);
    setSideOffset(((parsedSideOffset % resolvedSideModulo) + resolvedSideModulo) % resolvedSideModulo);

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
      radialType,
      radialSides,
      boxXSegments,
      boxYSegments,
      boxZSegments,
      coneHeightSegments,
      coneTaper,
      torusProfileSides,
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
      roleColorCount,
      roleGeometryDetail,
      roleShapeBasis,
      sideModulo,
      sideOffset,
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
  }, [mode, radialType, radialSides, boxXSegments, boxYSegments, boxZSegments, coneHeightSegments, coneTaper, torusProfileSides, tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, operators, palette, shuffledColors, colorMode, roleColorCount, roleGeometryDetail, roleShapeBasis, sideModulo, sideOffset, edgeColor, embossEnabled, embossWidth, embossDepth, embossSmoothness, ambientLightIntensity, keyLightIntensity, keyLightAzimuth, keyLightElevation, faceRoughness, faceOpacity, multigridSettings, isReady]);


  const applyPreset = (preset: AppPreset) => {
    applyParamsFromUrl('?' + preset.params);
    requestFitToExtents();
    setPresetsMenuOpen(false);
    setSavePresetInputVisible(false);
    setNewPresetName('');
  };

  const saveCurrentPreset = () => {
    if (!newPresetName.trim()) return;
    const params = buildAppSearchParams({ mode, radialType, radialSides, boxXSegments, boxYSegments, boxZSegments, coneHeightSegments, coneTaper, torusProfileSides, tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, palette, paletteColors: shuffledColors, colorMode, roleColorCount, roleGeometryDetail, roleShapeBasis, sideModulo, sideOffset, edgeColor, embossEnabled, embossWidth, embossDepth, embossSmoothness, ambientLightIntensity, keyLightIntensity, keyLightAzimuth, keyLightElevation, faceRoughness, faceOpacity, multigridSettings, operators });
    saveUserPreset({ name: newPresetName.trim(), params: params.toString() });
    setUserPresets(getUserPresets());
    setNewPresetName('');
    setSavePresetInputVisible(false);
  };

  const copyCurrentAsExamplePreset = async () => {
    const params = buildAppSearchParams({ mode, radialType, radialSides, boxXSegments, boxYSegments, boxZSegments, coneHeightSegments, coneTaper, torusProfileSides, tilingType, rows, cols, showEdges, showVertices, showFaces, wireframe, palette, paletteColors: shuffledColors, colorMode, roleColorCount, roleGeometryDetail, roleShapeBasis, sideModulo, sideOffset, edgeColor, embossEnabled, embossWidth, embossDepth, embossSmoothness, ambientLightIntensity, keyLightIntensity, keyLightAzimuth, keyLightElevation, faceRoughness, faceOpacity, multigridSettings, operators });
    const entry = `{ name: 'name', params: '${params.toString()}'},`;
    await navigator.clipboard.writeText(entry);
  };

  const addOperator = (notation: string, overrides: Partial<OperatorSpec> = {}) => {
    if (!notation.trim()) return;
    const nextOperator = createOperator(notation.trim(), true, overrides);
    setOperators((current) => [...current, nextOperator]);
    setSelectedOperatorId(nextOperator.id);
    setAddMenuOpen(false);
  };

  const getSaneOperatorParams = (notation: string): Pick<OperatorSpec, 'tVe' | 'tVf' | 'tFe'> => {
    const [tVe, tVf, tFe] = findCleanOperatorParams(notation) ?? [
      DEFAULT_OMNI_PARAMS.tVe,
      DEFAULT_OMNI_PARAMS.tVf,
      DEFAULT_OMNI_PARAMS.tFe,
    ];
    return { tVe, tVf, tFe };
  };

  const getRandomOperatorNotation = (): string => {
    const generated = generateRandomValidOperator();
    if (generated) return generated;

    const randomIndex = Math.floor(Math.random() * OMNI_VALID_OPERATORS.length);
    return joinAtomList(orderAtoms(OMNI_VALID_OPERATORS[randomIndex]));
  };

  const addBlankOperator = () => {
    const nextOperator = createOperator('', true);
    setOperators((current) => [...current, nextOperator]);
    setSelectedOperatorId(nextOperator.id);
    setAddMenuOpen(false);
  };

  const addDeformer = (mode: DeformerMode) => {
    if (isAddOperatorOnboardingLocked) return;
    const nextDeformer = createDeformer(mode);
    setOperators((current) => [...current, nextDeformer]);
    setSelectedOperatorId(nextDeformer.id);
    setAddMenuOpen(false);
  };

  const addCloner = (mode: ClonerMode) => {
    if (isAddOperatorOnboardingLocked) return;
    const nextCloner = createCloner(mode);
    setOperators((current) => [...current, nextCloner]);
    setSelectedOperatorId(nextCloner.id);
    setAddMenuOpen(false);
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
    const notation = getRandomOperatorNotation();
    const params = getSaneOperatorParams(notation);
    setOperators((current) => current.map((op) =>
      op.id === selectedOperatorId && isOperatorStackItem(op) ? { ...op, notation, ...params } : op
    ));
  };

  const selectedStackItem = operators.find((op) => op.id === selectedOperatorId) ?? null;
  const selectedOperator = selectedStackItem && isOperatorStackItem(selectedStackItem) ? selectedStackItem : null;
  const selectedOperatorNotation = selectedOperator ? resolveOperatorNotation(selectedOperator.notation) : '';
  const selectedAtoms = parseAtomList(selectedOperatorNotation);
  const orderedSelectedAtoms = orderAtoms(selectedAtoms);
  const uniqueSelectedAtoms = Array.from(new Set(selectedAtoms));
  const unknownSelectedAtoms = getUnknownAtoms(uniqueSelectedAtoms);
  // Single source of truth for the status badge: empty / invalid / degree1 /
  // degree2 / complete / crossing (vertex-valence based; see classifyOperator).
  const selectedOperatorStatus = classifyOperator(selectedOperatorNotation);
  const selectedMatchingPresetName = unknownSelectedAtoms.length === 0 ? findPresetName(uniqueSelectedAtoms) : null;
  const selectedPresetValue = !selectedOperatorNotation.trim()
    ? NO_PRESET_VALUE
    : (selectedMatchingPresetName ?? CUSTOM_PRESET_VALUE);
  const selectedOperatorDiagramSvg = createOmniOperatorDiagramSvg(selectedOperatorNotation, hoveredGridAtom) ?? (selectedOperatorNotation.trim() === '' ? createEmptyDiagramSvg(hoveredGridAtom) : null);
  const activeOperators = useMemo(() => operators.filter((op) => op.enabled), [operators]);
  const selectedOperatorSupportsFaceFilter = selectedOperator ? operatorSupportsFaceFilter(selectedOperator) : false;
  const selectedFaceFilter = normalizeFaceFilter(selectedOperator?.faceFilter);

  const updateSelectedOperatorNotation = (notation: string) => {
    if (!selectedOperatorId) return;
    setOperators((current) => current.map((op) =>
      op.id === selectedOperatorId && isOperatorStackItem(op) ? { ...op, notation } : op
    ));
  };

  const selectOperator = (id: string) => {
    setSelectedOperatorId(id);
    setAddMenuOpen(false);
    setRawEditorOpen(false);
    setPresetPickerOpen(false);
    setDotPopup(null);
    setHoveredDotType(null);
  };

  const toggleGridAtom = (atom: string) => {
    if (!selectedOperatorId || !selectedOperator) return;

    const nextAtoms = new Set(uniqueSelectedAtoms);
    if (nextAtoms.has(atom)) {
      nextAtoms.delete(atom);
    } else {
      nextAtoms.add(atom);
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
      op.id === id && isOperatorStackItem(op)
        ? { ...op, [field]: Number.isFinite(parsed) ? parsed : DEFAULT_OMNI_PARAMS[field] }
        : op
    ));
  };

  const updateOperatorFaceFilter = (id: string, patch: Partial<FaceFilterSpec>) => {
    setOperators((current) => current.map((op) => (
      op.id === id && isOperatorStackItem(op)
        ? { ...op, faceFilter: normalizeFaceFilter({ ...normalizeFaceFilter(op.faceFilter), ...patch }) }
        : op
    )));
  };

  const updateOperatorFinalization = (id: string, finalizationAfter: MeshFinalizationMode) => {
    setOperators((current) => current.map((op) =>
      op.id === id && isOperatorStackItem(op) ? { ...op, finalizationAfter } : op
    ));
  };

  const updateDeformer = (id: string, patch: Partial<Omit<DeformerStackItem, 'id' | 'kind'>>) => {
    setOperators((current) => current.map((op) => (
      op.id === id && isDeformerStackItem(op) ? { ...op, ...patch } : op
    )));
  };

  const updateCloner = (id: string, patch: Partial<Omit<ClonerStackItem, 'id' | 'kind'>>) => {
    setOperators((current) => current.map((op) => (
      op.id === id && isClonerStackItem(op) ? { ...op, ...patch } : op
    )));
  };

  const updatePointClonerCopies = (id: string, value: number) => {
    setOperators((current) => current.map((op) => {
      if (op.id !== id || !isClonerStackItem(op) || op.mode !== 'point') {
        return op;
      }

      return { ...op, copies: Math.min(Math.max(Math.round(value), 1), 12) };
    }));
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
  const isBoxShape = radialType === 'Box';
  const isConeShape = radialType === 'Cone';
  const isTorusShape = radialType === 'Torus';
  const hasBaseSettings = mode !== '3d' || radialTypeUsesSides || isBoxShape;
  const renderColorMode = getRenderColorMode(colorMode, tilingType);
  const xrPanel = useMemo(() => ({
    mode,
    showFaces,
    showEdges,
    colorMode: renderColorMode,
    paletteName: selectedPalette.name,
    paletteColors: shuffledColors ?? selectedPalette.colors,
    selectedOperator: selectedOperator
      ? {
          id: selectedOperator.id,
          label: selectedMatchingPresetName ?? `Operator ${operators.findIndex((op) => op.id === selectedOperator.id) + 1}`,
          notation: selectedOperatorNotation,
          enabled: selectedOperator.enabled,
          tVe: selectedOperator.tVe,
          tVf: selectedOperator.tVf,
          tFe: selectedOperator.tFe,
        }
      : null,
    operatorCount: operators.length,
    onModeChange: (nextMode: '2d' | '3d') => setModeAndFit(nextMode),
    onToggleFaces: () => setShowFaces((current) => !current),
    onToggleEdges: () => setShowEdges((current) => !current),
    onCycleColorMode: () => setColorMode((current) => current === 'role' ? 'sides' : 'role'),
    onShufflePalette: () => {
      const colors = [...selectedPalette.colors];
      for (let i = colors.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [colors[i], colors[j]] = [colors[j], colors[i]];
      }
      setShuffledColors(colors);
    },
    onAddRandomOperator: () => {
      const notation = getRandomOperatorNotation();
      addOperator(notation, getSaneOperatorParams(notation));
      setPresetOrRandomUsed(true);
    },
    onRandomizeSelectedOperator: () => {
      randomizeSelectedOperator();
      setPresetOrRandomUsed(true);
    },
    onToggleSelectedOperator: () => {
      if (selectedOperatorId) toggleOperator(selectedOperatorId);
    },
    onDeleteSelectedOperator: () => {
      if (selectedOperatorId) removeOperator(selectedOperatorId);
    },
    onOperatorParamChange: (field: 'tVe' | 'tVf' | 'tFe', value: number) => {
      if (selectedOperatorId) {
        updateOperatorParams(selectedOperatorId, field, String(value));
        setSliderMoved(true);
      }
    },
    onFitToExtents: requestFitToExtents,
  }), [
    mode,
    showFaces,
    showEdges,
    renderColorMode,
    selectedPalette,
    shuffledColors,
    selectedOperator,
    selectedMatchingPresetName,
    selectedOperatorNotation,
    operators,
    selectedOperatorId,
  ]);

  const selectedOperatorHasCrossings = useMemo(() => {
    if (!selectedOperatorId) return false;
    const tiling = UNIFORM_TILINGS[tilingType];
    if (!tiling || tilingType === 'multigrid') return false;
    const selectedIdx = operators.findIndex(op => op.id === selectedOperatorId);
    if (selectedIdx === -1 || !operators[selectedIdx].enabled || !isOperatorStackItem(operators[selectedIdx])) return false;
    try {
      let { vertices, faces } = tiling.generate(2, 2);
      for (let i = 0; i <= selectedIdx; i++) {
        if (operators[i].enabled && isOperatorStackItem(operators[i])) {
          ({ vertices, faces } = applyOperator({ vertices, faces }, operators[i]));
        }
      }
      return hasMeshEdgeCrossings({ vertices, faces });
    } catch {
      return false;
    }
  }, [operators, tilingType, selectedOperatorId]);

  const selectedOperatorEnabled = selectedOperator?.enabled ?? false;
  const selectedOperatorCrossingAnalysis = useMemo(() => {
    if (!selectedOperatorEnabled || !selectedOperatorNotation) return null;
    const inherent = operatorHasInherentCrossings(selectedOperatorNotation);
    return {
      inherent,
      ranges: inherent ? null : getOperatorParamRanges(selectedOperatorNotation),
    };
  }, [selectedOperatorNotation, selectedOperatorEnabled]);
  const selectedOperatorHasInherentCrossings = selectedOperatorCrossingAnalysis?.inherent ?? false;
  const selectedOperatorParamRanges = selectedOperatorCrossingAnalysis?.ranges ?? null;

  const selectedOperatorCrossingCulprits = useMemo(() => {
    if (!selectedOperatorHasInherentCrossings) return [];
    return getInherentCrossingCulprits(selectedOperatorNotation);
  }, [selectedOperatorHasInherentCrossings, selectedOperatorNotation]);

  // Per-dot classification of each unselected atom, sourced from analytical
  // validation rather than the curated whitelist:
  //   'complete' — adding it yields a complete operator (all valences ≥ 3)
  //   'degree2'  — adding it yields an operator whose lowest valence is 2
  //                (renders, but introduces hidden vertices)
  //   'crossing' — adding it forces an always-crossing/overlapping config
  //   'neutral'  — builds something else, or not a finished operator
  // One classifyOperator call per atom, memoized per selection (results are
  // cached per-notation in the library, so re-renders are free).
  const atomCompatibilityTiers = useMemo(() => {
    const tiers = new Map<string, 'complete' | 'degree2' | 'crossing' | 'neutral'>();
    if (!selectedOperatorEnabled) return tiers;
    const selected = parseAtomList(selectedOperatorNotation);
    for (const atom of OMNI_ATOMS) {
      if (selected.includes(atom)) continue;
      const notation = joinAtomList(orderAtoms(new Set([...selected, atom])));
      const status = classifyOperator(notation);
      tiers.set(
        atom,
        status === 'crossing' ? 'crossing'
          : status === 'complete' ? 'complete'
          : status === 'degree2' ? 'degree2'
          : 'neutral',
      );
    }
    return tiers;
  }, [selectedOperatorNotation, selectedOperatorEnabled]);

  const isMultigrid = tilingType === 'multigrid';
  const generationOptions: TilingGenerationOptions = useMemo(() => ({
    multigrid: multigridSettings,
  }), [multigridSettings]);
  const radialBuildOptions: RadialBuildOptions = useMemo(() => ({
    boxSegments: {
      x: boxXSegments,
      y: boxYSegments,
      z: boxZSegments,
    },
    coneHeightSegments,
    coneTaper,
    torusProfileSides,
  }), [boxXSegments, boxYSegments, boxZSegments, coneHeightSegments, coneTaper, torusProfileSides]);

  useEffect(() => {
    if (radialType !== 'Torus' && radialSides > 16) {
      setRadialSides(16);
    }
  }, [radialType, radialSides]);

  useLayoutEffect(() => {
    setIsGeometryGenerating(true);
  }, [
    mode,
    tilingType,
    rows,
    cols,
    showEdges,
    showVertices,
    showFaces,
    wireframe,
    activeOperators,
    palette,
    shuffledColors,
    renderColorMode,
    roleColorCount,
    roleGeometryDetail,
    roleShapeBasis,
    sideModulo,
    sideOffset,
    edgeColor,
    embossEnabled,
    embossWidth,
    embossDepth,
    embossSmoothness,
    faceRoughness,
    faceOpacity,
    generationOptions,
    radialType,
    radialSides,
    radialBuildOptions,
    fitRequestKey,
  ]);
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
  const radialTypeCycle = useMemo(
    () => RADIAL_SHAPE_GROUPS.flatMap((group) => group.types),
    [],
  );
  const tilingTypeCycle = useMemo(
    () => TILING_GROUP_ORDER.flatMap((groupName) => (
      tilingGroups[groupName]?.map(([key]) => key) ?? []
    )),
    [tilingGroups],
  );

  const cycleRadialType = (direction: -1 | 1) => {
    const currentIndex = radialTypeCycle.indexOf(radialType);
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + direction + radialTypeCycle.length) % radialTypeCycle.length;

    setRadialType(radialTypeCycle[nextIndex]);
    requestFitToExtents();
  };

  const selectTilingType = (key: string, closeMenu = true) => {
    setTilingEverOpened(true);
    setTilingType(key);
    setColorMode((current) => normalizeColorModeForTiling(current, key));
    requestFitToExtents();
    if (closeMenu) {
      setTilingMenuOpen(false);
    }
  };

  const cycleTilingType = (direction: -1 | 1) => {
    const currentIndex = tilingTypeCycle.indexOf(tilingType);
    const nextIndex = currentIndex === -1
      ? 0
      : (currentIndex + direction + tilingTypeCycle.length) % tilingTypeCycle.length;

    selectTilingType(tilingTypeCycle[nextIndex], false);
  };

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
                  <div className="flex items-stretch">
                    <button
                      onClick={() => {
                        if (!shapeMenuOpen) setShapeEverOpened(true);
                        setShapeMenuOpen(!shapeMenuOpen);
                      }}
                      className="min-w-0 flex-1 p-4 text-left transition-colors hover:bg-neutral-800/40"
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
                    <div className="flex shrink-0 items-center gap-1 border-l border-neutral-800 px-3">
                      <button
                        onClick={() => cycleRadialType(-1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400 transition-colors hover:border-blue-700/70 hover:text-white"
                        title="Previous shape"
                        aria-label="Previous shape"
                      >
                        <ArrowLeft className="h-3.5 w-3.5" />
                      </button>
                      <button
                        onClick={() => cycleRadialType(1)}
                        className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400 transition-colors hover:border-blue-700/70 hover:text-white"
                        title="Next shape"
                        aria-label="Next shape"
                      >
                        <ArrowRight className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
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
                        <span>Use the arrows or click below to pick a tiling pattern</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="flex items-stretch">
                  <button
                    onClick={() => {
                      if (!tilingMenuOpen) setTilingEverOpened(true);
                      setTilingMenuOpen(!tilingMenuOpen);
                    }}
                    className="min-w-0 flex-1 p-4 text-left transition-colors hover:bg-neutral-800/40"
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
                  <div className="flex shrink-0 items-center gap-1 border-l border-neutral-800 px-3">
                    <button
                      onClick={() => cycleTilingType(-1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400 transition-colors hover:border-blue-700/70 hover:text-white"
                      title="Previous tiling"
                      aria-label="Previous tiling"
                    >
                      <ArrowLeft className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => cycleTilingType(1)}
                      className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400 transition-colors hover:border-blue-700/70 hover:text-white"
                      title="Next tiling"
                      aria-label="Next tiling"
                    >
                      <ArrowRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>

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
                                  onClick={() => selectTilingType(key)}
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

            {hasBaseSettings && (
              <section>
                <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                  <Settings className="w-3 h-3" />
                  Settings
                </h2>
                <div className="space-y-4 bg-neutral-800/20 p-4 rounded-2xl border border-neutral-800">
                  {mode === '3d' ? (
                    <>
                      {isBoxShape && (
                        <>
                              <div className="space-y-2">
                                <div className="flex justify-between text-xs">
                                  <span className="text-neutral-400">X Segments</span>
                                  <SliderValueField value={boxXSegments} min={1} max={16} step={1} onValueCommit={setBoxXSegments} />
                                </div>
                            <input
                              type="range"
                              min="1"
                              max="16"
                              value={boxXSegments}
                              onChange={e => setBoxXSegments(parseInt(e.target.value, 10))}
                              className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span className="text-neutral-400">Y Segments</span>
                                <SliderValueField value={boxYSegments} min={1} max={16} step={1} onValueCommit={setBoxYSegments} />
                              </div>
                            <input
                              type="range"
                              min="1"
                              max="16"
                              value={boxYSegments}
                              onChange={e => setBoxYSegments(parseInt(e.target.value, 10))}
                              className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                            <div className="space-y-2">
                              <div className="flex justify-between text-xs">
                                <span className="text-neutral-400">Z Segments</span>
                                <SliderValueField value={boxZSegments} min={1} max={16} step={1} onValueCommit={setBoxZSegments} />
                              </div>
                            <input
                              type="range"
                              min="1"
                              max="16"
                              value={boxZSegments}
                              onChange={e => setBoxZSegments(parseInt(e.target.value, 10))}
                              className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </>
                      )}
                      {radialTypeUsesSides && (
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-neutral-400">Sides</span>
                              <SliderValueField value={radialSides} min={3} max={isTorusShape ? 64 : 16} step={1} onValueCommit={setRadialSides} />
                            </div>
                          <input
                            type="range"
                            min="3"
                            max={isTorusShape ? "64" : "16"}
                            value={radialSides}
                            onChange={e => setRadialSides(parseInt(e.target.value, 10))}
                            className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      )}
                      {isConeShape && (
                        <>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-neutral-400">Height Segments</span>
                              <SliderValueField value={coneHeightSegments} min={1} max={24} step={1} onValueCommit={setConeHeightSegments} />
                            </div>
                            <input
                              type="range"
                              min="1"
                              max="24"
                              value={coneHeightSegments}
                              onChange={e => setConeHeightSegments(parseInt(e.target.value, 10))}
                              className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                          <div className="space-y-2">
                            <div className="flex justify-between text-xs">
                              <span className="text-neutral-400">Taper</span>
                              <SliderValueField value={coneTaper} min={0} max={2} step={0.01} precision={2} onValueCommit={setConeTaper} />
                            </div>
                            <input
                              type="range"
                              min="0"
                              max="2"
                              step="0.01"
                              value={coneTaper}
                              onChange={e => setConeTaper(Number.parseFloat(e.target.value))}
                              className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                            />
                          </div>
                        </>
                      )}
                      {isTorusShape && (
                        <div className="space-y-2">
                          <div className="flex justify-between text-xs">
                            <span className="text-neutral-400">Profile Sides</span>
                            <SliderValueField value={torusProfileSides} min={3} max={32} step={1} onValueCommit={setTorusProfileSides} />
                          </div>
                          <input
                            type="range"
                            min="3"
                            max="32"
                            value={torusProfileSides}
                            onChange={e => setTorusProfileSides(parseInt(e.target.value, 10))}
                            className="w-full accent-blue-600 h-1.5 bg-neutral-700 rounded-lg appearance-none cursor-pointer"
                          />
                        </div>
                      )}
                    </>
                ) : isMultigrid ? (
                  <>
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-neutral-400">Dimensions</span>
                        <SliderValueField
                          value={multigridSettings.dimensions}
                          min={3}
                          max={30}
                          step={1}
                          onValueCommit={(value) => updateMultigridSetting('dimensions', value)}
                        />
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
                        <SliderValueField
                          value={multigridSettings.divisions}
                          min={1}
                          max={30}
                          step={1}
                          onValueCommit={(value) => updateMultigridSetting('divisions', value)}
                        />
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
                        <SliderValueField
                          value={multigridSettings.offset}
                          min={-2}
                          max={2}
                          step={0.01}
                          precision={2}
                          onValueCommit={(value) => updateMultigridSetting('offset', value)}
                        />
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
                          <SliderValueField
                            value={multigridSettings.minDistance}
                            min={0}
                            max={2}
                            step={0.01}
                            precision={2}
                            onValueCommit={(value) => updateMultigridSetting('minDistance', value)}
                          />
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
                          <SliderValueField
                            value={multigridSettings.maxDistance}
                            min={0}
                            max={2}
                            step={0.01}
                            precision={2}
                            onValueCommit={(value) => updateMultigridSetting('maxDistance', value)}
                          />
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
                        <SliderValueField value={rows} min={2} max={30} step={1} onValueCommit={setRows} />
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
                        <SliderValueField value={cols} min={2} max={30} step={1} onValueCommit={setCols} />
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
            )}



            <section>
              <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-wider mb-4 flex items-center gap-2">
                <Layers className="w-3 h-3" />
                Stack
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
                        <span>Click <span className="font-black">Add</span> below to transform the tiling</span>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mb-3 flex justify-end">
                  <div className="flex items-center gap-2">
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
                                    {isOperatorStackItem(op)
                                      ? (findPresetName(parseAtomList(resolveOperatorNotation(op.notation))) ?? (resolveOperatorNotation(op.notation) || 'New Operator'))
                                      : isDeformerStackItem(op)
                                        ? DEFORMER_LABELS[op.mode]
                                        : CLONER_LABELS[op.mode]}
                                  </div>
                                  <div className="truncate font-mono text-[10px] text-neutral-500">
                                    {isOperatorStackItem(op)
                                      ? (resolveOperatorNotation(op.notation) || 'No atoms')
                                      : isDeformerStackItem(op)
                                        ? (op.mode === 'planarize' || op.mode === 'canonicalize' || op.mode === 'transform' ? 'Deformer' : `Deformer · ${op.axis.toUpperCase()} · ${op.amount.toFixed(2)}`)
                                        : op.mode === 'point'
                                          ? `Point · ${op.pointGroup} · r ${op.radius.toFixed(1)}`
                                          : `Wallpaper · ${op.wallpaperGroup} · ${op.xRepeats}x${op.yRepeats}`}
                                  </div>
                                </div>
                              </div>
                              <div className="flex shrink-0 items-center gap-1">
                                {isOperatorStackItem(op) && (
                                  <>
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
                                      const notation = getRandomOperatorNotation();
                                      const params = getSaneOperatorParams(notation);
                                      setOperators((current) => current.map((item) =>
                                        item.id === op.id && isOperatorStackItem(item) ? { ...item, notation, ...params } : item
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
                                  </>
                                )}
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
                              if (isDeformerStackItem(op)) {
                                const isSelectedItem = selectedOperatorId === op.id;
                                if (!isSelectedItem) return null;
                                return (
                                  <div
                                    className="mt-3 grid gap-2"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="grid grid-cols-3 gap-1">
                                      {(['stretch', 'taper', 'spherify', 'cylinderize', 'planarize', 'canonicalize', 'transform'] as DeformerMode[]).map((modeValue) => (
                                        <button
                                          key={modeValue}
                                          type="button"
                                          onClick={() => updateDeformer(op.id, { mode: modeValue })}
                                          className={`rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                                            op.mode === modeValue
                                              ? 'border-blue-700/60 bg-blue-950/30 text-blue-300'
                                              : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/60'
                                          }`}
                                        >
                                          {DEFORMER_LABELS[modeValue]}
                                        </button>
                                      ))}
                                    </div>
                                    {op.mode !== 'spherify' && op.mode !== 'planarize' && op.mode !== 'canonicalize' && op.mode !== 'transform' && (
                                      <div className="grid grid-cols-3 gap-1">
                                        {(['x', 'y', 'z'] as DeformerAxis[]).map((axis) => (
                                          <button
                                            key={axis}
                                            type="button"
                                            onClick={() => updateDeformer(op.id, { axis })}
                                            className={`rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                                              op.axis === axis
                                                ? 'border-blue-700/60 bg-blue-950/30 text-blue-300'
                                                : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/60'
                                            }`}
                                          >
                                            {axis}
                                          </button>
                                        ))}
                                      </div>
                                    )}
                                    {op.mode !== 'planarize' && op.mode !== 'canonicalize' && op.mode !== 'transform' && (
                                      <>
                                        <label className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Amount</span>
                                            <SliderValueField
                                              value={op.amount}
                                              min={op.mode === 'spherify' || op.mode === 'cylinderize' ? -1 : 0}
                                              max={1}
                                              step={0.01}
                                              precision={2}
                                              onValueCommit={(value) => updateDeformer(op.id, { amount: value })}
                                            />
                                          </div>
                                          <input
                                            type="range"
                                            min={op.mode === 'spherify' || op.mode === 'cylinderize' ? -1 : 0}
                                            max="1"
                                            step="0.01"
                                            value={op.amount}
                                            onChange={(e) => updateDeformer(op.id, { amount: Number.parseFloat(e.target.value) })}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                          />
                                        </label>
                                        {op.mode === 'stretch' && (
                                          <>
                                            <label className="grid gap-1">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Start</span>
                                                <SliderValueField value={op.stretchStart} min={0} max={1} step={0.01} precision={2} onValueCommit={(value) => updateDeformer(op.id, { stretchStart: value })} />
                                              </div>
                                              <input type="range" min="0" max="1" step="0.01" value={op.stretchStart} onChange={(e) => updateDeformer(op.id, { stretchStart: Number.parseFloat(e.target.value) })} className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700" />
                                            </label>
                                            <label className="grid gap-1">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">End</span>
                                                <SliderValueField value={op.stretchEnd} min={0} max={1} step={0.01} precision={2} onValueCommit={(value) => updateDeformer(op.id, { stretchEnd: value })} />
                                              </div>
                                              <input type="range" min="0" max="1" step="0.01" value={op.stretchEnd} onChange={(e) => updateDeformer(op.id, { stretchEnd: Number.parseFloat(e.target.value) })} className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700" />
                                            </label>
                                          </>
                                        )}
                                      </>
                                    )}
                                    {op.mode === 'transform' && (() => {
                                      const toggleClass = (active: boolean) => `rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${active ? 'border-blue-700/60 bg-blue-950/30 text-blue-300' : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/60'}`;
                                      const makeSlider = (label: string, value: number, min: number, max: number, step: number, key: keyof typeof op, precision = 2) => (
                                        <label key={label} className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{label}</span>
                                            <SliderValueField value={value} min={min} max={max} step={step} precision={precision} onValueCommit={(v) => updateDeformer(op.id, { [key]: v })} />
                                          </div>
                                          <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => updateDeformer(op.id, { [key]: Number.parseFloat(e.target.value) })} className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700" />
                                        </label>
                                      );
                                      return (
                                        <>
                                          <div className="grid grid-cols-2 gap-1">
                                            <button type="button" onClick={() => updateDeformer(op.id, { center: !op.center })} className={toggleClass(op.center)}>Center</button>
                                            <button type="button" onClick={() => updateDeformer(op.id, { level: !op.level })} className={toggleClass(op.level)}>Level</button>
                                          </div>
                                          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mt-1">Translate</div>
                                          {makeSlider('X', op.translateX, -10, 10, 0.01, 'translateX')}
                                          {makeSlider('Y', op.translateY, -10, 10, 0.01, 'translateY')}
                                          {makeSlider('Z', op.translateZ, -10, 10, 0.01, 'translateZ')}
                                          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mt-1">Rotate (°)</div>
                                          {makeSlider('X', op.rotateX, -180, 180, 1, 'rotateX', 0)}
                                          {makeSlider('Y', op.rotateY, -180, 180, 1, 'rotateY', 0)}
                                          {makeSlider('Z', op.rotateZ, -180, 180, 1, 'rotateZ', 0)}
                                          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500 mt-1">Scale</div>
                                          {makeSlider('X', op.scaleX, 0.01, 4, 0.01, 'scaleX')}
                                          {makeSlider('Y', op.scaleY, 0.01, 4, 0.01, 'scaleY')}
                                          {makeSlider('Z', op.scaleZ, 0.01, 4, 0.01, 'scaleZ')}
                                        </>
                                      );
                                    })()}
                                  </div>
                                );
                              }

                              if (isClonerStackItem(op)) {
                                const isSelectedItem = selectedOperatorId === op.id;
                                if (!isSelectedItem) return null;
                                return (
                                  <div
                                    className="mt-3 grid gap-2"
                                    onPointerDown={(e) => e.stopPropagation()}
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="grid grid-cols-3 gap-1">
                                      {(['array', 'point', 'wallpaper'] as ClonerMode[]).map((modeValue) => (
                                        <button
                                          key={modeValue}
                                          type="button"
                                          onClick={() => updateCloner(op.id, { mode: modeValue })}
                                          className={`rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                                            op.mode === modeValue
                                              ? 'border-blue-700/60 bg-blue-950/30 text-blue-300'
                                              : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/60'
                                          }`}
                                        >
                                          {CLONER_LABELS[modeValue]}
                                        </button>
                                      ))}
                                    </div>
                                    {op.mode === 'point' ? (
                                      <>
                                        <label className="grid gap-1">
                                          <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Symmetry Group</span>
                                          <select
                                            value={op.pointGroup}
                                            onChange={(e) => {
                                              updateCloner(op.id, { pointGroup: e.target.value as PointGroupSymmetry });
                                              requestFitToExtents();
                                            }}
                                            className="w-full rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2 py-1.5 text-xs text-neutral-200 focus:border-blue-500 focus:outline-none"
                                          >
                                            {POINT_GROUP_SYMMETRIES.map((group) => (
                                              <option key={group} value={group}>
                                                {group}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="grid gap-1">
                                          <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Primary Axis</span>
                                          <select
                                            value={op.wallpaperPlane}
                                            onChange={(e) => {
                                              updateCloner(op.id, { wallpaperPlane: e.target.value as WallpaperPlane });
                                              requestFitToExtents();
                                            }}
                                            className="w-full rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2 py-1.5 text-xs text-neutral-200 focus:border-blue-500 focus:outline-none"
                                          >
                                            <option value="yz">X</option>
                                            <option value="xz">Y</option>
                                            <option value="xy">Z</option>
                                          </select>
                                        </label>
                                        {usesPointGroupOrder(op.pointGroup) && (
                                            <label className="grid gap-1">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Order</span>
                                                <SliderValueField
                                                  value={getPointGroupBaseOrder(op.pointGroup, op.copies)}
                                                  min={1}
                                                  max={12}
                                                  step={1}
                                                  precision={0}
                                                  onValueCommit={(value) => updatePointClonerCopies(op.id, value)}
                                                />
                                              </div>
                                            <input
                                              type="range"
                                              min="1"
                                              max="12"
                                              step="1"
                                              value={getPointGroupBaseOrder(op.pointGroup, op.copies)}
                                              onChange={(e) => updatePointClonerCopies(op.id, Number.parseInt(e.target.value, 10))}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                        )}
                                        <div className="flex items-center justify-between gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                          <span>Copies</span>
                                          <span className="font-mono text-neutral-300">{getPointGroupCopyCount(op.pointGroup, op.copies)}</span>
                                        </div>
                                        <label className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                                          <span>Auto Pack</span>
                                          <input
                                            type="checkbox"
                                            checked={op.pointAutoFit}
                                            onChange={(e) => updateCloner(op.id, { pointAutoFit: e.target.checked })}
                                            className="h-3.5 w-3.5 accent-blue-600"
                                          />
                                        </label>
                                        <label className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Gap</span>
                                            <SliderValueField
                                              value={op.pointGap}
                                              min={0}
                                              max={2}
                                              step={0.01}
                                              precision={2}
                                              onValueCommit={(value) => updateCloner(op.id, { pointGap: value, pointAutoFit: true })}
                                              disabled={op.pointAutoFit}
                                            />
                                          </div>
                                          <input
                                            type="range"
                                            min="0"
                                            max="2"
                                            step="0.01"
                                            value={op.pointGap}
                                            disabled={!op.pointAutoFit}
                                            onChange={(e) => updateCloner(op.id, { pointGap: Number.parseFloat(e.target.value), pointAutoFit: true })}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                                          />
                                        </label>
                                        <label className="grid gap-1">
                                          <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Orbit Site</span>
                                          <select
                                            value={op.pointOrbitSite}
                                            onChange={(e) => updateCloner(op.id, { pointOrbitSite: e.target.value as PointOrbitSite })}
                                            className="w-full rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2 py-1.5 text-xs text-neutral-200 focus:border-blue-500 focus:outline-none"
                                          >
                                            {POINT_ORBIT_SITES.map((site) => (
                                              <option key={site} value={site}>
                                                {site}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Radius</span>
                                            <SliderValueField
                                              value={op.radius}
                                              min={0}
                                              max={9.9}
                                              step={0.1}
                                              precision={1}
                                              onValueCommit={(value) => updateCloner(op.id, { radius: value, pointAutoFit: false })}
                                              disabled={op.pointAutoFit}
                                            />
                                          </div>
                                          <input
                                            type="range"
                                            min="0"
                                            max="9.9"
                                            step="0.1"
                                            value={op.radius}
                                            disabled={op.pointAutoFit}
                                            onChange={(e) => updateCloner(op.id, { radius: Number.parseFloat(e.target.value), pointAutoFit: false })}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-50"
                                          />
                                        </label>
                                      </>
                                    ) : op.mode === 'wallpaper' ? (
                                      <>
                                        <label className="grid gap-1">
                                          <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Symmetry Group</span>
                                          <select
                                            value={op.wallpaperGroup}
                                            onChange={(e) => {
                                              const wallpaperGroup = e.target.value as WallpaperSymmetry;
                                              updateCloner(op.id, {
                                                wallpaperGroup,
                                                ...getDefaultWallpaperUnitOffset(wallpaperGroup, op.cellWidth, op.cellHeight),
                                                wallpaperAutoFit: true,
                                              });
                                              requestFitToExtents();
                                            }}
                                            className="w-full rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2 py-1.5 text-xs text-neutral-200 focus:border-blue-500 focus:outline-none"
                                          >
                                            {WALLPAPER_SYMMETRIES.map((group) => (
                                              <option key={group} value={group}>
                                                {group}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <label className="grid gap-1">
                                          <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Primary Axis</span>
                                          <select
                                            value={op.wallpaperPlane}
                                            onChange={(e) => {
                                              updateCloner(op.id, { wallpaperPlane: e.target.value as WallpaperPlane });
                                              requestFitToExtents();
                                            }}
                                            className="w-full rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2 py-1.5 text-xs text-neutral-200 focus:border-blue-500 focus:outline-none"
                                          >
                                            {WALLPAPER_PLANES.map((plane) => (
                                              <option key={plane} value={plane}>
                                                {plane.toUpperCase()}
                                              </option>
                                            ))}
                                          </select>
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                          <label className="grid gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">X</span>
                                              <SliderValueField
                                                value={op.xRepeats}
                                                min={1}
                                                max={12}
                                                step={1}
                                                precision={0}
                                                onValueCommit={(value) => updateCloner(op.id, { xRepeats: value })}
                                              />
                                            </div>
                                            <input
                                              type="range"
                                              min="1"
                                              max="12"
                                              step="1"
                                              value={op.xRepeats}
                                              onChange={(e) => updateCloner(op.id, { xRepeats: Number.parseInt(e.target.value, 10) })}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                          <label className="grid gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Y</span>
                                              <SliderValueField
                                                value={op.yRepeats}
                                                min={1}
                                                max={12}
                                                step={1}
                                                precision={0}
                                                onValueCommit={(value) => updateCloner(op.id, { yRepeats: value })}
                                              />
                                            </div>
                                            <input
                                              type="range"
                                              min="1"
                                              max="12"
                                              step="1"
                                              value={op.yRepeats}
                                              onChange={(e) => updateCloner(op.id, { yRepeats: Number.parseInt(e.target.value, 10) })}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                        </div>
                                        <button
                                          type="button"
                                          onClick={() => setAdvancedWallpaperOpen((current) => !current)}
                                          className="rounded-lg border border-neutral-800 bg-neutral-900/40 px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-widest text-neutral-500 transition-colors hover:bg-neutral-800/60"
                                        >
                                          Advanced Wallpaper
                                        </button>
                                        {advancedWallpaperOpen && (
                                          <>
                                        <div className="grid grid-cols-2 gap-2">
                                          <label className="grid gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Width</span>
                                              <SliderValueField
                                                value={op.cellWidth}
                                                min={0.25}
                                                max={20}
                                                step={0.05}
                                                precision={2}
                                                onValueCommit={(value) => updateCloner(op.id, { cellWidth: value })}
                                              />
                                            </div>
                                            <input
                                              type="range"
                                              min="0.25"
                                              max="20"
                                              step="0.05"
                                              value={op.cellWidth}
                                              onChange={(e) => updateCloner(op.id, { cellWidth: Number.parseFloat(e.target.value) })}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                          <label className="grid gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Height</span>
                                              <SliderValueField
                                                value={op.cellHeight}
                                                min={0.25}
                                                max={20}
                                                step={0.05}
                                                precision={2}
                                                onValueCommit={(value) => updateCloner(op.id, { cellHeight: value })}
                                              />
                                            </div>
                                            <input
                                              type="range"
                                              min="0.25"
                                              max="20"
                                              step="0.05"
                                              value={op.cellHeight}
                                              onChange={(e) => updateCloner(op.id, { cellHeight: Number.parseFloat(e.target.value) })}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <label className="grid gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Skew X</span>
                                              <SliderValueField
                                                value={op.skewX}
                                                min={-10}
                                                max={10}
                                                step={0.05}
                                                precision={2}
                                                onValueCommit={(value) => updateCloner(op.id, { skewX: value })}
                                              />
                                            </div>
                                            <input
                                              type="range"
                                              min="-10"
                                              max="10"
                                              step="0.05"
                                              value={op.skewX}
                                              onChange={(e) => updateCloner(op.id, { skewX: Number.parseFloat(e.target.value) })}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                          <label className="grid gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Skew Y</span>
                                              <SliderValueField
                                                value={op.skewY}
                                                min={-10}
                                                max={10}
                                                step={0.05}
                                                precision={2}
                                                onValueCommit={(value) => updateCloner(op.id, { skewY: value })}
                                              />
                                            </div>
                                            <input
                                              type="range"
                                              min="-10"
                                              max="10"
                                              step="0.05"
                                              value={op.skewY}
                                              onChange={(e) => updateCloner(op.id, { skewY: Number.parseFloat(e.target.value) })}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                        </div>
                                        <label className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Unit Scale</span>
                                            <SliderValueField
                                              value={op.unitScale}
                                              min={0.05}
                                              max={4}
                                              step={0.01}
                                              precision={2}
                                              onValueCommit={(value) => updateCloner(op.id, { unitScale: value })}
                                            />
                                          </div>
                                          <input
                                            type="range"
                                            min="0.05"
                                            max="4"
                                            step="0.01"
                                            value={op.unitScale}
                                            onChange={(e) => updateCloner(op.id, { unitScale: Number.parseFloat(e.target.value) })}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                          />
                                        </label>
                                        <label className="flex items-center justify-between gap-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-2.5 py-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                                          <span>Auto Fit</span>
                                          <input
                                            type="checkbox"
                                            checked={op.wallpaperAutoFit}
                                            onChange={(e) => updateCloner(op.id, { wallpaperAutoFit: e.target.checked })}
                                            className="h-3.5 w-3.5 accent-blue-600"
                                          />
                                        </label>
                                        <div className="grid grid-cols-2 gap-2">
                                          <label className="grid gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Unit X</span>
                                              <SliderValueField
                                                value={op.unitOffsetX}
                                                min={-10}
                                                max={10}
                                                step={0.05}
                                                precision={2}
                                                onValueCommit={(value) => updateCloner(op.id, { unitOffsetX: value, wallpaperAutoFit: false })}
                                                disabled={op.wallpaperAutoFit}
                                              />
                                            </div>
                                            <input
                                              type="range"
                                              min="-10"
                                              max="10"
                                              step="0.05"
                                              value={op.unitOffsetX}
                                              onChange={(e) => updateCloner(op.id, { unitOffsetX: Number.parseFloat(e.target.value), wallpaperAutoFit: false })}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                          <label className="grid gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Unit Y</span>
                                              <SliderValueField
                                                value={op.unitOffsetY}
                                                min={-10}
                                                max={10}
                                                step={0.05}
                                                precision={2}
                                                onValueCommit={(value) => updateCloner(op.id, { unitOffsetY: value, wallpaperAutoFit: false })}
                                                disabled={op.wallpaperAutoFit}
                                              />
                                            </div>
                                            <input
                                              type="range"
                                              min="-10"
                                              max="10"
                                              step="0.05"
                                              value={op.unitOffsetY}
                                              onChange={(e) => updateCloner(op.id, { unitOffsetY: Number.parseFloat(e.target.value), wallpaperAutoFit: false })}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                        </div>
                                        <div className="grid grid-cols-2 gap-2">
                                          <label className="grid gap-1">
                                            <div className="flex items-center justify-between gap-2">
                                              <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Spacing X</span>
                                              <SliderValueField
                                                value={op.spacingX}
                                                min={0.05}
                                                max={4}
                                                step={0.01}
                                                precision={2}
                                                onValueCommit={(value) => updateCloner(op.id, { spacingX: value })}
                                              />
                                            </div>
                                            <input
                                              type="range"
                                              min="0.05"
                                              max="4"
                                              step="0.01"
                                              value={op.spacingX}
                                              onChange={(e) => updateCloner(op.id, { spacingX: Number.parseFloat(e.target.value) })}
                                              className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                            />
                                          </label>
                                          <label className="grid gap-1">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Spacing Y</span>
                                                <SliderValueField
                                                  value={op.spacingY}
                                                  min={0.05}
                                                  max={4}
                                                  step={0.01}
                                                  precision={2}
                                                  onValueCommit={(value) => updateCloner(op.id, { spacingY: value })}
                                                />
                                              </div>
                                              <input
                                                type="range"
                                                min="0.05"
                                                max="4"
                                                step="0.01"
                                                value={op.spacingY}
                                                onChange={(e) => updateCloner(op.id, { spacingY: Number.parseFloat(e.target.value) })}
                                                className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                              />
                                            </label>
                                        </div>
                                          </>
                                        )}
                                      </>
                                    ) : (
                                      <>
                                        <label className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Copies</span>
                                            <SliderValueField
                                              value={op.arrayCopies}
                                              min={1}
                                              max={64}
                                              step={1}
                                              precision={0}
                                              onValueCommit={(value) => updateCloner(op.id, { arrayCopies: value })}
                                            />
                                          </div>
                                          <input
                                            type="range"
                                            min="1"
                                            max="64"
                                            step="1"
                                            value={op.arrayCopies}
                                            onChange={(e) => updateCloner(op.id, { arrayCopies: Number.parseInt(e.target.value, 10) })}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                          />
                                        </label>
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Spacing (per copy)</span>
                                        <div className="grid grid-cols-3 gap-2">
                                          {(['arrayTranslateX', 'arrayTranslateY', 'arrayTranslateZ'] as const).map((key, axisIndex) => (
                                            <label key={key} className="grid gap-1">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{['X', 'Y', 'Z'][axisIndex]}</span>
                                                <SliderValueField
                                                  value={op[key]}
                                                  min={-10}
                                                  max={10}
                                                  step={0.1}
                                                  precision={1}
                                                  onValueCommit={(value) => updateCloner(op.id, { [key]: value })}
                                                />
                                              </div>
                                              <input
                                                type="range"
                                                min="-10"
                                                max="10"
                                                step="0.1"
                                                value={op[key]}
                                                onChange={(e) => updateCloner(op.id, { [key]: Number.parseFloat(e.target.value) })}
                                                className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                              />
                                            </label>
                                          ))}
                                        </div>
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Rotate °/copy</span>
                                        <div className="grid grid-cols-3 gap-2">
                                          {(['arrayRotateX', 'arrayRotateY', 'arrayRotateZ'] as const).map((key, axisIndex) => (
                                            <label key={key} className="grid gap-1">
                                              <div className="flex items-center justify-between gap-2">
                                                <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">{['X', 'Y', 'Z'][axisIndex]}</span>
                                                <SliderValueField
                                                  value={op[key]}
                                                  min={-180}
                                                  max={180}
                                                  step={1}
                                                  precision={0}
                                                  onValueCommit={(value) => updateCloner(op.id, { [key]: value })}
                                                />
                                              </div>
                                              <input
                                                type="range"
                                                min="-180"
                                                max="180"
                                                step="1"
                                                value={op[key]}
                                                onChange={(e) => updateCloner(op.id, { [key]: Number.parseFloat(e.target.value) })}
                                                className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                              />
                                            </label>
                                          ))}
                                        </div>
                                        <label className="grid gap-1">
                                          <div className="flex items-center justify-between gap-2">
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Scale /copy</span>
                                            <SliderValueField
                                              value={op.arrayScale}
                                              min={0.1}
                                              max={3}
                                              step={0.01}
                                              precision={2}
                                              onValueCommit={(value) => updateCloner(op.id, { arrayScale: value })}
                                            />
                                          </div>
                                          <input
                                            type="range"
                                            min="0.1"
                                            max="3"
                                            step="0.01"
                                            value={op.arrayScale}
                                            onChange={(e) => updateCloner(op.id, { arrayScale: Number.parseFloat(e.target.value) })}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                          />
                                        </label>
                                      </>
                                    )}
                                  </div>
                                );
                              }

                              const visibility = getOmniParamVisibility(op.notation);
                              const isSelectedOperator = selectedOperatorId === op.id;
                              if (!visibility.showP1 && !visibility.showP2 && !visibility.showP3 && !isSelectedOperator) {
                                return null;
                              }
                              const paramRanges = isSelectedOperator ? selectedOperatorParamRanges : null;
                              const [tVeMin, tVeMax] = paramRanges?.tVe ?? [0.01, 0.99];
                              const [tVfMin, tVfMax] = paramRanges?.tVf ?? [0.01, 0.99];
                              const [tFeMin, tFeMax] = paramRanges?.tFe ?? [0.01, 0.99];

                              return (
                                <div
                                  className="mt-3 grid gap-2"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {!isSelectedOperator && visibility.showP1 && (
                                    <label className="grid gap-1">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">ve</span>
                                        <SliderValueField
                                          value={op.tVe}
                                          min={0.01}
                                          max={0.99}
                                          step={0.01}
                                          precision={2}
                                          onValueCommit={(value) => updateOperatorParams(op.id, 'tVe', value.toFixed(2))}
                                        />
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
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">vf</span>
                                        <SliderValueField
                                          value={op.tVf}
                                          min={0.01}
                                          max={0.99}
                                          step={0.01}
                                          precision={2}
                                          onValueCommit={(value) => updateOperatorParams(op.id, 'tVf', value.toFixed(2))}
                                        />
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
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">fe</span>
                                        <SliderValueField
                                          value={op.tFe}
                                          min={0.01}
                                          max={0.99}
                                          step={0.01}
                                          precision={2}
                                          onValueCommit={(value) => updateOperatorParams(op.id, 'tFe', value.toFixed(2))}
                                        />
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
                                              {selectedOperatorStatus === 'degree1' ? (
                                                <motion.span
                                                  animate={{
                                                    backgroundColor: ['rgba(127,29,29,0.35)', 'rgba(185,28,28,0.6)', 'rgba(127,29,29,0.35)'],
                                                    color: ['rgb(252,165,165)', 'rgb(255,255,255)', 'rgb(252,165,165)'],
                                                    borderColor: ['rgba(153,27,27,0.45)', 'rgba(248,113,113,0.8)', 'rgba(153,27,27,0.45)'],
                                                  }}
                                                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                                                  className="rounded-full border px-2 py-1 font-semibold uppercase tracking-widest"
                                                  title="Renders, but has a degree-1 (dangling) vertex — e.g. an unpaired fe-fe! whose edge has two loose ends. Not a finished operator; a later atom can still close it."
                                                >
                                                  Degree 1
                                                </motion.span>
                                              ) : selectedOperatorStatus === 'degree2' ? (
                                                <motion.span
                                                  animate={{
                                                    backgroundColor: ['rgba(120,53,15,0.3)', 'rgba(180,83,9,0.55)', 'rgba(120,53,15,0.3)'],
                                                    color: ['rgb(252,211,77)', 'rgb(255,255,255)', 'rgb(252,211,77)'],
                                                    borderColor: ['rgba(180,83,9,0.4)', 'rgba(251,191,36,0.75)', 'rgba(180,83,9,0.4)'],
                                                  }}
                                                  transition={{ repeat: Infinity, duration: 1.4, ease: 'easeInOut' }}
                                                  className="rounded-full border px-2 py-1 font-semibold uppercase tracking-widest"
                                                  title="Renders fine, but has degree-2 vertices: extra vertices that look identical yet change the topology for later operators"
                                                >
                                                  Degree 2
                                                </motion.span>
                                              ) : (
                                                <span
                                                  className={`rounded-full border px-2 py-1 font-semibold uppercase tracking-widest ${
                                                    selectedOperatorStatus === 'complete'
                                                      ? 'border-emerald-800/40 bg-emerald-900/30 text-emerald-300'
                                                      : selectedOperatorStatus === 'empty'
                                                        ? 'border-neutral-700/60 bg-neutral-900/40 text-neutral-400'
                                                        : 'border-red-800/40 bg-red-900/30 text-red-300'
                                                  }`}
                                                >
                                                  {selectedOperatorStatus === 'complete' ? 'Complete' : selectedOperatorStatus === 'empty' ? 'Empty' : 'Invalid'}
                                                </span>
                                              )}
                                              {selectedMatchingPresetName && (
                                                <span className="rounded-full border border-blue-800/40 bg-blue-900/20 px-2 py-1 font-semibold text-blue-300 uppercase tracking-widest">
                                                  {selectedMatchingPresetName}
                                                </span>
                                              )}
                                              {selectedOperatorHasInherentCrossings && (
                                                <span
                                                  className="rounded-full border border-red-800/50 bg-red-950/50 px-2 py-1 font-semibold text-red-300 uppercase tracking-widest"
                                                  title="This operator's atom connections always produce crossed edges regardless of input geometry or slider values"
                                                >
                                                  ⚠ Always crossing
                                                  {selectedOperatorCrossingCulprits.length > 0 && (
                                                    <span className="ml-1 normal-case tracking-normal font-mono text-red-200/90">
                                                      — remove {selectedOperatorCrossingCulprits.join(' or ')}
                                                    </span>
                                                  )}
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
                                                const isCulprit = isSelected && selectedOperatorCrossingCulprits.includes(atom);
                                                const tier = isSelected ? undefined : atomCompatibilityTiers.get(atom);
                                                const wouldAlwaysCross = tier === 'crossing';
                                                const completesComplete = tier === 'complete';
                                                const completesDegree2 = tier === 'degree2';
                                                const isDotHighlighted = completesComplete && hoveredDotType !== null && (rowClass === hoveredDotType || colClass === hoveredDotType);
                                                const baseClass = isCulprit
                                                  ? 'bg-rose-600 border-rose-300 shadow-sm shadow-rose-950/45 animate-pulse'
                                                  : isSelected
                                                    ? 'bg-blue-600 border-blue-500 shadow-sm shadow-blue-900/30'
                                                    : isDotHighlighted
                                                      ? 'bg-yellow-300/50 border-yellow-100/65 shadow-sm shadow-yellow-950/20 animate-pulse'
                                                      : wouldAlwaysCross
                                                        ? 'border-rose-700/80 bg-rose-950/65 opacity-85 hover:border-rose-500/90 hover:bg-rose-900/60'
                                                        : completesComplete
                                                          ? 'bg-emerald-800/50 border-emerald-700/60 hover:bg-emerald-700/60'
                                                          : completesDegree2
                                                            ? 'bg-amber-900/40 border-amber-800/50 hover:bg-amber-800/40'
                                                            : 'border-neutral-700/55 bg-neutral-800/35 opacity-60 hover:border-neutral-600/75 hover:bg-neutral-800/55 hover:opacity-80';

                                                return (
                                                  <button
                                                    key={`${rowClass}-${colClass}`}
                                                    type="button"
                                                    onMouseEnter={() => setHoveredGridAtom(atom)}
                                                    onMouseLeave={() => setHoveredGridAtom((current) => current === atom ? null : current)}
                                                    onClick={() => { setDiagramOrGridClicked(true); toggleGridAtom(atom); }}
                                                    className={`aspect-square rounded-md border transition-colors ${baseClass}`}
                                                    title={isCulprit
                                                      ? `${atom} — involved in the crossing; remove to fix`
                                                      : wouldAlwaysCross
                                                        ? `${atom} — adding this would always cross or overlap`
                                                        : completesComplete
                                                          ? `${atom} — completes a complete operator`
                                                          : completesDegree2
                                                            ? `${atom} — completes an operator with degree-2 vertices`
                                                            : atom}
                                                  />
                                                );
                                              })}
                                            </React.Fragment>
                                          ))}
                                        </div>
                                      </div>

                                      {selectedOperatorSupportsFaceFilter && (
                                        <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 p-3">
                                          <div className="mb-2 flex items-center justify-between gap-3">
                                            <label className="flex items-center gap-2 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                                              <input
                                                type="checkbox"
                                                checked={selectedFaceFilter.enabled}
                                                onChange={(e) => updateOperatorFaceFilter(op.id, { enabled: e.target.checked })}
                                                className="h-3.5 w-3.5 accent-blue-600"
                                              />
                                              Face Filter
                                            </label>
                                            <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Sides</span>
                                          </div>
                                          <div className="grid gap-2">
                                            <div className="grid grid-cols-3 gap-1">
                                              {([
                                                ['equal', '='],
                                                ['less-than', '<'],
                                                ['is-even', 'Even'],
                                              ] as Array<[FaceFilterMeasure, string]>).map(([measure, label]) => (
                                                <button
                                                  key={measure}
                                                  type="button"
                                                  onClick={() => updateOperatorFaceFilter(op.id, { measure })}
                                                  className={`rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                                                    selectedFaceFilter.measure === measure
                                                      ? 'border-blue-700/60 bg-blue-950/30 text-blue-300'
                                                      : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/60'
                                                  }`}
                                                >
                                                  {label}
                                                </button>
                                              ))}
                                            </div>
                                            <div className="grid grid-cols-[1fr_auto] gap-2">
                                              <input
                                                type="number"
                                                min="3"
                                                max="32"
                                                step="1"
                                                disabled={selectedFaceFilter.measure === 'is-even'}
                                                value={selectedFaceFilter.value}
                                                aria-label="Face side count"
                                                onChange={(e) => updateOperatorFaceFilter(op.id, { value: Number.parseInt(e.target.value, 10) })}
                                                className="w-full rounded-lg border border-neutral-700/50 bg-neutral-800/40 px-2 py-1.5 text-xs text-neutral-200 disabled:text-neutral-600 focus:border-blue-500 focus:outline-none"
                                              />
                                              <label className="flex items-center gap-2 rounded-lg border border-neutral-800 bg-neutral-900/40 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-400">
                                                <input
                                                  type="checkbox"
                                                  checked={selectedFaceFilter.negate}
                                                  onChange={(e) => updateOperatorFaceFilter(op.id, { negate: e.target.checked })}
                                                  className="h-3.5 w-3.5 accent-blue-600"
                                                />
                                                Not
                                              </label>
                                            </div>
                                          </div>
                                        </div>
                                      )}

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
                                            <SliderValueField
                                              value={op.tVe}
                                              min={tVeMin}
                                              max={tVeMax}
                                              step={0.01}
                                              precision={2}
                                              onValueCommit={(value) => {
                                                setSliderMoved(true);
                                                updateOperatorParams(op.id, 'tVe', value.toFixed(2));
                                              }}
                                            />
                                          </div>
                                          <input
                                            type="range"
                                            min={tVeMin}
                                            max={tVeMax}
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
                                            <SliderValueField
                                              value={op.tVf}
                                              min={tVfMin}
                                              max={tVfMax}
                                              step={0.01}
                                              precision={2}
                                              onValueCommit={(value) => {
                                                setSliderMoved(true);
                                                updateOperatorParams(op.id, 'tVf', value.toFixed(2));
                                              }}
                                            />
                                          </div>
                                          <input
                                            type="range"
                                            min={tVfMin}
                                            max={tVfMax}
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
                                            <SliderValueField
                                              value={op.tFe}
                                              min={tFeMin}
                                              max={tFeMax}
                                              step={0.01}
                                              precision={2}
                                              onValueCommit={(value) => {
                                                setSliderMoved(true);
                                                updateOperatorParams(op.id, 'tFe', value.toFixed(2));
                                              }}
                                            />
                                          </div>
                                          <input
                                            type="range"
                                            min={tFeMin}
                                            max={tFeMax}
                                            step="0.01"
                                            value={op.tFe}
                                            onChange={(e) => { setSliderMoved(true); updateOperatorParams(op.id, 'tFe', e.target.value); }}
                                            className="w-full accent-blue-600 h-1.5 cursor-pointer appearance-none rounded-lg bg-neutral-700"
                                          />
                                        </label>
                                      )}

                                      <AnimatePresence>
                                        {selectedOperatorHasCrossings && !selectedOperatorHasInherentCrossings && (visibility.showP1 || visibility.showP2 || visibility.showP3) && (
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

                                      <div className="grid gap-1">
                                        <span className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Finalize After</span>
                                        <div className="grid grid-cols-3 gap-1">
                                          {([
                                            ['none', 'Off'],
                                            ['planarize', 'Planarize'],
                                            ['canonicalize', 'Canonical'],
                                          ] as Array<[MeshFinalizationMode, string]>).map(([value, label]) => (
                                            <button
                                              key={value}
                                              type="button"
                                              onClick={() => updateOperatorFinalization(op.id, value)}
                                              className={`rounded-lg border px-2 py-1.5 text-[10px] font-semibold uppercase tracking-widest transition-colors ${
                                                (op.finalizationAfter ?? 'planarize') === value
                                                  ? 'border-blue-700/60 bg-blue-950/30 text-blue-300'
                                                  : 'border-neutral-800 bg-neutral-900/40 text-neutral-500 hover:bg-neutral-800/60'
                                              }`}
                                            >
                                              {label}
                                            </button>
                                          ))}
                                        </div>
                                      </div>

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
                                                      const culprit = alreadySelected && selectedOperatorCrossingCulprits.includes(atom);
                                                      const tier = alreadySelected ? undefined : atomCompatibilityTiers.get(atom);
                                                      const entersCrossing = tier === 'crossing';
                                                      const completesComplete = tier === 'complete';
                                                      const completesDegree2 = tier === 'degree2';
                                                      return [(
                                                        <button
                                                          key={atom}
                                                          onMouseEnter={() => setHoveredGridAtom(atom)}
                                                          onMouseLeave={() => setHoveredGridAtom((current) => current === atom ? null : current)}
                                                          onClick={() => { toggleGridAtom(atom); setDotPopup(null); setHoveredGridAtom(null); }}
                                                          className={`w-full rounded-lg px-2 py-1.5 text-left text-[10px] font-mono transition-colors ${
                                                            culprit
                                                              ? 'bg-red-600/80 text-white'
                                                              : alreadySelected
                                                                ? 'bg-blue-600/80 text-white'
                                                                : entersCrossing
                                                                  ? 'border border-red-800/70 bg-red-950/40 text-red-300 hover:border-red-600/80 hover:bg-red-900/40'
                                                                  : completesComplete
                                                                    ? 'bg-emerald-900/40 text-emerald-300 hover:bg-emerald-800/50'
                                                                    : completesDegree2
                                                                      ? 'bg-amber-900/40 text-amber-300 hover:bg-amber-800/40'
                                                                      : 'border border-neutral-700/55 bg-neutral-800/30 text-neutral-500 opacity-70 hover:border-neutral-600/75 hover:bg-neutral-800/50 hover:text-neutral-400 hover:opacity-85'
                                                          }`}
                                                          title={culprit
                                                            ? `${atom} — involved in the crossing; remove to fix`
                                                            : entersCrossing
                                                              ? `${atom} — adding this would always cross or overlap`
                                                              : completesComplete
                                                                ? `${atom} — completes a complete operator`
                                                                : completesDegree2
                                                                  ? `${atom} — completes an operator with degree-2 vertices`
                                                                  : atom}
                                                        >
                                                          <span className="font-mono text-neutral-500 text-[9px]">{atom}</span>
                                                          {alreadySelected && <span className="ml-1 text-blue-200">✓</span>}
                                                          {culprit && <span className="ml-1 text-red-200">⚠</span>}
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
                    <div className="relative inline-block">
                      <button
                        onClick={() => setAddMenuOpen((current) => !current)}
                        className="flex items-center gap-1 text-[10px] text-blue-400 hover:text-blue-300 transition-colors uppercase font-bold"
                      >
                        <Plus className="w-3 h-3" />
                        Add
                      </button>
                      <AnimatePresence>
                        {addMenuOpen && (
                          <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -4 }}
                            className="absolute bottom-full left-0 z-30 mb-2 w-48 rounded-xl border border-neutral-800 bg-neutral-950 p-2 shadow-2xl"
                          >
                            <button type="button" onClick={addBlankOperator} className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-neutral-300 hover:bg-neutral-800">
                              Operator
                            </button>
                            <button
                              type="button"
                              onClick={() => addDeformer('stretch')}
                              disabled={isAddOperatorOnboardingLocked}
                              title={isAddOperatorOnboardingLocked ? 'Complete "Add an operator" first.' : 'Add a deformer'}
                              className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Deformer
                            </button>
                            <button
                              type="button"
                              onClick={() => addCloner('array')}
                              disabled={isAddOperatorOnboardingLocked}
                              title={isAddOperatorOnboardingLocked ? 'Complete "Add an operator" first.' : 'Add a cloner'}
                              className="w-full rounded-lg px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-widest text-neutral-300 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-40"
                            >
                              Cloner
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
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
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        <Eye className="w-3 h-3" />
                        Appearance
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
                          <label className="flex items-center justify-between cursor-pointer group px-1 py-1">
                            <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">Show Faces</span>
                            <input type="checkbox" checked={showFaces} onChange={(e) => setShowFaces(e.target.checked)} className="w-4 h-4 rounded border-neutral-700 text-blue-600 bg-neutral-800 focus:ring-blue-600" />
                          </label>
                          {showFaces && (
                            <>
                          <div className="rounded-xl border border-neutral-800 bg-neutral-900/40 overflow-hidden">
                            <div className="flex items-stretch">
                              <button
                                onClick={() => setPaletteMenuOpen(!paletteMenuOpen)}
                                className="min-w-0 flex-1 p-3 text-left transition-colors hover:bg-neutral-800/40"
                              >
                                <div className="flex items-center justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-[10px] text-neutral-500 uppercase tracking-widest font-semibold mb-1">
                                      Face Palette
                                    </div>
                                    <div className="text-xs font-semibold text-white truncate">{selectedPalette.name}</div>
                                    <div className="mt-2 flex flex-wrap gap-y-1 pl-1">
                                      {(shuffledColors ?? selectedPalette.colors).map((c, i) => (
                                        <div
                                          key={i}
                                          className="-ml-1 h-3 w-3 rounded-full border border-neutral-900"
                                          style={{ backgroundColor: c }}
                                        />
                                      ))}
                                    </div>
                                  </div>
                                  <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400">
                                    <ChevronRight className={`w-4 h-4 transition-transform ${paletteMenuOpen ? 'rotate-90 text-white' : ''}`} />
                                  </div>
                                </div>
                              </button>
                              <button
                                onClick={() => {
                                  const colors = [...selectedPalette.colors];
                                  for (let i = colors.length - 1; i > 0; i--) {
                                    const j = Math.floor(Math.random() * (i + 1));
                                    [colors[i], colors[j]] = [colors[j], colors[i]];
                                  }
                                  setShuffledColors(colors);
                                }}
                                className="flex w-10 shrink-0 items-center justify-center border-l border-neutral-800 text-neutral-500 transition-colors hover:bg-neutral-800/40 hover:text-white"
                                title="Shuffle palette order"
                              >
                                <Shuffle className="w-3 h-3" />
                              </button>
                            </div>

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
                          {colorMode === 'role' && (
                            <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-3">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Shape Basis</span>
                                  <span className="font-mono text-neutral-300">
                                    {roleShapeBasis === 'lengths-angles' ? 'Both' : roleShapeBasis}
                                  </span>
                                </div>
                                <div className="grid grid-cols-3 gap-1">
                                  {[
                                    ['sides', 'Sides'],
                                    ['angles', 'Angles'],
                                    ['lengths-angles', 'Both'],
                                  ].map(([value, label]) => (
                                    <button
                                      key={value}
                                      onClick={() => setRoleShapeBasis(value as RoleShapeBasis)}
                                      className={`rounded-md border px-2 py-1.5 text-[9px] font-semibold uppercase tracking-wider transition-colors ${
                                        roleShapeBasis === value
                                          ? 'border-blue-700/60 bg-blue-950/20 text-blue-300'
                                          : 'border-neutral-800 bg-neutral-950/40 text-neutral-500 hover:bg-neutral-800/60'
                                      }`}
                                    >
                                      {label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Role Colors</span>
                                  <SliderValueField
                                    value={roleColorCount}
                                    min={2}
                                    max={(shuffledColors ?? selectedPalette.colors).length}
                                    step={1}
                                    precision={0}
                                    onValueCommit={setRoleColorCount}
                                  />
                                </div>
                                <input
                                  type="range"
                                  min={2}
                                  max={(shuffledColors ?? selectedPalette.colors).length}
                                  step={1}
                                  value={Math.min(roleColorCount, (shuffledColors ?? selectedPalette.colors).length)}
                                  onChange={(e) => setRoleColorCount(Number(e.target.value))}
                                  className="w-full accent-blue-500"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Role Detail</span>
                                  <SliderValueField
                                    value={roleGeometryDetail}
                                    min={0}
                                    max={5}
                                    step={1}
                                    precision={0}
                                    onValueCommit={setRoleGeometryDetail}
                                  />
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={5}
                                  step={1}
                                  value={roleGeometryDetail}
                                  onChange={(e) => setRoleGeometryDetail(Number(e.target.value))}
                                  className="w-full accent-blue-500"
                                />
                              </div>
                            </div>
                          )}
                          {colorMode === 'sides' && (
                            <div className="space-y-3 rounded-lg border border-neutral-800 bg-neutral-900/40 px-3 py-3">
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Side Modulo</span>
                                  <SliderValueField
                                    value={sideModulo}
                                    min={2}
                                    max={(shuffledColors ?? selectedPalette.colors).length}
                                    step={1}
                                    precision={0}
                                    onValueCommit={(value) => {
                                      setSideModulo(value);
                                      setSideOffset((current) => current % value);
                                    }}
                                  />
                                </div>
                                <input
                                  type="range"
                                  min={2}
                                  max={(shuffledColors ?? selectedPalette.colors).length}
                                  step={1}
                                  value={Math.min(sideModulo, (shuffledColors ?? selectedPalette.colors).length)}
                                  onChange={(e) => {
                                    const nextModulo = Number(e.target.value);
                                    setSideModulo(nextModulo);
                                    setSideOffset((current) => current % nextModulo);
                                  }}
                                  className="w-full accent-blue-500"
                                />
                              </div>
                              <div className="space-y-2">
                                <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                                  <span>Side Offset</span>
                                  <SliderValueField
                                    value={Math.min(sideOffset, Math.max(0, sideModulo - 1))}
                                    min={0}
                                    max={Math.max(0, sideModulo - 1)}
                                    step={1}
                                    precision={0}
                                    onValueCommit={setSideOffset}
                                  />
                                </div>
                                <input
                                  type="range"
                                  min={0}
                                  max={Math.max(0, sideModulo - 1)}
                                  step={1}
                                  value={Math.min(sideOffset, Math.max(0, sideModulo - 1))}
                                  onChange={(e) => setSideOffset(Number(e.target.value))}
                                  className="w-full accent-blue-500"
                                />
                              </div>
                            </div>
                          )}
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
                                    <SliderValueField
                                      value={embossWidth}
                                      min={0}
                                      max={0.3}
                                      step={0.005}
                                      precision={3}
                                      disabled={!embossEnabled}
                                      onValueCommit={setEmbossWidth}
                                    />
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
                                    <SliderValueField
                                      value={embossDepth}
                                      min={-0.04}
                                      max={0.04}
                                      step={0.0025}
                                      precision={3}
                                      disabled={!embossEnabled}
                                      onValueCommit={setEmbossDepth}
                                    />
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
                                    <SliderValueField
                                      value={embossSmoothness}
                                      min={0}
                                      max={1}
                                      step={0.05}
                                      precision={2}
                                      disabled={!embossEnabled}
                                      onValueCommit={setEmbossSmoothness}
                                    />
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
                            </>
                          )}
                        </div>
                        <div className="space-y-2.5 border-t border-neutral-800 pt-3">
                          <div className="text-[10px] font-semibold uppercase tracking-widest text-neutral-500">Debug</div>
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
                          <label className="flex items-center justify-between cursor-pointer group px-1 py-1">
                            <span className="text-sm text-neutral-300 group-hover:text-white transition-colors">Show Vertices</span>
                            <input type="checkbox" checked={showVertices} onChange={(e) => setShowVertices(e.target.checked)} className="w-4 h-4 rounded border-neutral-700 text-blue-600 bg-neutral-800 focus:ring-blue-600" />
                          </label>
                          <label className="flex items-center justify-between cursor-pointer group px-1 py-1">
                            <span className="text-xs text-neutral-500 group-hover:text-neutral-400 transition-colors">Wireframe</span>
                            <input type="checkbox" checked={wireframe} onChange={(e) => setWireframe(e.target.checked)} className="w-3.5 h-3.5 rounded border-neutral-700 text-blue-600 bg-neutral-800 focus:ring-blue-600 opacity-60" />
                          </label>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>
            <section>
              <div className="rounded-2xl border border-neutral-800 bg-neutral-800/20 overflow-hidden">
                <button
                  onClick={() => setLightingMenuOpen(!lightingMenuOpen)}
                  className="w-full p-3 text-left transition-colors hover:bg-neutral-800/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        <Settings className="w-3 h-3" />
                        Lighting
                      </div>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded-full border border-neutral-700 bg-neutral-900/70 text-neutral-400">
                      <ChevronRight className={`w-4 h-4 transition-transform ${lightingMenuOpen ? 'rotate-90 text-white' : ''}`} />
                    </div>
                  </div>
                </button>

                <AnimatePresence initial={false}>
                  {lightingMenuOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="border-t border-neutral-800"
                    >
                      <div className="p-3 space-y-3">
                        <div className="space-y-2">
                          <div className="flex items-center justify-between text-[10px] font-semibold uppercase tracking-widest text-neutral-500">
                            <span>Ambient</span>
                            <SliderValueField
                              value={ambientLightIntensity}
                              min={0}
                              max={1.5}
                              step={0.05}
                              precision={2}
                              onValueCommit={setAmbientLightIntensity}
                            />
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
                            <SliderValueField
                              value={keyLightIntensity}
                              min={0}
                              max={2}
                              step={0.05}
                              precision={2}
                              onValueCommit={setKeyLightIntensity}
                            />
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
                            <SliderValueField
                              value={keyLightAzimuth}
                              min={-180}
                              max={180}
                              step={1}
                              precision={0}
                              suffix="°"
                              onValueCommit={setKeyLightAzimuth}
                            />
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
                            <SliderValueField
                              value={keyLightElevation}
                              min={-85}
                              max={85}
                              step={1}
                              precision={0}
                              suffix="°"
                              onValueCommit={setKeyLightElevation}
                            />
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
                            <SliderValueField
                              value={faceRoughness}
                              min={0}
                              max={1}
                              step={0.02}
                              precision={2}
                              onValueCommit={setFaceRoughness}
                            />
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
                            <SliderValueField
                              value={faceOpacity}
                              min={0}
                              max={1}
                              step={0.02}
                              precision={2}
                              onValueCommit={setFaceOpacity}
                            />
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
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </section>

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
                  onClick={() => exportSvg(mode, tilingType, rows, cols, activeOperators, palette, renderColorMode, roleColorCount, roleGeometryDetail, roleShapeBasis, sideModulo, sideOffset, edgeColor, showEdges, radialType, radialSides, radialBuildOptions, generationOptions)}
                  className="px-3 py-2 rounded-lg text-[10px] font-bold tracking-wider transition-all border bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                >
                  .svg
                </button>
                )}
                <button
                  onClick={() => exportObj(mode, tilingType, rows, cols, activeOperators, palette, renderColorMode, roleColorCount, roleGeometryDetail, roleShapeBasis, sideModulo, sideOffset, radialType, radialSides, radialBuildOptions, generationOptions)}
                  className="px-3 py-2 rounded-lg text-[10px] font-bold tracking-wider transition-all border bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                >
                  .obj + .mtl
                </button>
                <button
                  onClick={() => exportOff(mode, tilingType, rows, cols, activeOperators, palette, renderColorMode, roleColorCount, roleGeometryDetail, roleShapeBasis, sideModulo, sideOffset, radialType, radialSides, radialBuildOptions, generationOptions)}
                  className="px-3 py-2 rounded-lg text-[10px] font-bold tracking-wider transition-all border bg-neutral-800/40 border-neutral-700/50 text-neutral-400 hover:bg-neutral-800 hover:text-neutral-200"
                >
                  .off
                </button>
              </div>
              <button
                onClick={sendToBlenderNow}
                disabled={blenderStatus === 'sending'}
                className={`mt-2 w-full px-3 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-all border ${
                  blenderStatus === 'ok'
                    ? 'bg-green-800/60 border-green-600/50 text-green-300'
                    : blenderStatus === 'error'
                    ? 'bg-red-900/40 border-red-700/50 text-red-300 hover:bg-red-900/60'
                    : 'bg-orange-900/30 border-orange-700/50 text-orange-400 hover:bg-orange-900/60 hover:text-orange-200'
                }`}
              >
                {blenderStatus === 'sending' ? 'Sending...' : blenderStatus === 'ok' ? 'Sent to Blender!' : 'Send to Blender'}
              </button>
              {blenderStatus === 'error' && (
                <div className="mt-2 rounded-lg border border-neutral-700/50 bg-neutral-800/40 p-2 space-y-2">
                  <p className="text-[10px] leading-relaxed text-neutral-300">
                    Couldn't reach Blender. Open it with the Polyhydra add-on running and retry — or grab the add-on if you don't have it yet.
                  </p>
                  <div className="flex gap-2">
                    <button
                      onClick={sendToBlenderNow}
                      className="flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border bg-orange-900/30 border-orange-700/50 text-orange-300 hover:bg-orange-900/60 hover:text-orange-200 transition-all"
                    >
                      Retry
                    </button>
                    <a
                      href="https://github.com/IxxyXR/polyhydra-web/releases/latest"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex-1 px-2 py-1.5 rounded-md text-[10px] font-bold uppercase tracking-wider border bg-neutral-800/40 border-neutral-700/50 text-neutral-300 hover:bg-neutral-800 hover:text-neutral-200 transition-all text-center"
                    >
                      Get add-on ↗
                    </a>
                  </div>
                  {blenderError && (
                    <p className="text-[9px] text-red-400/80">{blenderError}</p>
                  )}
                </div>
              )}
              <button
                onClick={async () => {
                  const params = buildAppSearchParams({
                    mode,
                    radialType,
                    radialSides,
                    boxXSegments,
                    boxYSegments,
                    boxZSegments,
                    coneHeightSegments,
                    coneTaper,
                    torusProfileSides,
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
                    roleColorCount,
                    roleGeometryDetail,
                    roleShapeBasis,
                    sideModulo,
                    sideOffset,
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
          <div className="flex flex-wrap gap-3 font-mono text-[10px] text-neutral-500">
            {[
              ['V', 'stat-vertices', 'Vertex count: unique corner points in the generated mesh.'],
              ['F', 'stat-faces', 'Face count: polygon faces after applying the operator stack.'],
              ['E', 'stat-edges', 'Edge count: unique mesh edges between neighbouring vertices.'],
              ['C', 'stat-colors', 'Colour count: distinct face colours currently in use.'],
            ].map(([label, id, tooltip]) => (
              <span key={id} className={`group relative cursor-help ${label === 'C' ? 'text-blue-400' : ''}`} tabIndex={0}>
                {label} <span id={id}>-</span>
                <span className="pointer-events-none absolute bottom-full left-0 z-30 mb-2 hidden w-48 rounded-lg border border-neutral-700 bg-neutral-950 px-2.5 py-2 font-sans text-[10px] leading-snug text-neutral-300 shadow-xl group-hover:block group-focus:block">
                  {tooltip}
                </span>
              </span>
            ))}
          </div>
        </div>
        </aside>
        </div>
      </motion.div>

      {/* Main Content */}
      <main className="flex-1 relative flex flex-col min-w-0">
        <div className="w-full h-full">
          <TilingCanvas
            ref={tilingCanvasRef}
            tilingType={tilingType}
            rows={rows}
            cols={cols}
            showEdges={showEdges}
            showVertices={showVertices}
            showFaces={showFaces}
            wireframe={wireframe}
            operators={activeOperators}
            palette={palette}
            paletteColors={shuffledColors ?? undefined}
            colorMode={renderColorMode}
            roleColorCount={roleColorCount}
            roleGeometryDetail={roleGeometryDetail}
            roleShapeBasis={roleShapeBasis}
            sideModulo={sideModulo}
            sideOffset={sideOffset}
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
            radialBuildOptions={radialBuildOptions}
            fitRequestKey={fitRequestKey}
            onGeometryGenerationChange={handleGeometryGenerationChange}
            xrPanel={xrPanel}
          />
        </div>

        <AnimatePresence>
          {showOnboarding && (
            <motion.div
              key="onboarding"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 16 }}
              className="absolute bottom-20 left-6 z-20 w-60 rounded-2xl border border-neutral-700/60 bg-neutral-900/90 p-4 shadow-2xl backdrop-blur-md"
            >
              <div className="mb-3 flex items-center justify-between">
                <span className="text-[10px] font-bold uppercase tracking-widest text-neutral-300">Getting Started</span>
                <button onClick={dismissOnboarding} className="text-neutral-500 transition-colors hover:text-white">
                  <X className="h-3 w-3" />
                </button>
              </div>
              <div className="space-y-3">
                {onboardingStepItems.map(({ step, label, done }, index) => (
                  <div key={`${step}-${index}`} className="flex flex-col gap-2">
                    <div className="flex items-start gap-3">
                      <div
                        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold transition-colors ${
                          done
                            ? 'bg-emerald-600 text-white'
                            : step === activeOnboardingStep
                              ? 'bg-blue-600 text-white'
                              : 'bg-neutral-700 text-neutral-500'
                        }`}
                      >
                        {step === 0 ? '?' : done ? '✓' : step}
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
                    {step === 0 && (
                      <div className="flex flex-wrap gap-2 pl-8">
                        <button
                          onClick={startPresetTutorial}
                          className="rounded-lg border border-yellow-600 bg-yellow-300/40 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-yellow-950 transition-colors hover:bg-yellow-300/60"
                        >
                          Start tutorial
                        </button>
                        <button
                          onClick={skipPresetTutorial}
                          className="rounded-lg border border-neutral-700 bg-neutral-900/50 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide text-neutral-400 transition-colors hover:bg-neutral-800 hover:text-neutral-200"
                        >
                          Keep preset
                        </button>
                      </div>
                    )}
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
          <div className="flex w-48 items-center gap-2">
            <div className={`h-2 w-2 rounded-full ${isGeometryGenerating ? 'animate-pulse bg-amber-400' : 'bg-emerald-500'}`} />
            <span className={`font-mono text-[10px] uppercase tracking-widest ${isGeometryGenerating ? 'text-amber-200' : 'text-neutral-400'}`}>
              {isGeometryGenerating ? 'Rendering Geometry' : 'Ready'}
            </span>
          </div>
          <div className="h-4 w-px bg-neutral-800" />
          <button
            onClick={requestFitToExtents}
            className="flex items-center gap-2 rounded-full border border-neutral-700/80 bg-neutral-800/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-blue-700/60 hover:bg-blue-950/30 hover:text-white"
            title="Zoom to extents"
          >
            <Search className="h-3.5 w-3.5" />
            <span>Zoom to Extents</span>
          </button>
          <button
            onClick={enterWebXR}
            disabled={webXrSupported === false}
            className="flex items-center gap-2 rounded-full border border-neutral-700/80 bg-neutral-800/70 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-widest text-neutral-300 transition-colors hover:border-blue-700/60 hover:bg-blue-950/30 hover:text-white disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-neutral-700/80 disabled:hover:bg-neutral-800/70 disabled:hover:text-neutral-300"
            title={webXrSupported === false ? 'WebXR is not available in this browser or device' : webXrError ?? 'Enter WebXR mode'}
          >
            <Headset className="h-3.5 w-3.5" />
            <span>WebXR</span>
          </button>
        </div>
      </main>
    </div>
  );
}
