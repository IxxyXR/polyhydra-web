import { Vector3 } from 'three';

export interface Mesh {
  vertices: number[];
  faces: number[][];
  faceValues?: number[];
  // Optional explicit role per mesh face, used by base tilings/solids and
  // assigned by Omni from each output n-gon's construction signature.
  roleValues?: number[];
}

export interface OperatorSpec {
  notation: string;
  tVe: number;
  tVf: number;
  tFe: number;
  roleGeometryDetail?: number;
  roleShapeBasis?: RoleShapeBasis;
  faceFilter?: FaceFilterSpec;
}

export type RoleShapeBasis = 'sides' | 'angles' | 'lengths-angles';
export type FaceFilterProperty = 'sides';
export type FaceFilterMeasure = 'equal' | 'less-than' | 'is-even';

export interface FaceFilterSpec {
  enabled: boolean;
  property: FaceFilterProperty;
  measure: FaceFilterMeasure;
  negate: boolean;
  value: number;
}

export interface OmniParamVisibility {
  showP1: boolean;
  showP2: boolean;
  showP3: boolean;
}

type OmniPointClass =
  | 'V'
  | 'E'
  | 'F'
  | 'F!'
  | 've'
  | 've0'
  | 've1'
  | 'vf'
  | 'vf!'
  | 'fe'
  | 'fe!';

interface SourceVertex {
  id: number;
  position: Vector3;
  normal: Vector3;
}

interface SourceFace {
  id: number;
  halfedge: SourceHalfedge;
  centroid: Vector3;
  normal: Vector3;
}

interface SourceHalfedge {
  id: number;
  vertex: SourceVertex;
  prev: SourceHalfedge;
  next: SourceHalfedge;
  pair: SourceHalfedge | null;
  face: SourceFace;
}

interface OVertex {
  id: number;
  pointClass: OmniPointClass;
  position: Vector3;
  normal: Vector3;
  sourceKeys: Set<string>;
}

interface OEdge {
  a: OVertex;
  b: OVertex;
  atom: string;
  sourceEdgeKey: string | null;
}

interface SourceFaceRoleContext {
  sideCount: number;
}

interface OperatorConnection {
  a: OVertex;
  b: OVertex;
  sourceEdgeIndex: number;
}

const EPSILON = 1e-4;
const OPERATOR_SPEC_DELIMITER = '~';

export const DEFAULT_OMNI_PARAMS = {
  tVe: 0.5,
  tVf: 0.5,
  tFe: 0.5,
};

export const DEFAULT_FACE_FILTER: FaceFilterSpec = {
  enabled: false,
  property: 'sides',
  measure: 'equal',
  negate: false,
  value: 4,
};

export const OMNI_POINT_CLASSES: OmniPointClass[] = [
  'V',
  'E',
  'F',
  'F!',
  've',
  've0',
  've1',
  'vf',
  'vf!',
  'fe',
  'fe!',
];

export const OMNI_ATOMS = [
  'E-E', 'E-F', 'E-V', 'E-fe', 'E-ve', 'E-vf',
  'F-F!', 'F-V', 'F-fe', 'F-ve', 'F-vf',
  'V-V', 'V-ve', 'V-vf',
  'fe-V', 'fe-fe', 'fe-fe!', 'fe-ve', 'fe-vf',
  've-vf', 've0-ve0', 've1-ve1',
  'vf-vf', 'vf-vf!',
] as const;

export const OMNI_VALID_OPERATORS = [
  ['E-E'],
  ['F-F!'],
  ['V-V'],
  ['ve0-ve0', 've1-ve1'],
  ['vf-vf', 'vf-vf!'],
  ['fe-fe', 'fe-fe!'],
  ['F-V'],
  ['E-E', 'E-F'],
  ['E-E', 'E-V'],
  ['E-vf', 'vf-vf'],
  ['E-vf', 'vf-vf!'],
  ['F-F!', 'F-V'],
  ['F-V', 'V-V'],
  ['F-ve', 've0-ve0'],
  ['F-ve', 've1-ve1'],
  ['F-vf', 'vf-vf!'],
  ['V-vf', 'vf-vf'],
  ['fe-V', 'fe-fe'],
  ['fe-V', 'fe-fe!'],
  ['E-E', 'E-ve', 've1-ve1'],
  ['E-E', 'E-vf', 'vf-vf'],
  ['E-E', 'E-vf', 'vf-vf!'],
  ['E-E', 'E-fe', 'fe-fe'],
  ['E-vf', 'vf-vf', 'vf-vf!'],
  ['F-F!', 'F-ve', 've1-ve1'],
  ['F-F!', 'F-vf', 'vf-vf!'],
  ['F-ve', 've0-ve0', 've1-ve1'],
  ['F-vf', 'vf-vf', 'vf-vf!'],
  ['F-fe', 'fe-fe', 'fe-fe!'],
  ['V-V', 'V-vf', 'vf-vf'],
  ['V-V', 'fe-V', 'fe-fe'],
  ['V-ve', 've0-ve0', 've1-ve1'],
  ['V-vf', 'vf-vf', 'vf-vf!'],
  ['fe-V', 'fe-fe', 'fe-fe!'],
  ['ve0-ve0', 've-vf', 'vf-vf'],
  ['ve0-ve0', 've-vf', 'vf-vf!'],
  ['ve0-ve0', 'fe-ve', 'fe-fe'],
  ['ve1-ve1', 've-vf', 'vf-vf'],
  ['ve1-ve1', 'fe-ve', 'fe-fe'],
  ['ve1-ve1', 'fe-ve', 'fe-fe!'],
  ['vf-vf', 'fe-vf', 'fe-fe!'],
  ['vf-vf!', 'fe-vf', 'fe-fe'],
  ['vf-vf!', 'fe-vf', 'fe-fe!'],
  ['ve0-ve0', 've1-ve1', 've-vf', 'vf-vf'],
  ['ve0-ve0', 've1-ve1', 'fe-ve', 'fe-fe'],
  ['ve0-ve0', 've-vf', 'vf-vf', 'vf-vf!'],
  ['ve1-ve1', 've-vf', 'vf-vf', 'vf-vf!'],
  ['ve1-ve1', 'fe-ve', 'fe-fe', 'fe-fe!'],
  ['vf-vf', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['vf-vf', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['vf-vf!', 'fe-vf', 'fe-fe', 'fe-fe!'],
  ['E-F', 'E-V'],
  ['E-vf', 'F-vf'],
  ['E-vf', 'V-vf'],
  ['F-ve', 'V-ve'],
  ['F-fe', 'fe-V'],
  ['E-E', 'E-F', 'E-V'],
  ['E-E', 'E-vf', 'F-vf'],
  ['E-E', 'E-vf', 'V-vf'],
  ['E-F', 'E-V', 'F-V'],
  ['E-F', 'E-ve', 'F-ve'],
  ['E-F', 'E-ve', 've1-ve1'],
  ['E-F', 'E-vf', 'F-vf'],
  ['E-F', 'E-vf', 'vf-vf!'],
  ['E-V', 'E-vf', 'V-vf'],
  ['E-V', 'E-vf', 'vf-vf'],
  ['E-V', 'E-fe', 'fe-V'],
  ['E-V', 'E-fe', 'fe-fe'],
  ['E-ve', 'E-vf', 've-vf'],
  ['E-vf', 'E-fe', 'fe-vf'],
  ['E-vf', 'F-vf', 'vf-vf'],
  ['E-vf', 'F-vf', 'vf-vf!'],
  ['E-vf', 'V-vf', 'vf-vf'],
  ['E-vf', 'V-vf', 'vf-vf!'],
  ['E-vf', 've1-ve1', 've-vf'],
  ['E-vf', 'fe-vf', 'fe-fe'],
  ['F-F!', 'F-ve', 'V-ve'],
  ['F-V', 'F-ve', 'V-ve'],
  ['F-V', 'F-ve', 've0-ve0'],
  ['F-V', 'F-fe', 'fe-V'],
  ['F-V', 'fe-V', 'fe-fe!'],
  ['F-ve', 'F-vf', 've-vf'],
  ['F-ve', 'F-fe', 'fe-ve'],
  ['F-ve', 'V-ve', 've0-ve0'],
  ['F-ve', 'V-ve', 've1-ve1'],
  ['F-ve', 've-vf', 'vf-vf!'],
  ['F-ve', 'fe-ve', 'fe-fe!'],
  ['F-vf', 'V-vf', 'vf-vf'],
  ['F-vf', 'V-vf', 'vf-vf!'],
  ['F-vf', 've0-ve0', 've-vf'],
  ['F-vf', 've1-ve1', 've-vf'],
  ['F-vf', 'fe-vf', 'fe-fe!'],
  ['F-fe', 'V-V', 'fe-V'],
  ['F-fe', 'fe-V', 'fe-fe'],
  ['F-fe', 'fe-V', 'fe-fe!'],
  ['F-fe', 've0-ve0', 'fe-ve'],
  ['F-fe', 've1-ve1', 'fe-ve'],
  ['F-fe', 'vf-vf!', 'fe-vf'],
  ['V-ve', 'fe-V', 'fe-ve'],
  ['V-ve', 've-vf', 'vf-vf'],
  ['V-ve', 'fe-ve', 'fe-fe'],
  ['V-ve', 'fe-ve', 'fe-fe!'],
  ['V-vf', 'fe-V', 'fe-vf'],
  ['V-vf', 've0-ve0', 've-vf'],
  ['V-vf', 'fe-vf', 'fe-fe'],
  ['V-vf', 'fe-vf', 'fe-fe!'],
  ['fe-V', 've0-ve0', 'fe-ve'],
  ['fe-V', 'vf-vf', 'fe-vf'],
  ['ve-vf', 'fe-ve', 'fe-vf'],
  ['E-E', 'E-F', 'E-ve', 've1-ve1'],
  ['E-E', 'E-F', 'E-vf', 'F-vf'],
  ['E-E', 'E-F', 'E-vf', 'vf-vf!'],
  ['E-E', 'E-V', 'E-vf', 'V-vf'],
  ['E-E', 'E-V', 'E-vf', 'vf-vf'],
  ['E-E', 'E-V', 'E-fe', 'fe-fe'],
  ['E-E', 'E-ve', 'E-vf', 've-vf'],
  ['E-E', 'E-ve', 'V-ve', 've1-ve1'],
  ['E-E', 'E-ve', 've-vf', 'vf-vf!'],
  ['E-E', 'E-vf', 'E-fe', 'fe-vf'],
  ['E-E', 'E-vf', 'F-vf', 'vf-vf'],
  ['E-E', 'E-vf', 'V-vf', 'vf-vf!'],
  ['E-E', 'E-vf', 've1-ve1', 've-vf'],
  ['E-E', 'E-vf', 'fe-vf', 'fe-fe'],
  ['E-E', 'E-fe', 'F-fe', 'fe-fe'],
  ['E-E', 'E-fe', 'vf-vf', 'fe-vf'],
  ['E-F', 'E-ve', 'F-ve', 've1-ve1'],
  ['E-F', 'E-vf', 'F-vf', 'vf-vf!'],
  ['E-V', 'E-vf', 'V-vf', 'vf-vf'],
  ['E-V', 'E-fe', 'fe-V', 'fe-fe'],
  ['E-ve', 'E-vf', 've1-ve1', 've-vf'],
  ['E-ve', 'E-vf', 've1-ve1', 'vf-vf'],
  ['E-ve', 'E-vf', 've-vf', 'vf-vf'],
  ['E-ve', 'E-vf', 've-vf', 'vf-vf!'],
  ['E-ve', 'E-fe', 've1-ve1', 'fe-ve'],
  ['E-ve', 'E-fe', 've1-ve1', 'fe-fe'],
  ['E-ve', 'E-fe', 'fe-ve', 'fe-fe'],
  ['E-vf', 'E-fe', 'vf-vf', 'fe-vf'],
  ['E-vf', 'E-fe', 'vf-vf!', 'fe-vf'],
  ['E-vf', 'E-fe', 'vf-vf!', 'fe-fe'],
  ['E-vf', 'E-fe', 'fe-vf', 'fe-fe'],
  ['E-vf', 'F-vf', 'vf-vf', 'vf-vf!'],
  ['E-vf', 'V-vf', 'vf-vf', 'vf-vf!'],
  ['E-vf', 've1-ve1', 've-vf', 'vf-vf'],
  ['E-vf', 've1-ve1', 've-vf', 'vf-vf!'],
  ['E-vf', 'vf-vf', 'fe-vf', 'fe-fe'],
  ['E-vf', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['F-F!', 'F-V', 'F-ve', 'V-ve'],
  ['F-F!', 'F-ve', 'F-vf', 've-vf'],
  ['F-F!', 'F-ve', 'V-ve', 've1-ve1'],
  ['F-F!', 'F-ve', 've-vf', 'vf-vf!'],
  ['F-F!', 'F-vf', 'V-vf', 'vf-vf!'],
  ['F-F!', 'F-vf', 've1-ve1', 've-vf'],
  ['F-V', 'F-ve', 'V-ve', 've0-ve0'],
  ['F-V', 'F-fe', 'V-V', 'fe-V'],
  ['F-V', 'F-fe', 'fe-V', 'fe-fe!'],
  ['F-ve', 'F-vf', 've0-ve0', 've-vf'],
  ['F-ve', 'F-vf', 've0-ve0', 'vf-vf!'],
  ['F-ve', 'F-vf', 've1-ve1', 've-vf'],
  ['F-ve', 'F-vf', 've-vf', 'vf-vf!'],
  ['F-ve', 'F-fe', 've0-ve0', 'fe-ve'],
  ['F-ve', 'F-fe', 've1-ve1', 'fe-ve'],
  ['F-ve', 'F-fe', 'fe-ve', 'fe-fe!'],
  ['F-ve', 'V-ve', 've0-ve0', 've1-ve1'],
  ['F-ve', 've0-ve0', 've-vf', 'vf-vf!'],
  ['F-ve', 've1-ve1', 'fe-ve', 'fe-fe!'],
  ['F-vf', 'F-fe', 'vf-vf!', 'fe-vf'],
  ['F-vf', 'F-fe', 'fe-vf', 'fe-fe!'],
  ['F-vf', 'V-V', 'V-vf', 'vf-vf'],
  ['F-vf', 'V-vf', 'vf-vf', 'vf-vf!'],
  ['F-vf', 've0-ve0', 've1-ve1', 've-vf'],
  ['F-vf', 've0-ve0', 've-vf', 'vf-vf'],
  ['F-vf', 've0-ve0', 've-vf', 'vf-vf!'],
  ['F-vf', 've1-ve1', 've-vf', 'vf-vf'],
  ['F-vf', 've1-ve1', 've-vf', 'vf-vf!'],
  ['F-vf', 'vf-vf', 'fe-vf', 'fe-fe!'],
  ['F-vf', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['F-fe', 'V-V', 'fe-V', 'fe-fe'],
  ['F-fe', 'fe-V', 'fe-fe', 'fe-fe!'],
  ['F-fe', 've0-ve0', 've1-ve1', 'fe-ve'],
  ['F-fe', 've0-ve0', 'fe-ve', 'fe-fe'],
  ['F-fe', 've1-ve1', 'fe-ve', 'fe-fe'],
  ['F-fe', 've1-ve1', 'fe-ve', 'fe-fe!'],
  ['F-fe', 'vf-vf', 'vf-vf!', 'fe-vf'],
  ['F-fe', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['F-fe', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['V-V', 'V-vf', 'fe-V', 'fe-vf'],
  ['V-V', 'V-vf', 'fe-vf', 'fe-fe'],
  ['V-V', 'fe-V', 'vf-vf', 'fe-vf'],
  ['V-ve', 'V-vf', 've0-ve0', 've-vf'],
  ['V-ve', 'V-vf', 've-vf', 'vf-vf'],
  ['V-ve', 'fe-V', 've0-ve0', 'fe-ve'],
  ['V-ve', 'fe-V', 'fe-ve', 'fe-fe'],
  ['V-ve', 'fe-V', 'fe-ve', 'fe-fe!'],
  ['V-ve', 've0-ve0', 've-vf', 'vf-vf'],
  ['V-ve', 've0-ve0', 'fe-ve', 'fe-fe'],
  ['V-ve', 've1-ve1', 've-vf', 'vf-vf'],
  ['V-ve', 've1-ve1', 'fe-ve', 'fe-fe'],
  ['V-ve', 've1-ve1', 'fe-ve', 'fe-fe!'],
  ['V-ve', 've-vf', 'vf-vf', 'vf-vf!'],
  ['V-ve', 'fe-ve', 'fe-fe', 'fe-fe!'],
  ['V-vf', 'fe-V', 'vf-vf', 'fe-vf'],
  ['V-vf', 'fe-V', 'vf-vf', 'fe-fe!'],
  ['V-vf', 'fe-V', 'fe-vf', 'fe-fe'],
  ['V-vf', 'fe-V', 'fe-vf', 'fe-fe!'],
  ['V-vf', 've0-ve0', 've-vf', 'vf-vf'],
  ['V-vf', 've0-ve0', 've-vf', 'vf-vf!'],
  ['V-vf', 'vf-vf', 'fe-vf', 'fe-fe'],
  ['V-vf', 'vf-vf', 'fe-vf', 'fe-fe!'],
  ['V-vf', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['V-vf', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['V-vf', 'fe-vf', 'fe-fe', 'fe-fe!'],
  ['fe-V', 've0-ve0', 'fe-ve', 'fe-fe'],
  ['fe-V', 'vf-vf', 'fe-vf', 'fe-fe!'],
  ['ve0-ve0', 've-vf', 'fe-ve', 'fe-vf'],
  ['ve0-ve0', 've-vf', 'fe-vf', 'fe-fe'],
  ['ve0-ve0', 'fe-ve', 'vf-vf', 'fe-vf'],
  ['ve0-ve0', 'fe-ve', 'vf-vf!', 'fe-vf'],
  ['ve1-ve1', 've-vf', 'fe-ve', 'fe-vf'],
  ['ve1-ve1', 've-vf', 'fe-vf', 'fe-fe'],
  ['ve1-ve1', 've-vf', 'fe-vf', 'fe-fe!'],
  ['ve1-ve1', 'fe-ve', 'vf-vf', 'fe-vf'],
  ['ve-vf', 'fe-ve', 'vf-vf', 'fe-vf'],
  ['ve-vf', 'fe-ve', 'vf-vf', 'fe-fe!'],
  ['ve-vf', 'fe-ve', 'vf-vf!', 'fe-vf'],
  ['ve-vf', 'fe-ve', 'vf-vf!', 'fe-fe'],
  ['ve-vf', 'fe-ve', 'vf-vf!', 'fe-fe!'],
  ['ve-vf', 'fe-ve', 'fe-vf', 'fe-fe'],
  ['ve-vf', 'fe-ve', 'fe-vf', 'fe-fe!'],
  ['E-E', 'E-ve', 'E-vf', 've1-ve1', 've-vf'],
  ['E-E', 'E-ve', 'E-vf', 've1-ve1', 'vf-vf'],
  ['E-E', 'E-ve', 'E-vf', 've-vf', 'vf-vf!'],
  ['E-E', 'E-ve', 'E-fe', 've1-ve1', 'fe-fe'],
  ['E-E', 'E-vf', 'E-fe', 'vf-vf', 'fe-vf'],
  ['E-E', 'E-vf', 'E-fe', 'vf-vf!', 'fe-fe'],
  ['E-E', 'E-vf', 'E-fe', 'fe-vf', 'fe-fe'],
  ['E-ve', 'E-vf', 've1-ve1', 've-vf', 'vf-vf'],
  ['E-ve', 'E-vf', 've-vf', 'vf-vf', 'vf-vf!'],
  ['E-ve', 'E-fe', 've1-ve1', 'fe-ve', 'fe-fe'],
  ['E-vf', 'E-fe', 'vf-vf', 'vf-vf!', 'fe-vf'],
  ['E-vf', 'E-fe', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['E-vf', 've1-ve1', 've-vf', 'vf-vf', 'vf-vf!'],
  ['E-vf', 'vf-vf', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['F-F!', 'F-ve', 'F-vf', 've1-ve1', 've-vf'],
  ['F-F!', 'F-ve', 'F-vf', 've-vf', 'vf-vf!'],
  ['F-F!', 'F-vf', 've1-ve1', 've-vf', 'vf-vf!'],
  ['F-ve', 'F-vf', 've0-ve0', 've1-ve1', 've-vf'],
  ['F-ve', 'F-vf', 've0-ve0', 've-vf', 'vf-vf!'],
  ['F-ve', 'F-fe', 've0-ve0', 've1-ve1', 'fe-ve'],
  ['F-ve', 'F-fe', 've1-ve1', 'fe-ve', 'fe-fe!'],
  ['F-vf', 'F-fe', 'vf-vf', 'vf-vf!', 'fe-vf'],
  ['F-vf', 'F-fe', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['F-vf', 've0-ve0', 've1-ve1', 've-vf', 'vf-vf'],
  ['F-vf', 've0-ve0', 've-vf', 'vf-vf', 'vf-vf!'],
  ['F-vf', 've1-ve1', 've-vf', 'vf-vf', 'vf-vf!'],
  ['F-vf', 'vf-vf', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['F-fe', 've0-ve0', 've1-ve1', 'fe-ve', 'fe-fe'],
  ['F-fe', 've1-ve1', 'fe-ve', 'fe-fe', 'fe-fe!'],
  ['F-fe', 'vf-vf', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['F-fe', 'vf-vf!', 'fe-vf', 'fe-fe', 'fe-fe!'],
  ['V-V', 'V-vf', 'fe-V', 'vf-vf', 'fe-vf'],
  ['V-V', 'V-vf', 'fe-V', 'fe-vf', 'fe-fe'],
  ['V-V', 'V-vf', 'vf-vf', 'fe-vf', 'fe-fe'],
  ['V-ve', 'V-vf', 've0-ve0', 've-vf', 'vf-vf'],
  ['V-ve', 'V-vf', 've-vf', 'vf-vf', 'vf-vf!'],
  ['V-ve', 'fe-V', 've0-ve0', 'fe-ve', 'fe-fe'],
  ['V-ve', 'fe-V', 'fe-ve', 'fe-fe', 'fe-fe!'],
  ['V-ve', 've0-ve0', 've1-ve1', 've-vf', 'vf-vf'],
  ['V-ve', 've0-ve0', 've1-ve1', 'fe-ve', 'fe-fe'],
  ['V-ve', 've1-ve1', 've-vf', 'vf-vf', 'vf-vf!'],
  ['V-ve', 've1-ve1', 'fe-ve', 'fe-fe', 'fe-fe!'],
  ['V-vf', 'fe-V', 'vf-vf', 'fe-vf', 'fe-fe!'],
  ['V-vf', 'fe-V', 'fe-vf', 'fe-fe', 'fe-fe!'],
  ['V-vf', 've0-ve0', 've-vf', 'vf-vf', 'vf-vf!'],
  ['V-vf', 'vf-vf', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['V-vf', 'vf-vf', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['V-vf', 'vf-vf!', 'fe-vf', 'fe-fe', 'fe-fe!'],
  ['ve0-ve0', 've1-ve1', 've-vf', 'fe-ve', 'fe-vf'],
  ['ve0-ve0', 've1-ve1', 've-vf', 'fe-vf', 'fe-fe'],
  ['ve0-ve0', 've1-ve1', 'fe-ve', 'vf-vf', 'fe-vf'],
  ['ve0-ve0', 've-vf', 'fe-ve', 'vf-vf', 'fe-vf'],
  ['ve0-ve0', 've-vf', 'fe-ve', 'vf-vf!', 'fe-vf'],
  ['ve0-ve0', 've-vf', 'fe-ve', 'vf-vf!', 'fe-fe'],
  ['ve0-ve0', 've-vf', 'fe-ve', 'fe-vf', 'fe-fe'],
  ['ve0-ve0', 've-vf', 'vf-vf', 'fe-vf', 'fe-fe'],
  ['ve0-ve0', 've-vf', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['ve0-ve0', 'fe-ve', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['ve1-ve1', 've-vf', 'fe-ve', 'vf-vf', 'fe-vf'],
  ['ve1-ve1', 've-vf', 'fe-ve', 'vf-vf', 'fe-fe!'],
  ['ve1-ve1', 've-vf', 'fe-ve', 'fe-vf', 'fe-fe'],
  ['ve1-ve1', 've-vf', 'fe-ve', 'fe-vf', 'fe-fe!'],
  ['ve1-ve1', 've-vf', 'vf-vf', 'fe-vf', 'fe-fe'],
  ['ve1-ve1', 've-vf', 'vf-vf', 'fe-vf', 'fe-fe!'],
  ['ve1-ve1', 've-vf', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['ve1-ve1', 've-vf', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['ve1-ve1', 've-vf', 'fe-vf', 'fe-fe', 'fe-fe!'],
  ['ve1-ve1', 'fe-ve', 'vf-vf', 'fe-vf', 'fe-fe!'],
  ['ve-vf', 'fe-ve', 'vf-vf', 'fe-vf', 'fe-fe!'],
  ['ve-vf', 'fe-ve', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['ve-vf', 'fe-ve', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['ve-vf', 'fe-ve', 'vf-vf!', 'fe-fe', 'fe-fe!'],
  ['ve-vf', 'fe-ve', 'fe-vf', 'fe-fe', 'fe-fe!'],
  ['ve0-ve0', 've1-ve1', 've-vf', 'fe-ve', 'vf-vf', 'fe-vf'],
  ['ve0-ve0', 've1-ve1', 've-vf', 'fe-ve', 'fe-vf', 'fe-fe'],
  ['ve0-ve0', 've1-ve1', 've-vf', 'vf-vf', 'fe-vf', 'fe-fe'],
  ['ve0-ve0', 've-vf', 'fe-ve', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['ve0-ve0', 've-vf', 'vf-vf', 'vf-vf!', 'fe-vf', 'fe-fe'],
  ['ve1-ve1', 've-vf', 'fe-ve', 'vf-vf', 'fe-vf', 'fe-fe!'],
  ['ve1-ve1', 've-vf', 'fe-ve', 'fe-vf', 'fe-fe', 'fe-fe!'],
  ['ve1-ve1', 've-vf', 'vf-vf', 'vf-vf!', 'fe-vf', 'fe-fe!'],
  ['ve1-ve1', 've-vf', 'vf-vf!', 'fe-vf', 'fe-fe', 'fe-fe!'],
  ['ve-vf', 'fe-ve', 'vf-vf!', 'fe-vf', 'fe-fe', 'fe-fe!'],
] as const;

export const OMNI_PRESETS: Record<string, string> = {
  Ambo: 'E-E',
  Dual: 'F-F!',
  Seed: 'V-V',
  Zip: 'fe-fe,fe-fe!',
  Truncate: 've0-ve0,ve1-ve1',
  Expand: 'vf-vf,vf-vf!',
  Join: 'F-V',
  Subdivide: 'E-E,E-V',
  Needle: 'F-F!,F-V',
  Kis: 'F-V,V-V',
  Chamfer: 'V-vf,vf-vf',
  Loft: 'V-V,V-vf,vf-vf',
  'Join-Lace': 'fe-V,fe-fe',
  Lace: 'V-V,fe-V,fe-fe',
  'Opposite-Lace': 'fe-V,fe-fe,fe-fe!',
  Ortho: 'E-F,E-V',
  Meta: 'E-F,E-V,F-V',
  Quinto: 'E-V,E-fe,fe-fe',
  'Join-Stake': 'F-fe,fe-V',
  Stake: 'F-fe,V-V,fe-V',
  'Opposite-Stake': 'F-fe,fe-V,fe-fe!',
  'Join-Kis-Kis': 'F-V,F-fe,fe-V',
  'Join-Medial': 'F-ve',
  Medial: 'F-ve,V-ve,ve0-ve0',
  'Edge-Medial': 'F-V,F-ve,V-ve,ve0-ve0',
};

const OPERATOR_ALIASES: Record<string, string> = {
  dual: OMNI_PRESETS.Dual,
  kis: OMNI_PRESETS.Kis,
  ambo: OMNI_PRESETS.Ambo,
  truncate: OMNI_PRESETS.Truncate,
  join: OMNI_PRESETS.Join,
  ortho: OMNI_PRESETS.Ortho,
};

let operatorVertexId = 0;

export function parseAtomList(input: string): string[] {
  if (!input.trim()) {
    return [];
  }

  return input
    .split(',')
    .map((atom) => atom.trim())
    .filter(Boolean);
}

export function joinAtomList(atoms: string[]): string {
  return atoms.join(',');
}

export function findOmniAtom(rowClass: OmniPointClass, colClass: OmniPointClass): string | null {
  const direct = `${rowClass}-${colClass}`;
  const reverse = `${colClass}-${rowClass}`;
  for (const atom of OMNI_ATOMS) {
    if (atom === direct || atom === reverse) {
      return atom;
    }
  }
  return null;
}

export function getUnknownAtoms(atoms: string[]): string[] {
  return atoms.filter((atom) => !OMNI_ATOMS.includes(atom as (typeof OMNI_ATOMS)[number]));
}

export function isValidSubset(atoms: string[]): boolean {
  const uniqueAtoms = new Set(atoms);
  if (uniqueAtoms.size === 0) {
    return true;
  }
  if (getUnknownAtoms([...uniqueAtoms]).length > 0) {
    return false;
  }

  return OMNI_VALID_OPERATORS.some((validOperator) => {
    const validSet = new Set<string>(validOperator);
    return [...uniqueAtoms].every((atom) => validSet.has(atom));
  });
}

export function isCompatibleSubset(selected: string[], candidate: string): boolean {
  const uniqueAtoms = new Set(selected);
  uniqueAtoms.add(candidate);
  return isValidSubset([...uniqueAtoms]);
}

export function isCompleteOperator(atoms: string[]): boolean {
  const uniqueAtoms = new Set(atoms);
  if (uniqueAtoms.size === 0) {
    return false;
  }
  if (getUnknownAtoms([...uniqueAtoms]).length > 0) {
    return false;
  }

  return OMNI_VALID_OPERATORS.some((validOperator) => {
    if (validOperator.length !== uniqueAtoms.size) {
      return false;
    }

    const validSet = new Set<string>(validOperator);
    return [...uniqueAtoms].every((atom) => validSet.has(atom));
  });
}

export function findPresetName(atoms: string[]): string | null {
  const uniqueAtoms = new Set(atoms);
  if (uniqueAtoms.size === 0) {
    return null;
  }

  for (const [name, notation] of Object.entries(OMNI_PRESETS)) {
    const presetAtoms = parseAtomList(notation);
    if (presetAtoms.length !== uniqueAtoms.size) {
      continue;
    }

    const presetSet = new Set(presetAtoms);
    if ([...uniqueAtoms].every((atom) => presetSet.has(atom))) {
      return name;
    }
  }

  return null;
}

export function orderAtoms(atoms: Iterable<string>): string[] {
  const selected = new Set(atoms);
  return OMNI_ATOMS.filter((atom) => selected.has(atom));
}

function cloneMesh(mesh: Mesh): Mesh {
  return {
    vertices: [...mesh.vertices],
    faces: mesh.faces.map((face) => [...face]),
    faceValues: mesh.faceValues ? [...mesh.faceValues] : undefined,
    roleValues: mesh.roleValues ? [...mesh.roleValues] : undefined,
  };
}

function actualMod(value: number, modulus: number): number {
  return ((value % modulus) + modulus) % modulus;
}

function clampFaceFilterValue(value: number): number {
  if (!Number.isFinite(value)) {
    return DEFAULT_FACE_FILTER.value;
  }
  return Math.min(Math.max(Math.round(value), 3), 32);
}

export function normalizeFaceFilter(filter?: FaceFilterSpec): FaceFilterSpec {
  return {
    enabled: filter?.enabled ?? DEFAULT_FACE_FILTER.enabled,
    property: DEFAULT_FACE_FILTER.property,
    measure: filter?.measure === 'less-than' || filter?.measure === 'is-even' ? filter.measure : DEFAULT_FACE_FILTER.measure,
    negate: filter?.negate ?? DEFAULT_FACE_FILTER.negate,
    value: clampFaceFilterValue(filter?.value ?? DEFAULT_FACE_FILTER.value),
  };
}

function evaluateFaceFilterValue(value: number, measure: FaceFilterMeasure, target: number, negate: boolean): boolean {
  const roundedValue = Math.round(value);
  const roundedTarget = Math.round(target);
  if (measure === 'equal') {
    return negate ? roundedValue !== roundedTarget : roundedValue === roundedTarget;
  }
  if (measure === 'less-than') {
    return negate ? roundedValue > roundedTarget : roundedValue < roundedTarget;
  }

  const isEven = actualMod(roundedValue, 2) === 0;
  return negate ? !isEven : isEven;
}

function getFaceFilterPropertyValue(mesh: Mesh, faceIndex: number, property: FaceFilterProperty): number | null {
  if (property === 'sides') {
    return mesh.faces[faceIndex]?.length ?? null;
  }
  return null;
}

export function testFaceFilter(mesh: Mesh, faceIndex: number, filter: FaceFilterSpec): boolean {
  const normalized = normalizeFaceFilter(filter);
  const value = getFaceFilterPropertyValue(mesh, faceIndex, normalized.property);
  if (value === null || !Number.isFinite(value)) {
    return false;
  }

  return evaluateFaceFilterValue(value, normalized.measure, normalized.value, normalized.negate);
}

function twin(index: number): number {
  return index ^ 1;
}

function edgeKey(a: number, b: number): string {
  return a <= b ? `${a}_${b}` : `${b}_${a}`;
}

function normalizeClass(pointClass: string): OmniPointClass {
  const normalized = pointClass.startsWith('!')
    ? `${pointClass.slice(1)}!`
    : pointClass;

  switch (normalized) {
    case 'V':
    case 'E':
    case 'F':
    case 'F!':
    case 've':
    case 've0':
    case 've1':
    case 'vf':
    case 'vf!':
    case 'fe':
    case 'fe!':
      return normalized;
    default:
      throw new Error(`Unknown Omni point class '${pointClass}'`);
  }
}

function parseOperatorNotation(operatorNotation: string): Array<[OmniPointClass, OmniPointClass]> {
  return operatorNotation
    .split(',')
    .map((atom) => atom.trim())
    .filter(Boolean)
    .map((atom) => {
      const dashIndex = atom.indexOf('-');
      if (dashIndex < 0) {
        throw new Error(`Invalid Omni atom '${atom}': missing '-'`);
      }

      const a = normalizeClass(atom.slice(0, dashIndex).trim());
      const b = normalizeClass(atom.slice(dashIndex + 1).trim());
      return [a, b];
    });
}

function sourceFaceHalfedges(face: SourceFace): SourceHalfedge[] {
  const halfedges: SourceHalfedge[] = [];
  let current = face.halfedge;
  do {
    halfedges.push(current);
    current = current.next;
  } while (current !== face.halfedge);
  return halfedges;
}

function computeFaceNormal(face: number[], vertices: number[]): Vector3 {
  const normal = new Vector3();

  for (let i = 0; i < face.length; i++) {
    const currentIndex = face[i] * 3;
    const nextIndex = face[(i + 1) % face.length] * 3;

    const currentX = vertices[currentIndex];
    const currentY = vertices[currentIndex + 1];
    const currentZ = vertices[currentIndex + 2];
    const nextX = vertices[nextIndex];
    const nextY = vertices[nextIndex + 1];
    const nextZ = vertices[nextIndex + 2];

    normal.x += (currentY - nextY) * (currentZ + nextZ);
    normal.y += (currentZ - nextZ) * (currentX + nextX);
    normal.z += (currentX - nextX) * (currentY + nextY);
  }

  if (normal.lengthSq() < 1e-10) {
    normal.set(0, 0, 1);
  } else {
    normal.normalize();
  }

  return normal;
}

function buildHalfedgeMesh(mesh: Mesh): { vertices: SourceVertex[]; faces: SourceFace[] } {
  const sourceVertices: SourceVertex[] = [];
  for (let index = 0; index < mesh.vertices.length; index += 3) {
    sourceVertices.push({
      id: index / 3,
      position: new Vector3(mesh.vertices[index], mesh.vertices[index + 1], mesh.vertices[index + 2]),
      normal: new Vector3(),
    });
  }

  const faces: SourceFace[] = [];
  const directedHalfedges = new Map<string, SourceHalfedge>();
  let halfedgeId = 0;

  mesh.faces.forEach((faceIndices, faceId) => {
    if (faceIndices.length < 3) {
      return;
    }

    const halfedges = faceIndices.map((_, edgeIndex) => {
      const destinationVertex = sourceVertices[faceIndices[(edgeIndex + 1) % faceIndices.length]];
      return {
        id: halfedgeId++,
        vertex: destinationVertex,
        prev: null as unknown as SourceHalfedge,
        next: null as unknown as SourceHalfedge,
        pair: null,
        face: null as unknown as SourceFace,
      };
    });

    for (let edgeIndex = 0; edgeIndex < halfedges.length; edgeIndex++) {
      halfedges[edgeIndex].prev = halfedges[actualMod(edgeIndex - 1, halfedges.length)];
      halfedges[edgeIndex].next = halfedges[(edgeIndex + 1) % halfedges.length];
    }

    const centroid = new Vector3();
    faceIndices.forEach((vertexIndex) => {
      centroid.add(sourceVertices[vertexIndex].position);
    });
    centroid.divideScalar(faceIndices.length);

    const face: SourceFace = {
      id: faceId,
      halfedge: halfedges[0],
      centroid,
      normal: computeFaceNormal(faceIndices, mesh.vertices),
    };

    halfedges.forEach((halfedge) => {
      halfedge.face = face;
      const originId = halfedge.prev.vertex.id;
      const destinationId = halfedge.vertex.id;
      directedHalfedges.set(`${originId}_${destinationId}`, halfedge);
    });

    faceIndices.forEach((vertexIndex) => {
      sourceVertices[vertexIndex].normal.add(face.normal);
    });

    faces.push(face);
  });

  faces.forEach((face) => {
    sourceFaceHalfedges(face).forEach((halfedge) => {
      const reverseKey = `${halfedge.vertex.id}_${halfedge.prev.vertex.id}`;
      halfedge.pair = directedHalfedges.get(reverseKey) ?? null;
    });
  });

  sourceVertices.forEach((vertex) => {
    if (vertex.normal.lengthSq() < 1e-10) {
      vertex.normal.set(0, 0, 1);
    } else {
      vertex.normal.normalize();
    }
  });

  return { vertices: sourceVertices, faces };
}

class OperatorVertexCache {
  private readonly cache = new Map<string, OVertex>();

  getOrCreate(key: string, pointClass: OmniPointClass, position: Vector3, normal: Vector3): OVertex {
    const existing = this.cache.get(key);
    if (existing) {
      return existing;
    }

    const created: OVertex = {
      id: ++operatorVertexId,
      pointClass,
      position: position.clone(),
      normal: normal.clone(),
      sourceKeys: new Set<string>(),
    };
    this.cache.set(key, created);
    return created;
  }
}

function computeEdgeArray(
  face: SourceFace,
  halfedges: SourceHalfedge[],
  cache: OperatorVertexCache
): OVertex[] {
  return halfedges.map((halfedge) => {
    const pairNormal = halfedge.pair?.face.normal ?? face.normal;
    const edgeNormal = face.normal.clone().add(pairNormal).multiplyScalar(0.5);
    if (edgeNormal.lengthSq() < 1e-10) {
      edgeNormal.copy(face.normal);
    } else {
      edgeNormal.normalize();
    }

    const midpoint = halfedge.prev.vertex.position.clone().add(halfedge.vertex.position).multiplyScalar(0.5);
    const vertex = cache.getOrCreate(
      `E_${edgeKey(halfedge.prev.vertex.id, halfedge.vertex.id)}`,
      'E',
      midpoint,
      edgeNormal
    );
    vertex.sourceKeys.add(`e:${edgeKey(halfedge.prev.vertex.id, halfedge.vertex.id)}`);
    vertex.sourceKeys.add(`v:${halfedge.prev.vertex.id}`);
    vertex.sourceKeys.add(`v:${halfedge.vertex.id}`);
    return vertex;
  });
}

function buildFacePoints(
  face: SourceFace,
  halfedges: SourceHalfedge[],
  classesNeeded: Set<OmniPointClass>,
  cache: OperatorVertexCache,
  tVe: number,
  tVf: number,
  tFe: number
): { singles: Map<string, OVertex>; arrays: Map<string, OVertex[]> } {
  const singles = new Map<string, OVertex>();
  const arrays = new Map<string, OVertex[]>();
  const count = halfedges.length;
  const faceNormal = face.normal;

  const needV = classesNeeded.has('V');
  const needE = classesNeeded.has('E');
  const needF = classesNeeded.has('F');
  const needVe = classesNeeded.has('ve') || classesNeeded.has('ve0') || classesNeeded.has('ve1');
  const needVf = classesNeeded.has('vf');
  const needFe = classesNeeded.has('fe');
  const needFAdjacent = classesNeeded.has('F!');
  const needFeAdjacent = classesNeeded.has('fe!');
  const needVfAdjacent = classesNeeded.has('vf!');

  let vArray: OVertex[] | null = null;
  if (needV || needVe || needVf || needVfAdjacent) {
    vArray = new Array<OVertex>(count);
    for (let index = 0; index < count; index++) {
      const vertex = halfedges[index].prev.vertex;
      const operatorVertex = cache.getOrCreate(`V_${vertex.id}`, 'V', vertex.position, vertex.normal);
      operatorVertex.sourceKeys.add(`v:${vertex.id}`);
      operatorVertex.sourceKeys.add(`f:${face.id}`);
      vArray[index] = operatorVertex;
    }
    arrays.set('V', vArray);
  }

  let eArray: OVertex[] | null = null;
  if (needE || needVe || needFe || needFeAdjacent) {
    eArray = computeEdgeArray(face, halfedges, cache);
    arrays.set('E', eArray);
  }

  let fVertex: OVertex | null = null;
  if (needF || needVf || needFe) {
    fVertex = cache.getOrCreate(`F_${face.id}`, 'F', face.centroid, faceNormal);
    fVertex.sourceKeys.add(`f:${face.id}`);
    singles.set('F', fVertex);
  }

  if (needVe) {
    if (!eArray) {
      eArray = computeEdgeArray(face, halfedges, cache);
      arrays.set('E', eArray);
    }

    const ve = new Array<OVertex>(count * 2);
    for (let index = 0; index < count; index++) {
      const halfedge = halfedges[index];
      const origin = halfedge.prev.vertex;
      const destination = halfedge.vertex;
      const edgeNormal = eArray[index].normal;
      const sourceKey = edgeKey(origin.id, destination.id);

      ve[index * 2] = cache.getOrCreate(
        `ve_${origin.id}_${sourceKey}`,
        've',
        origin.position.clone().lerp(eArray[index].position, tVe),
        edgeNormal
      );
      ve[index * 2].sourceKeys.add(`v:${origin.id}`);
      ve[index * 2].sourceKeys.add(`e:${sourceKey}`);

      ve[index * 2 + 1] = cache.getOrCreate(
        `ve_${destination.id}_${sourceKey}`,
        've',
        destination.position.clone().lerp(eArray[index].position, tVe),
        edgeNormal
      );
      ve[index * 2 + 1].sourceKeys.add(`v:${destination.id}`);
      ve[index * 2 + 1].sourceKeys.add(`e:${sourceKey}`);
    }

    arrays.set('ve', ve);
    arrays.set('ve0', ve);
    arrays.set('ve1', ve);
  }

  if (needVf) {
    if (!fVertex) {
      fVertex = cache.getOrCreate(`F_${face.id}`, 'F', face.centroid, faceNormal);
      fVertex.sourceKeys.add(`f:${face.id}`);
      singles.set('F', fVertex);
    }

    const vf = new Array<OVertex>(count);
    for (let index = 0; index < count; index++) {
      const vertex = halfedges[index].prev.vertex;
      const normal = vertex.normal.clone().lerp(faceNormal, tVf);
      if (normal.lengthSq() < 1e-10) {
        normal.copy(faceNormal);
      } else {
        normal.normalize();
      }

      vf[index] = cache.getOrCreate(
        `vf_${face.id}_${vertex.id}`,
        'vf',
        vertex.position.clone().lerp(fVertex.position, tVf),
        normal
      );
      vf[index].sourceKeys.add(`v:${vertex.id}`);
      vf[index].sourceKeys.add(`f:${face.id}`);
    }
    arrays.set('vf', vf);
  }

  if (needFe) {
    if (!fVertex) {
      fVertex = cache.getOrCreate(`F_${face.id}`, 'F', face.centroid, faceNormal);
      fVertex.sourceKeys.add(`f:${face.id}`);
      singles.set('F', fVertex);
    }
    if (!eArray) {
      eArray = computeEdgeArray(face, halfedges, cache);
      arrays.set('E', eArray);
    }

    const fe = new Array<OVertex>(count);
    for (let index = 0; index < count; index++) {
      const halfedge = halfedges[index];
      const sourceKey = edgeKey(halfedge.prev.vertex.id, halfedge.vertex.id);
      const normal = eArray[index].normal.clone().lerp(faceNormal, tFe);
      if (normal.lengthSq() < 1e-10) {
        normal.copy(faceNormal);
      } else {
        normal.normalize();
      }

      fe[index] = cache.getOrCreate(
        `fe_${face.id}_${sourceKey}`,
        'fe',
        fVertex.position.clone().lerp(eArray[index].position, tFe),
        normal
      );
      fe[index].sourceKeys.add(`e:${sourceKey}`);
      fe[index].sourceKeys.add(`f:${face.id}`);
    }
    arrays.set('fe', fe);
  }

  let adjacentFaces: OVertex[] | null = null;
  if (needFAdjacent || needVfAdjacent || needFeAdjacent) {
    adjacentFaces = new Array<OVertex>(count);
    for (let index = 0; index < count; index++) {
      const pairFace = halfedges[index].pair?.face ?? face;
      const operatorVertex = cache.getOrCreate(`F_${pairFace.id}`, 'F!', pairFace.centroid, pairFace.normal);
      operatorVertex.sourceKeys.add(`f:${pairFace.id}`);
      adjacentFaces[index] = operatorVertex;
    }
    arrays.set('F!', adjacentFaces);
  }

  if (needFeAdjacent) {
    if (!eArray) {
      eArray = computeEdgeArray(face, halfedges, cache);
      arrays.set('E', eArray);
    }
    if (!adjacentFaces) {
      throw new Error('Missing adjacent face data for fe!');
    }

    const feAdjacent = new Array<OVertex>(count);
    for (let index = 0; index < count; index++) {
      const halfedge = halfedges[index];
      const pairFace = halfedge.pair?.face ?? face;
      const sourceKey = edgeKey(halfedge.prev.vertex.id, halfedge.vertex.id);
      const normal = eArray[index].normal.clone().lerp(adjacentFaces[index].normal, tFe);
      if (normal.lengthSq() < 1e-10) {
        normal.copy(adjacentFaces[index].normal);
      } else {
        normal.normalize();
      }

      feAdjacent[index] = cache.getOrCreate(
        `fe_${pairFace.id}_${sourceKey}`,
        'fe!',
        adjacentFaces[index].position.clone().lerp(eArray[index].position, tFe),
        normal
      );
      feAdjacent[index].sourceKeys.add(`e:${sourceKey}`);
      feAdjacent[index].sourceKeys.add(`f:${pairFace.id}`);
    }
    arrays.set('fe!', feAdjacent);
  }

  if (needVfAdjacent) {
    if (!adjacentFaces) {
      throw new Error('Missing adjacent face data for vf!');
    }

    const vfAdjacent = new Array<OVertex>(count * 2);
    for (let index = 0; index < count; index++) {
      const pairFace = halfedges[index].pair?.face ?? face;
      const origin = halfedges[index].prev.vertex;
      const destination = halfedges[index].vertex;

      const originNormal = origin.normal.clone().lerp(adjacentFaces[index].normal, tVf);
      if (originNormal.lengthSq() < 1e-10) {
        originNormal.copy(adjacentFaces[index].normal);
      } else {
        originNormal.normalize();
      }

      vfAdjacent[index * 2] = cache.getOrCreate(
        `vf_${pairFace.id}_${origin.id}`,
        'vf!',
        origin.position.clone().lerp(adjacentFaces[index].position, tVf),
        originNormal
      );
      vfAdjacent[index * 2].sourceKeys.add(`v:${origin.id}`);
      vfAdjacent[index * 2].sourceKeys.add(`f:${pairFace.id}`);

      const destinationNormal = destination.normal.clone().lerp(adjacentFaces[index].normal, tVf);
      if (destinationNormal.lengthSq() < 1e-10) {
        destinationNormal.copy(adjacentFaces[index].normal);
      } else {
        destinationNormal.normalize();
      }

      vfAdjacent[index * 2 + 1] = cache.getOrCreate(
        `vf_${pairFace.id}_${destination.id}`,
        'vf!',
        destination.position.clone().lerp(adjacentFaces[index].position, tVf),
        destinationNormal
      );
      vfAdjacent[index * 2 + 1].sourceKeys.add(`v:${destination.id}`);
      vfAdjacent[index * 2 + 1].sourceKeys.add(`f:${pairFace.id}`);
    }
    arrays.set('vf!', vfAdjacent);
  }

  return { singles, arrays };
}

function tryConnections(
  classA: OmniPointClass,
  classB: OmniPointClass,
  singles: Map<string, OVertex>,
  arrays: Map<string, OVertex[]>,
  count: number,
  result: OperatorConnection[]
): boolean {
  const getArray = (key: string): OVertex[] => {
    const values = arrays.get(key);
    if (!values) {
      throw new Error(`Missing Omni point class array '${key}'`);
    }
    return values;
  };

  const getSingle = (key: string): OVertex => {
    const value = singles.get(key);
    if (!value) {
      throw new Error(`Missing Omni point class vertex '${key}'`);
    }
    return value;
  };

  const add = (a: OVertex, b: OVertex, sourceEdgeIndex = -1) => {
    result.push({ a, b, sourceEdgeIndex });
  };

  switch (`${classA}-${classB}`) {
    case 'E-E': {
      const points = getArray('E');
      for (let index = 0; index < count; index++) {
        add(points[index], points[(index + 1) % count], index);
      }
      return true;
    }
    case 'E-F': {
      const edgePoints = getArray('E');
      const facePoint = getSingle('F');
      for (let index = 0; index < count; index++) {
        add(edgePoints[index], facePoint, index);
      }
      return true;
    }
    case 'E-V': {
      const edgePoints = getArray('E');
      const vertexPoints = getArray('V');
      for (let index = 0; index < count; index++) {
        add(edgePoints[index], vertexPoints[index], index);
        add(edgePoints[index], vertexPoints[(index + 1) % count], index);
      }
      return true;
    }
    case 'E-ve':
    case 'E-ve0':
    case 'E-ve1': {
      const edgePoints = getArray('E');
      const vePoints = getArray('ve');
      for (let index = 0; index < count; index++) {
        add(edgePoints[index], vePoints[index * 2], index);
        add(edgePoints[index], vePoints[index * 2 + 1], index);
      }
      return true;
    }
    case 'E-vf': {
      const edgePoints = getArray('E');
      const vfPoints = getArray('vf');
      for (let index = 0; index < count; index++) {
        add(edgePoints[index], vfPoints[index], index);
        add(edgePoints[index], vfPoints[(index + 1) % count], index);
      }
      return true;
    }
    case 'E-fe': {
      const edgePoints = getArray('E');
      const fePoints = getArray('fe');
      for (let index = 0; index < count; index++) {
        add(edgePoints[index], fePoints[index], index);
      }
      return true;
    }
    case 'F-F!': {
      const facePoint = getSingle('F');
      const adjacentFacePoints = getArray('F!');
      for (let index = 0; index < count; index++) {
        add(facePoint, adjacentFacePoints[index], index);
      }
      return true;
    }
    case 'F-V': {
      const facePoint = getSingle('F');
      const vertexPoints = getArray('V');
      for (let index = 0; index < count; index++) {
        add(facePoint, vertexPoints[index]);
      }
      return true;
    }
    case 'F-ve':
    case 'F-ve0':
    case 'F-ve1': {
      const facePoint = getSingle('F');
      const vePoints = getArray('ve');
      for (let index = 0; index < vePoints.length; index++) {
        add(facePoint, vePoints[index]);
      }
      return true;
    }
    case 'F-vf': {
      const facePoint = getSingle('F');
      const vfPoints = getArray('vf');
      for (let index = 0; index < count; index++) {
        add(facePoint, vfPoints[index]);
      }
      return true;
    }
    case 'F-fe': {
      const facePoint = getSingle('F');
      const fePoints = getArray('fe');
      for (let index = 0; index < count; index++) {
        add(facePoint, fePoints[index], index);
      }
      return true;
    }
    case 'V-V': {
      const vertexPoints = getArray('V');
      for (let index = 0; index < count; index++) {
        add(vertexPoints[index], vertexPoints[(index + 1) % count], index);
      }
      return true;
    }
    case 'V-ve':
    case 'V-ve0':
    case 'V-ve1': {
      const vertexPoints = getArray('V');
      const vePoints = getArray('ve');
      for (let index = 0; index < count; index++) {
        add(vertexPoints[index], vePoints[actualMod(index * 2 - 1, count * 2)], actualMod(index - 1, count));
        add(vertexPoints[index], vePoints[index * 2], index);
      }
      return true;
    }
    case 'V-vf': {
      const vertexPoints = getArray('V');
      const vfPoints = getArray('vf');
      for (let index = 0; index < count; index++) {
        add(vertexPoints[index], vfPoints[index]);
      }
      return true;
    }
    case 'fe-V': {
      const fePoints = getArray('fe');
      const vertexPoints = getArray('V');
      for (let index = 0; index < count; index++) {
        add(fePoints[index], vertexPoints[index], index);
        add(fePoints[index], vertexPoints[(index + 1) % count], index);
      }
      return true;
    }
    case 've0-ve0': {
      const vePoints = getArray('ve0');
      for (let index = 0; index < count; index++) {
        add(vePoints[index * 2], vePoints[index * 2 + 1], index);
      }
      return true;
    }
    case 've1-ve1': {
      const vePoints = getArray('ve1');
      for (let index = 0; index < count; index++) {
        add(vePoints[index * 2 + 1], vePoints[(index * 2 + 2) % (count * 2)], index);
      }
      return true;
    }
    case 've-vf':
    case 've0-vf':
    case 've1-vf': {
      const vePoints = getArray('ve');
      const vfPoints = getArray('vf');
      for (let index = 0; index < count; index++) {
        add(vePoints[index * 2], vfPoints[index], index);
        add(vePoints[index * 2 + 1], vfPoints[(index + 1) % count], index);
      }
      return true;
    }
    case 'fe-ve':
    case 'fe-ve0':
    case 'fe-ve1': {
      const fePoints = getArray('fe');
      const vePoints = getArray('ve');
      for (let index = 0; index < count; index++) {
        add(fePoints[index], vePoints[index * 2], index);
        add(fePoints[index], vePoints[index * 2 + 1], index);
      }
      return true;
    }
    case 'vf-vf': {
      const vfPoints = getArray('vf');
      for (let index = 0; index < count; index++) {
        add(vfPoints[index], vfPoints[(index + 1) % count], index);
      }
      return true;
    }
    case 'vf-vf!': {
      const vfPoints = getArray('vf');
      const adjacentVfPoints = getArray('vf!');
      for (let index = 0; index < count; index++) {
        add(vfPoints[index], adjacentVfPoints[index * 2], index);
      }
      return true;
    }
    case 'fe-vf': {
      const fePoints = getArray('fe');
      const vfPoints = getArray('vf');
      for (let index = 0; index < count; index++) {
        add(fePoints[index], vfPoints[index], index);
        add(fePoints[index], vfPoints[(index + 1) % count], index);
      }
      return true;
    }
    case 'fe-fe': {
      const fePoints = getArray('fe');
      for (let index = 0; index < count; index++) {
        add(fePoints[index], fePoints[(index + 1) % count], index);
      }
      return true;
    }
    case 'fe-fe!': {
      const fePoints = getArray('fe');
      const adjacentFePoints = getArray('fe!');
      for (let index = 0; index < count; index++) {
        add(fePoints[index], adjacentFePoints[index], index);
      }
      return true;
    }
    default:
      return false;
  }
}

function addAtomConnections(
  classA: OmniPointClass,
  classB: OmniPointClass,
  sourceEdgeKeys: string[],
  singles: Map<string, OVertex>,
  arrays: Map<string, OVertex[]>,
  count: number,
  edges: OEdge[],
  edgeSeen: Set<string>
) {
  const connections: OperatorConnection[] = [];
  if (!tryConnections(classA, classB, singles, arrays, count, connections)) {
    if (!tryConnections(classB, classA, singles, arrays, count, connections)) {
      throw new Error(`Unknown Omni atom '${classA}-${classB}'`);
    }
  }

  const atom = `${classA}-${classB}`;
  connections.forEach((connection) => {
    if (connection.a.id === connection.b.id) {
      return;
    }

    const key = connection.a.id < connection.b.id
      ? `${connection.a.id}_${connection.b.id}`
      : `${connection.b.id}_${connection.a.id}`;

    if (!edgeSeen.has(key)) {
      edgeSeen.add(key);
      edges.push({
        a: connection.a,
        b: connection.b,
        atom,
        sourceEdgeKey:
          connection.sourceEdgeIndex >= 0 && connection.sourceEdgeIndex < sourceEdgeKeys.length
            ? sourceEdgeKeys[connection.sourceEdgeIndex]
            : null,
      });
    }
  });
}

function sortCCW(outgoing: number[], vertex: OVertex, halfedgeOrigins: OVertex[]) {
  const normal = vertex.normal.clone();
  if (normal.lengthSq() < 1e-10) {
    normal.set(0, 0, 1);
  } else {
    normal.normalize();
  }

  const center = vertex.position;
  const firstDestination = halfedgeOrigins[twin(outgoing[0])].position.clone().sub(center);
  let referenceDirection = firstDestination.sub(normal.clone().multiplyScalar(firstDestination.dot(normal)));
  if (referenceDirection.lengthSq() < 1e-10) {
    const arbitrary = Math.abs(normal.x) < 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
    referenceDirection = new Vector3().crossVectors(normal, arbitrary);
  }
  referenceDirection.normalize();
  const perpendicularDirection = new Vector3().crossVectors(normal, referenceDirection);

  outgoing.sort((a, b) => {
    const directionA = halfedgeOrigins[twin(a)].position.clone().sub(center);
    directionA.sub(normal.clone().multiplyScalar(directionA.dot(normal)));
    const directionB = halfedgeOrigins[twin(b)].position.clone().sub(center);
    directionB.sub(normal.clone().multiplyScalar(directionB.dot(normal)));

    const angleA = Math.atan2(directionA.dot(perpendicularDirection), directionA.dot(referenceDirection));
    const angleB = Math.atan2(directionB.dot(perpendicularDirection), directionB.dot(referenceDirection));

    if (angleA !== angleB) {
      return angleA - angleB;
    }

    const radiusA = directionA.lengthSq();
    const radiusB = directionB.lengthSq();
    if (radiusA !== radiusB) {
      return radiusA - radiusB;
    }

    return a - b;
  });
}

function tryRewriteTwoBundleVfStarOrder(vertex: OVertex, outgoing: number[], edges: OEdge[]): boolean {
  if (vertex.pointClass !== 'vf' || outgoing.length !== 4) {
    return false;
  }

  const bundles = new Map<string, Array<{ halfedge: number; index: number; edge: OEdge }>>();
  outgoing.forEach((halfedge, index) => {
    const edge = edges[Math.floor(halfedge / 2)];
    if (!edge.sourceEdgeKey) {
      return;
    }

    if (!bundles.has(edge.sourceEdgeKey)) {
      bundles.set(edge.sourceEdgeKey, []);
    }
    bundles.get(edge.sourceEdgeKey)?.push({ halfedge, index, edge });
  });

  const orderedBundles = [...bundles.entries()]
    .map(([sourceEdgeKey, items]) => ({
      sourceEdgeKey,
      items: [...items].sort((a, b) => a.index - b.index),
    }))
    .sort((a, b) => a.items[0].index - b.items[0].index);

  if (orderedBundles.length !== 2 || orderedBundles.some((bundle) => bundle.items.length !== 2)) {
    return false;
  }

  const rewritten: number[] = [];
  for (const bundle of orderedBundles) {
    const far = bundle.items.find((item) => item.edge.atom === 'vf-vf');
    const near = bundle.items.find((item) => item.edge.atom === 'fe-vf');
    if (!far || !near) {
      return false;
    }

    rewritten.push(near.halfedge, far.halfedge);
  }

  [rewritten[2], rewritten[3]] = [rewritten[3], rewritten[2]];

  const changed = outgoing.some((value, index) => value !== rewritten[index]);
  if (!changed) {
    return false;
  }

  outgoing.splice(0, outgoing.length, ...rewritten);
  return true;
}

function pruneUniqueLongestPositiveOrientationLoop(
  faceLoops: OVertex[][],
  faceHalfedgeLoops: number[][],
  positiveOrientationIndices: number[]
) {
  if (positiveOrientationIndices.length === 0) {
    return;
  }

  const candidates = [...new Set(positiveOrientationIndices)]
    .filter((index) => index >= 0 && index < faceLoops.length)
    .map((index) => ({ index, length: faceLoops[index].length }));

  if (candidates.length === 0) {
    return;
  }

  const maxLength = Math.max(...candidates.map((candidate) => candidate.length));
  const longest = candidates.filter((candidate) => candidate.length === maxLength);
  if (longest.length !== 1) {
    return;
  }

  const secondLongest = Math.max(
    0,
    ...candidates
      .filter((candidate) => candidate.length < maxLength)
      .map((candidate) => candidate.length)
  );

  if (maxLength <= secondLongest) {
    return;
  }

  faceLoops.splice(longest[0].index, 1);
  faceHalfedgeLoops.splice(longest[0].index, 1);
}

function getLoopAreaScore(loop: OVertex[]): number {
  if (loop.length < 3) {
    return 0;
  }

  const centroid = new Vector3();
  loop.forEach((vertex) => centroid.add(vertex.position));
  centroid.divideScalar(loop.length);

  const areaVector = new Vector3();
  for (let index = 0; index < loop.length; index++) {
    const current = loop[index].position.clone().sub(centroid);
    const next = loop[(index + 1) % loop.length].position.clone().sub(centroid);
    areaVector.add(new Vector3().crossVectors(current, next));
  }

  return areaVector.length();
}

function pruneLargestFaceLoop(faceLoops: OVertex[][], faceHalfedgeLoops: number[][]) {
  if (faceLoops.length <= 1) {
    return;
  }

  let largestIndex = 0;
  let largestArea = -Infinity;
  faceLoops.forEach((loop, index) => {
    const area = getLoopAreaScore(loop);
    if (area > largestArea) {
      largestArea = area;
      largestIndex = index;
    }
  });

  faceLoops.splice(largestIndex, 1);
  faceHalfedgeLoops.splice(largestIndex, 1);
}

function pruneDuplicateSourceSideFaceLoops(
  faceLoops: OVertex[][],
  faceHalfedgeLoops: number[][],
  sourceFaceContexts: Map<number, SourceFaceRoleContext>
) {
  const loopsBySourceFace = new Map<number, Array<{ index: number; area: number }>>();
  faceLoops.forEach((loop, index) => {
    const sourceFaceId = getPrimarySourceFaceId(loop);
    const sourceContext = sourceFaceId === undefined ? undefined : sourceFaceContexts.get(sourceFaceId);
    if (sourceFaceId === undefined || !sourceContext || loop.length !== sourceContext.sideCount) {
      return;
    }

    const entries = loopsBySourceFace.get(sourceFaceId) ?? [];
    entries.push({ index, area: getLoopAreaScore(loop) });
    loopsBySourceFace.set(sourceFaceId, entries);
  });

  const indicesToRemove = new Set<number>();
  loopsBySourceFace.forEach((entries) => {
    if (entries.length <= 1) {
      return;
    }

    const keepIndex = [...entries].sort((a, b) => b.area - a.area || a.index - b.index)[0].index;
    entries.forEach((entry) => {
      if (entry.index !== keepIndex) {
        indicesToRemove.add(entry.index);
      }
    });
  });

  [...indicesToRemove]
    .sort((a, b) => b - a)
    .forEach((index) => {
      faceLoops.splice(index, 1);
      faceHalfedgeLoops.splice(index, 1);
    });
}

function canonicalCyclicSignature(parts: string[]): string {
  if (parts.length === 0) {
    return '';
  }

  const rotations = parts.map((_, index) => [
    ...parts.slice(index),
    ...parts.slice(0, index),
  ].join('|'));
  const reversed = [...parts].reverse();
  rotations.push(...reversed.map((_, index) => [
    ...reversed.slice(index),
    ...reversed.slice(0, index),
  ].join('|')));
  rotations.sort();
  return rotations[0];
}

function getSourceKeysByType(vertex: OVertex, prefix: 'f' | 'e' | 'v'): string[] {
  const keyPrefix = `${prefix}:`;
  return [...vertex.sourceKeys]
    .filter((sourceKey) => sourceKey.startsWith(keyPrefix))
    .map((sourceKey) => sourceKey.slice(keyPrefix.length));
}

function getPrimarySourceFaceId(loop: OVertex[]): number | undefined {
  const candidateFaceCounts = new Map<number, number>();
  loop.forEach((vertex) => {
    getSourceKeysByType(vertex, 'f').forEach((sourceFaceId) => {
      const parsed = Number.parseInt(sourceFaceId, 10);
      if (Number.isFinite(parsed)) {
        candidateFaceCounts.set(parsed, (candidateFaceCounts.get(parsed) ?? 0) + 1);
      }
    });
  });

  return [...candidateFaceCounts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0];
}

function quantizeRoleNumber(value: number, roleGeometryDetail: number): string {
  const precision = Math.min(Math.max(Math.round(roleGeometryDetail), 0), 5);
  const scale = 10 ** precision;
  return (Math.round(value * scale) / scale).toFixed(precision);
}

function getGeometricFaceRoleSignature(
  loop: OVertex[],
  roleGeometryDetail: number,
  roleShapeBasis: RoleShapeBasis
): string {
  if (roleShapeBasis === 'sides') {
    return `${loop.length}`;
  }

  const edgeLengths = loop.map((vertex, index) => (
    vertex.position.distanceTo(loop[(index + 1) % loop.length].position)
  ));
  const meanLength = edgeLengths.reduce((sum, length) => sum + length, 0) / edgeLengths.length;
  const parts = loop.map((vertex, index) => {
    const previous = loop[(index + loop.length - 1) % loop.length].position.clone().sub(vertex.position).normalize();
    const next = loop[(index + 1) % loop.length].position.clone().sub(vertex.position).normalize();
    const angle = previous.angleTo(next);
    if (roleShapeBasis === 'angles') {
      return `a${quantizeRoleNumber(angle, roleGeometryDetail)}`;
    }

    const normalizedLength = meanLength < EPSILON ? 0 : edgeLengths[index] / meanLength;
    return `l${quantizeRoleNumber(normalizedLength, roleGeometryDetail)}:a${quantizeRoleNumber(angle, roleGeometryDetail)}`;
  });

  return `${loop.length}:${canonicalCyclicSignature(parts)}`;
}

function getOmniFaceRoleSignature(
  loop: OVertex[],
  halfedgeLoop: number[],
  edges: OEdge[],
  sourceFaceContexts: Map<number, SourceFaceRoleContext>,
  roleGeometryDetail: number,
  roleShapeBasis: RoleShapeBasis
): string {
  const geometricSignature = getGeometricFaceRoleSignature(loop, roleGeometryDetail, roleShapeBasis);

  const sourceFaceId = getPrimarySourceFaceId(loop);
  const sourceFaceVertexCount = sourceFaceId === undefined
    ? 0
    : loop.filter((vertex) => vertex.sourceKeys.has(`f:${sourceFaceId}`)).length;
  const sourceContext = sourceFaceId === undefined || sourceFaceVertexCount < loop.length
    ? undefined
    : sourceFaceContexts.get(sourceFaceId);
  if (!sourceContext) {
    return `free:${geometricSignature}`;
  }

  // Omni role coloring is based on final n-gon geometry, not source face ids
  // or patch coordinates. Congruent child faces therefore stay congruent in
  // color under rotations/reflections/translations of the input tiling.
  return `face:${sourceContext.sideCount}:${geometricSignature}`;
}

function buildMeshFromEdges(
  edges: OEdge[],
  sourceFaceContexts: Map<number, SourceFaceRoleContext>,
  roleGeometryDetail: number,
  roleShapeBasis: RoleShapeBasis,
  sourceFaceValues?: number[],
  roleBySignature = new Map<string, number>(),
  pruneLargestLoop = false,
  pruneDuplicateSourceSideLoops = false
): Mesh {
  if (edges.length === 0) {
    throw new Error('Omni operator produced no edges');
  }

  const halfedgeCount = edges.length * 2;
  const halfedgeOrigins = new Array<OVertex>(halfedgeCount);
  const halfedgeNext = new Array<number>(halfedgeCount).fill(-1);

  edges.forEach((edge, edgeIndex) => {
    halfedgeOrigins[edgeIndex * 2] = edge.a;
    halfedgeOrigins[edgeIndex * 2 + 1] = edge.b;
  });

  const outgoing = new Map<OVertex, number[]>();
  for (let halfedgeIndex = 0; halfedgeIndex < halfedgeCount; halfedgeIndex++) {
    const origin = halfedgeOrigins[halfedgeIndex];
    if (!outgoing.has(origin)) {
      outgoing.set(origin, []);
    }
    outgoing.get(origin)?.push(halfedgeIndex);
  }

  outgoing.forEach((halfedges, vertex) => {
    if (halfedges.length === 1) {
      halfedgeNext[twin(halfedges[0])] = halfedges[0];
      return;
    }

    sortCCW(halfedges, vertex, halfedgeOrigins);
    tryRewriteTwoBundleVfStarOrder(vertex, halfedges, edges);

    for (let index = 0; index < halfedges.length; index++) {
      halfedgeNext[twin(halfedges[index])] = halfedges[(index + 1) % halfedges.length];
    }
  });

  const visited = new Array<boolean>(halfedgeCount).fill(false);
  const faceLoops: OVertex[][] = [];
  const faceHalfedgeLoops: number[][] = [];
  const positiveOrientationIndices: number[] = [];

  for (let start = 0; start < halfedgeCount; start++) {
    if (visited[start] || halfedgeNext[start] < 0) {
      continue;
    }

    const loop: OVertex[] = [];
    const halfedgeLoop: number[] = [];
    let current = start;
    while (!visited[current]) {
      visited[current] = true;
      loop.push(halfedgeOrigins[current]);
      halfedgeLoop.push(current);
      current = halfedgeNext[current];
      if (current < 0) {
        break;
      }
    }

    if (loop.length < 3) {
      continue;
    }

    const centroid = new Vector3();
    loop.forEach((vertex) => centroid.add(vertex.position));
    centroid.divideScalar(loop.length);

    const faceNormal = new Vector3();
    for (let index = 0; index < loop.length; index++) {
      const currentVector = loop[index].position.clone().sub(centroid);
      const nextVector = loop[(index + 1) % loop.length].position.clone().sub(centroid);
      faceNormal.add(new Vector3().crossVectors(currentVector, nextVector));
    }

    const averageVertexNormal = new Vector3();
    loop.forEach((vertex) => averageVertexNormal.add(vertex.normal));
    const dot = faceNormal.dot(averageVertexNormal);

    if (dot < 0) {
      loop.reverse();
      halfedgeLoop.reverse();
    }

    const faceIndex = faceLoops.length;
    faceLoops.push(loop);
    faceHalfedgeLoops.push(halfedgeLoop);
    if (dot >= 0) {
      positiveOrientationIndices.push(faceIndex);
    }
  }

  if (pruneLargestLoop) {
    pruneLargestFaceLoop(faceLoops, faceHalfedgeLoops);
    if (pruneDuplicateSourceSideLoops) {
      pruneDuplicateSourceSideFaceLoops(faceLoops, faceHalfedgeLoops, sourceFaceContexts);
    }
  } else {
    pruneUniqueLongestPositiveOrientationLoop(faceLoops, faceHalfedgeLoops, positiveOrientationIndices);
  }

  const vertices: number[] = [];
  const vertexIndices = new Map<OVertex, number>();
  const faces: number[][] = [];
  const roleValues: number[] = [];
  const faceValues: number[] = [];

  faceLoops.forEach((loop, faceIndex) => {
    const indices = loop.map((vertex) => {
      const existingIndex = vertexIndices.get(vertex);
      if (existingIndex !== undefined) {
        return existingIndex;
      }

      const nextIndex = vertices.length / 3;
      vertexIndices.set(vertex, nextIndex);
      vertices.push(vertex.position.x, vertex.position.y, vertex.position.z);
      return nextIndex;
    });
    faces.push(indices);

    const signature = getOmniFaceRoleSignature(
      loop,
      faceHalfedgeLoops[faceIndex],
      edges,
      sourceFaceContexts,
      roleGeometryDetail,
      roleShapeBasis,
    );
    const existingRole = roleBySignature.get(signature);
    if (existingRole !== undefined) {
      roleValues.push(existingRole);
    } else {
      const nextRole = roleBySignature.size;
      roleBySignature.set(signature, nextRole);
      roleValues.push(nextRole);
    }

    if (sourceFaceValues) {
      const sourceFaceId = getPrimarySourceFaceId(loop);
      faceValues.push(sourceFaceId === undefined ? 0 : sourceFaceValues[sourceFaceId] ?? 0);
    }
  });

  return { vertices, faces, roleValues, faceValues: sourceFaceValues ? faceValues : undefined };
}

function mergeGeneratedAndPreservedFaces(
  source: Mesh,
  generated: Mesh,
  selectedFaceIds: Set<number>
): Mesh {
  if (selectedFaceIds.size === 0) {
    return cloneMesh(source);
  }
  if (selectedFaceIds.size === source.faces.length) {
    return generated;
  }

  const vertices: number[] = [];
  const vertexByPosition = new Map<string, number>();
  const faces: number[][] = [];
  const roleValues: number[] = [];
  const faceValues: number[] = [];
  const includeRoleValues = Boolean(source.roleValues) || Boolean(generated.roleValues);
  const includeFaceValues = Boolean(source.faceValues) || Boolean(generated.faceValues);

  const getVertexIndex = (sourceVertices: number[], vertexIndex: number) => {
    const offset = vertexIndex * 3;
    const x = sourceVertices[offset];
    const y = sourceVertices[offset + 1];
    const z = sourceVertices[offset + 2];
    const key = `${x},${y},${z}`;
    const existing = vertexByPosition.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const nextIndex = vertices.length / 3;
    vertexByPosition.set(key, nextIndex);
    vertices.push(x, y, z);
    return nextIndex;
  };

  source.faces.forEach((face, faceIndex) => {
    if (selectedFaceIds.has(faceIndex)) {
      return;
    }

    faces.push(face.map((vertexIndex) => getVertexIndex(source.vertices, vertexIndex)));
    if (includeRoleValues) {
      roleValues.push(source.roleValues?.[faceIndex] ?? Math.max(0, face.length - 3));
    }
    if (includeFaceValues) {
      faceValues.push(source.faceValues?.[faceIndex] ?? 0);
    }
  });

  generated.faces.forEach((face, faceIndex) => {
    faces.push(face.map((vertexIndex) => getVertexIndex(generated.vertices, vertexIndex)));
    if (includeRoleValues) {
      roleValues.push(generated.roleValues?.[faceIndex] ?? Math.max(0, face.length - 3));
    }
    if (includeFaceValues) {
      faceValues.push(generated.faceValues?.[faceIndex] ?? 0);
    }
  });

  return {
    vertices,
    faces,
    roleValues: includeRoleValues ? roleValues : undefined,
    faceValues: includeFaceValues ? faceValues : undefined,
  };
}

function mergeGeneratedMeshes(meshes: Mesh[]): Mesh {
  const vertices: number[] = [];
  const vertexByPosition = new Map<string, number>();
  const faces: number[][] = [];
  const roleValues: number[] = [];
  const faceValues: number[] = [];
  const includeRoleValues = meshes.some((mesh) => Boolean(mesh.roleValues));
  const includeFaceValues = meshes.some((mesh) => Boolean(mesh.faceValues));

  const getVertexIndex = (sourceVertices: number[], vertexIndex: number) => {
    const offset = vertexIndex * 3;
    const x = sourceVertices[offset];
    const y = sourceVertices[offset + 1];
    const z = sourceVertices[offset + 2];
    const key = `${x},${y},${z}`;
    const existing = vertexByPosition.get(key);
    if (existing !== undefined) {
      return existing;
    }

    const nextIndex = vertices.length / 3;
    vertexByPosition.set(key, nextIndex);
    vertices.push(x, y, z);
    return nextIndex;
  };

  meshes.forEach((mesh) => {
    mesh.faces.forEach((face, faceIndex) => {
      faces.push(face.map((vertexIndex) => getVertexIndex(mesh.vertices, vertexIndex)));
      if (includeRoleValues) {
        roleValues.push(mesh.roleValues?.[faceIndex] ?? Math.max(0, face.length - 3));
      }
      if (includeFaceValues) {
        faceValues.push(mesh.faceValues?.[faceIndex] ?? 0);
      }
    });
  });

  return {
    vertices,
    faces,
    roleValues: includeRoleValues ? roleValues : undefined,
    faceValues: includeFaceValues ? faceValues : undefined,
  };
}

function buildOperatorEdgesForFace(
  face: SourceFace,
  atoms: Array<[OmniPointClass, OmniPointClass]>,
  classesNeeded: Set<OmniPointClass>,
  cache: OperatorVertexCache,
  tVe: number,
  tVf: number,
  tFe: number
): OEdge[] {
  const halfedges = sourceFaceHalfedges(face);
  const sourceEdgeKeys = halfedges.map((halfedge) => edgeKey(halfedge.prev.vertex.id, halfedge.vertex.id));
  const points = buildFacePoints(
    face,
    halfedges,
    classesNeeded,
    cache,
    tVe,
    tVf,
    tFe
  );
  const edges: OEdge[] = [];
  const edgeSeen = new Set<string>();

  atoms.forEach(([classA, classB]) => {
    addAtomConnections(
      classA,
      classB,
      sourceEdgeKeys,
      points.singles,
      points.arrays,
      halfedges.length,
      edges,
      edgeSeen
    );
  });

  return edges;
}

export function applyOmni(
  mesh: Mesh,
  operatorNotation: string,
  tVe = DEFAULT_OMNI_PARAMS.tVe,
  tVf = DEFAULT_OMNI_PARAMS.tVf,
  tFe = DEFAULT_OMNI_PARAMS.tFe,
  roleGeometryDetail = 3,
  roleShapeBasis: RoleShapeBasis = 'lengths-angles',
  faceFilter?: FaceFilterSpec
): Mesh {
  if (!operatorNotation.trim()) {
    return cloneMesh(mesh);
  }

  let resolvedTVe = tVe;
  let resolvedTVf = tVf;
  let resolvedTFe = tFe;
  if (Math.abs(resolvedTVe - resolvedTVf) < EPSILON) resolvedTVf += EPSILON;
  if (Math.abs(resolvedTVe - resolvedTFe) < EPSILON) resolvedTFe += EPSILON;
  if (Math.abs(resolvedTVf - resolvedTFe) < EPSILON) resolvedTFe += EPSILON;

  const sourceMesh = buildHalfedgeMesh(mesh);
  const sourceFaceContexts = new Map<number, SourceFaceRoleContext>();
  sourceMesh.faces.forEach((face) => {
    const halfedges = sourceFaceHalfedges(face);
    sourceFaceContexts.set(face.id, {
      sideCount: halfedges.length,
    });
  });
  const atoms = parseOperatorNotation(operatorNotation);
  if (atoms.length === 0) {
    return cloneMesh(mesh);
  }
  const supportsFaceFilter = atoms.some(([classA, classB]) => classA === 'V' && classB === 'V')
    && atoms.every(([classA, classB]) => !classA.endsWith('!') && !classB.endsWith('!'));
  const normalizedFaceFilter = normalizeFaceFilter(faceFilter);
  const selectedFaceIds = supportsFaceFilter && normalizedFaceFilter.enabled
    ? new Set(sourceMesh.faces
        .filter((face) => testFaceFilter(mesh, face.id, normalizedFaceFilter))
        .map((face) => face.id))
    : null;
  if (selectedFaceIds && selectedFaceIds.size === 0) {
    return cloneMesh(mesh);
  }
  const shouldApplySelectively = selectedFaceIds !== null && selectedFaceIds.size < sourceMesh.faces.length;

  const classesNeeded = new Set<OmniPointClass>();
  atoms.forEach(([classA, classB]) => {
    classesNeeded.add(classA);
    classesNeeded.add(classB);
  });

  const cache = new OperatorVertexCache();
  const roleBySignature = new Map<string, number>();

  if (shouldApplySelectively) {
    const pruneDuplicateSourceSideLoops = atoms.some(([classA, classB]) => classA === 'fe' && classB === 'fe');
    const generatedPatches = sourceMesh.faces
      .filter((face) => selectedFaceIds.has(face.id))
      .map((face) => buildMeshFromEdges(
        buildOperatorEdgesForFace(
          face,
          atoms,
          classesNeeded,
          cache,
          resolvedTVe,
          resolvedTVf,
          resolvedTFe
        ),
        sourceFaceContexts,
        roleGeometryDetail,
        roleShapeBasis,
        mesh.faceValues,
        roleBySignature,
        true,
        pruneDuplicateSourceSideLoops
      ));
    return mergeGeneratedAndPreservedFaces(mesh, mergeGeneratedMeshes(generatedPatches), selectedFaceIds);
  }

  const edges: OEdge[] = [];
  const edgeSeen = new Set<string>();
  sourceMesh.faces.forEach((face) => {
    const halfedges = sourceFaceHalfedges(face);
    const sourceEdgeKeys = halfedges.map((halfedge) => edgeKey(halfedge.prev.vertex.id, halfedge.vertex.id));
    const points = buildFacePoints(
      face,
      halfedges,
      classesNeeded,
      cache,
      resolvedTVe,
      resolvedTVf,
      resolvedTFe
    );

    atoms.forEach(([classA, classB]) => {
      addAtomConnections(
        classA,
        classB,
        sourceEdgeKeys,
        points.singles,
        points.arrays,
        halfedges.length,
        edges,
        edgeSeen
      );
    });
  });

  return buildMeshFromEdges(
    edges,
    sourceFaceContexts,
    roleGeometryDetail,
    roleShapeBasis,
    mesh.faceValues,
    roleBySignature
  );
}

export function createOperatorSpec(notation: string, overrides: Partial<OperatorSpec> = {}): OperatorSpec {
  return {
    notation,
    tVe: overrides.tVe ?? DEFAULT_OMNI_PARAMS.tVe,
    tVf: overrides.tVf ?? DEFAULT_OMNI_PARAMS.tVf,
    tFe: overrides.tFe ?? DEFAULT_OMNI_PARAMS.tFe,
    faceFilter: overrides.faceFilter ? normalizeFaceFilter(overrides.faceFilter) : undefined,
  };
}

export function resolveOperatorNotation(operator: string): string {
  return OPERATOR_ALIASES[operator] ?? OMNI_PRESETS[operator] ?? operator;
}

export function operatorSupportsFaceFilter(operator: string | OperatorSpec): boolean {
  const notation = typeof operator === 'string' ? operator : operator.notation;
  const atoms = parseAtomList(resolveOperatorNotation(notation));
  return atoms.includes('V-V') && !atoms.some((atom) => atom.includes('!'));
}

export function getOmniParamVisibility(operator: string): OmniParamVisibility {
  const visibility: OmniParamVisibility = {
    showP1: false,
    showP2: false,
    showP3: false,
  };

  parseAtomList(resolveOperatorNotation(operator)).forEach((atom) => {
    const [left, right] = atom.split('-');
    [left, right].forEach((pointClass) => {
      if (pointClass === 've' || pointClass === 've0' || pointClass === 've1') {
        visibility.showP1 = true;
      }
      if (pointClass === 'vf' || pointClass === 'vf!') {
        visibility.showP2 = true;
      }
      if (pointClass === 'fe' || pointClass === 'fe!') {
        visibility.showP3 = true;
      }
    });
  });

  return visibility;
}

export function serializeOperatorSpec(spec: OperatorSpec): string {
  const parts = [
    spec.notation,
    spec.tVe.toString(),
    spec.tVf.toString(),
    spec.tFe.toString(),
  ];
  if (spec.faceFilter) {
    const filter = normalizeFaceFilter(spec.faceFilter);
    parts.push(
      filter.enabled ? '1' : '0',
      filter.property,
      filter.measure,
      filter.negate ? '1' : '0',
      filter.value.toString(),
    );
  }
  return parts.join(OPERATOR_SPEC_DELIMITER);
}

export function parseOperatorSpec(serialized: string): OperatorSpec {
  const parts = serialized.split(OPERATOR_SPEC_DELIMITER);
  if (parts.length !== 4 && parts.length !== 9) {
    return createOperatorSpec(serialized);
  }

  const [notation, tVeRaw, tVfRaw, tFeRaw, filterEnabledRaw, filterPropertyRaw, filterMeasureRaw, filterNegateRaw, filterValueRaw] = parts;
  const tVe = Number.parseFloat(tVeRaw);
  const tVf = Number.parseFloat(tVfRaw);
  const tFe = Number.parseFloat(tFeRaw);
  const filterValue = Number.parseInt(filterValueRaw ?? '', 10);
  const faceFilter = parts.length === 9
    ? normalizeFaceFilter({
        enabled: filterEnabledRaw === '1',
        property: filterPropertyRaw as FaceFilterProperty,
        measure: filterMeasureRaw as FaceFilterMeasure,
        negate: filterNegateRaw === '1',
        value: Number.isFinite(filterValue) ? filterValue : DEFAULT_FACE_FILTER.value,
      })
    : undefined;

  return createOperatorSpec(notation, {
    tVe: Number.isFinite(tVe) ? tVe : DEFAULT_OMNI_PARAMS.tVe,
    tVf: Number.isFinite(tVf) ? tVf : DEFAULT_OMNI_PARAMS.tVf,
    tFe: Number.isFinite(tFe) ? tFe : DEFAULT_OMNI_PARAMS.tFe,
    faceFilter,
  });
}

export function applyOperator(mesh: Mesh, operator: string | OperatorSpec): Mesh {
  if (typeof operator !== 'string') {
    return applyOmni(
      mesh,
      resolveOperatorNotation(operator.notation),
      operator.tVe,
      operator.tVf,
      operator.tFe,
      operator.roleGeometryDetail,
      operator.roleShapeBasis,
      operator.faceFilter
    );
  }

  const presetNotation = OPERATOR_ALIASES[operator] ?? OMNI_PRESETS[operator];
  if (presetNotation) {
    return applyOmni(mesh, presetNotation);
  }

  if (operator.includes('-')) {
    return applyOmni(mesh, operator);
  }

  throw new Error(`Unknown operator '${operator}'`);
}

export function dual(mesh: Mesh): Mesh {
  return applyOmni(mesh, OMNI_PRESETS.Dual);
}

export function kis(mesh: Mesh): Mesh {
  return applyOmni(mesh, OMNI_PRESETS.Kis);
}

export function ambo(mesh: Mesh): Mesh {
  return applyOmni(mesh, OMNI_PRESETS.Ambo);
}

export function truncate(mesh: Mesh): Mesh {
  return applyOmni(mesh, OMNI_PRESETS.Truncate);
}

export function join(mesh: Mesh): Mesh {
  return applyOmni(mesh, OMNI_PRESETS.Join);
}

interface CrossingSegment {
  ax: number; ay: number;
  bx: number; by: number;
  aId: number; bId: number;
}

const CROSS_EPS = 1e-10;
const cross2d = (ax: number, ay: number, bx: number, by: number) => ax * by - ay * bx;

// Proper crossing: two non-incident segments strictly straddle each other.
// Whether this happens depends in general on the parameter values (interior
// points like vf/fe slide as the sliders move), so it is the *contingent*
// part of invalidity. The tolerance matters: collinear but disjoint segments
// produce cross products of ±1e-19 float noise with effectively random
// signs, so a strict sign test would report phantom crossings.
function segmentsHaveProperCrossing(segments: CrossingSegment[]): boolean {
  for (let i = 0; i < segments.length; i++) {
    const s1 = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const s2 = segments[j];
      if (s1.aId === s2.aId || s1.aId === s2.bId || s1.bId === s2.aId || s1.bId === s2.bId) continue;
      const d1 = cross2d(s2.bx - s2.ax, s2.by - s2.ay, s1.ax - s2.ax, s1.ay - s2.ay);
      const d2 = cross2d(s2.bx - s2.ax, s2.by - s2.ay, s1.bx - s2.ax, s1.by - s2.ay);
      const d3 = cross2d(s1.bx - s1.ax, s1.by - s1.ay, s2.ax - s1.ax, s2.ay - s1.ay);
      const d4 = cross2d(s1.bx - s1.ax, s1.by - s1.ay, s2.bx - s1.ax, s2.by - s1.ay);
      if (((d1 > CROSS_EPS && d2 < -CROSS_EPS) || (d1 < -CROSS_EPS && d2 > CROSS_EPS)) &&
          ((d3 > CROSS_EPS && d4 < -CROSS_EPS) || (d3 < -CROSS_EPS && d4 > CROSS_EPS))) {
        return true;
      }
    }
  }
  return false;
}

// Collinear overlap: two edges share a stretch of a common line. This is a
// collinearity fixed by the point-class definitions (e.g. a V-E edge lies on
// the original edge line, as does the V-V edge), so it is parameter-invariant
// — the *structural* part of invalidity. Unlike proper crossings, edges
// sharing an endpoint can still collinearly overlap.
function segmentsHaveCollinearOverlap(segments: CrossingSegment[]): boolean {
  for (let i = 0; i < segments.length; i++) {
    const s1 = segments[i];
    for (let j = i + 1; j < segments.length; j++) {
      const s2 = segments[j];
      const d1 = cross2d(s2.bx - s2.ax, s2.by - s2.ay, s1.ax - s2.ax, s1.ay - s2.ay);
      const d2 = cross2d(s2.bx - s2.ax, s2.by - s2.ay, s1.bx - s2.ax, s1.by - s2.ay);
      const d3 = cross2d(s1.bx - s1.ax, s1.by - s1.ay, s2.ax - s1.ax, s2.ay - s1.ay);
      const d4 = cross2d(s1.bx - s1.ax, s1.by - s1.ay, s2.bx - s1.ax, s2.by - s1.ay);
      if (Math.abs(d1) <= CROSS_EPS && Math.abs(d2) <= CROSS_EPS &&
          Math.abs(d3) <= CROSS_EPS && Math.abs(d4) <= CROSS_EPS) {
        const dx = s1.bx - s1.ax, dy = s1.by - s1.ay;
        const len2 = dx * dx + dy * dy;
        if (len2 < CROSS_EPS) continue;
        const t3 = ((s2.ax - s1.ax) * dx + (s2.ay - s1.ay) * dy) / len2;
        const t4 = ((s2.bx - s1.ax) * dx + (s2.by - s1.ay) * dy) / len2;
        const lo = Math.min(t3, t4), hi = Math.max(t3, t4);
        if (lo < 1 - CROSS_EPS && hi > CROSS_EPS && hi - lo > CROSS_EPS) return true;
      }
    }
  }
  return false;
}

function segmentListHasCrossings(segments: CrossingSegment[]): boolean {
  return segmentsHaveProperCrossing(segments) || segmentsHaveCollinearOverlap(segments);
}

// A T-junction: a vertex lying strictly in the interior of a non-incident
// edge (collinear, 0 < t < 1). Edge-vs-edge tests miss these — a proper
// crossing needs both endpoints straddling, a collinear overlap needs all
// four endpoints collinear — but a vertex sitting on another edge's interior
// is a genuine overlap. E.g. E-E,V-V: every V-V edge runs straight through
// an E (edge-midpoint) vertex. Treated as a crossing/overlap.
function segmentsHaveTJunction(segments: CrossingSegment[]): boolean {
  const verts = new Map<number, [number, number]>();
  for (const s of segments) {
    verts.set(s.aId, [s.ax, s.ay]);
    verts.set(s.bId, [s.bx, s.by]);
  }
  for (const s of segments) {
    const dx = s.bx - s.ax, dy = s.by - s.ay;
    const len2 = dx * dx + dy * dy;
    if (len2 < 1e-12) continue;
    const len = Math.sqrt(len2);
    for (const [id, [px, py]] of verts) {
      if (id === s.aId || id === s.bId) continue;
      const perp = (px - s.ax) * dy - (py - s.ay) * dx;
      if (Math.abs(perp) > 1e-6 * len) continue; // not on the line
      const t = ((px - s.ax) * dx + (py - s.ay) * dy) / len2;
      if (t > 1e-9 && t < 1 - 1e-9) return true; // strictly interior
    }
  }
  return false;
}

// Overlap = collinear edge overlap OR T-junction. Both are collinearity
// facts fixed by the point-class geometry, hence parameter-invariant.
function segmentsHaveOverlap(segments: CrossingSegment[]): boolean {
  return segmentsHaveCollinearOverlap(segments) || segmentsHaveTJunction(segments);
}

export function hasMeshEdgeCrossings(mesh: Mesh): boolean {
  const { vertices, faces } = mesh;

  const edgeSet = new Set<string>();
  const segments: CrossingSegment[] = [];
  for (const face of faces) {
    for (let i = 0; i < face.length; i++) {
      const a = face[i];
      const b = face[(i + 1) % face.length];
      const key = a < b ? `${a},${b}` : `${b},${a}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        segments.push({
          ax: vertices[a * 3], ay: vertices[a * 3 + 1],
          bx: vertices[b * 3], by: vertices[b * 3 + 1],
          aId: a, bId: b,
        });
      }
    }
  }

  return segmentListHasCrossings(segments);
}

// The canonical probe geometry is a 5×5 grid of unit quads. Operators are
// probed on the central face and its ring-1 neighbours: every one of those
// nine faces has a complete set of real neighbours, so F!/vf!/fe! atoms
// resolve to genuine adjacent-face geometry (on an isolated face they
// collapse to own-face equivalents via the `pair?.face ?? face` fallback),
// and edges that only close into loops across faces (e.g. F-V) are present.
const PATCH_SIZE = 5;
const PATCH_PROBE_FACE_IDS = (() => {
  const ids: number[] = [];
  for (let cy = 1; cy <= 3; cy++) {
    for (let cx = 1; cx <= 3; cx++) ids.push(cy * PATCH_SIZE + cx);
  }
  return ids;
})();

function makeCanonicalPatch(): Mesh {
  const vertices: number[] = [];
  for (let y = 0; y <= PATCH_SIZE; y++) {
    for (let x = 0; x <= PATCH_SIZE; x++) {
      vertices.push(x - PATCH_SIZE / 2, y - PATCH_SIZE / 2, 0);
    }
  }
  const v = (x: number, y: number) => y * (PATCH_SIZE + 1) + x;
  const faces: number[][] = [];
  for (let cy = 0; cy < PATCH_SIZE; cy++) {
    for (let cx = 0; cx < PATCH_SIZE; cx++) {
      faces.push([v(cx, cy), v(cx + 1, cy), v(cx + 1, cy + 1), v(cx, cy + 1)]);
    }
  }
  return { vertices, faces };
}

// Builds the operator's defined edge set (the raw atom connections) on the
// canonical patch, as 2D segments. This deliberately bypasses applyOmni/
// buildMeshFromEdges: edge sets that don't close into faces produce an empty
// mesh there, hiding crossings and overlaps that exist among the edges
// themselves — e.g. E-F,F-fe, whose F-fe edges lie inside the E-F edges.
function buildOperatorPatchSegments(notation: string, tVe: number, tVf: number, tFe: number): CrossingSegment[] {
  const atoms = parseOperatorNotation(notation);
  if (atoms.length === 0) return [];

  // Same nudge applyOmni applies: coincident parameter values place point
  // classes on top of each other, which would read as overlaps.
  let resolvedTVe = tVe;
  let resolvedTVf = tVf;
  let resolvedTFe = tFe;
  if (Math.abs(resolvedTVe - resolvedTVf) < EPSILON) resolvedTVf += EPSILON;
  if (Math.abs(resolvedTVe - resolvedTFe) < EPSILON) resolvedTFe += EPSILON;
  if (Math.abs(resolvedTVf - resolvedTFe) < EPSILON) resolvedTFe += EPSILON;

  const classesNeeded = new Set<OmniPointClass>();
  atoms.forEach(([classA, classB]) => {
    classesNeeded.add(classA);
    classesNeeded.add(classB);
  });

  const sourceMesh = buildHalfedgeMesh(makeCanonicalPatch());
  const probeFaces = sourceMesh.faces.filter((face) => PATCH_PROBE_FACE_IDS.includes(face.id));
  const cache = new OperatorVertexCache();
  const segments: CrossingSegment[] = [];
  // The same edge can be generated from two adjacent probe faces (e.g. a
  // vf-vf! edge and its mirror); identical id pairs must be deduped or the
  // duplicate would read as a full collinear overlap of itself.
  const seen = new Set<string>();
  for (const face of probeFaces) {
    const edges = buildOperatorEdgesForFace(
      face, atoms, classesNeeded, cache, resolvedTVe, resolvedTVf, resolvedTFe
    );
    for (const edge of edges) {
      const key = edge.a.id <= edge.b.id ? `${edge.a.id}_${edge.b.id}` : `${edge.b.id}_${edge.a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      segments.push({
        ax: edge.a.position.x, ay: edge.a.position.y,
        bx: edge.b.position.x, by: edge.b.position.y,
        aId: edge.a.id, bId: edge.b.id,
      });
    }
  }
  return segments;
}

export function operatorPatchHasCrossings(notation: string, tVe: number, tVf: number, tFe: number): boolean {
  const segments = buildOperatorPatchSegments(notation, tVe, tVf, tFe);
  return segmentsHaveProperCrossing(segments) || segmentsHaveOverlap(segments);
}

// Overlaps (collinear / T-junctions) are collinearity facts fixed by the
// point-class geometry, so they are present at every parameter value or
// none — no sweep needed. Evaluating at two generic, mutually-distinct
// parameter points reveals exactly the structural overlaps: a real one
// survives both, while a coincidental alignment at one point will not recur
// at the other. This is the "can never be valid" verdict.
const OVERLAP_PROBE_PARAMS: ReadonlyArray<readonly [number, number, number]> = [
  [0.37, 0.53, 0.71],
  [0.61, 0.29, 0.83],
];

export function operatorHasInevitableOverlap(notation: string): boolean {
  if (!notation.trim()) return false;
  try {
    return OVERLAP_PROBE_PARAMS.every(([a, b, c]) =>
      segmentsHaveOverlap(buildOperatorPatchSegments(notation, a, b, c)));
  } catch {
    return false;
  }
}

// Returns true only if no probed parameter combination is free of crossings,
// meaning no slider adjustment can fix it (structural/topological problem).
// Probes the diagonal first (the common clean case exits after one test),
// then a coarse 5×5×5 grid: several curated operators (e.g. the vf-vf!
// family) are only clean away from the diagonal, so diagonal probes alone
// would mislabel them as unfixable.
const cleanParamsCache = new Map<string, [number, number, number] | null>();
const INHERENT_GRID_VALUES = [0.1, 0.3, 0.5, 0.7, 0.9];

// Finds a crossing-free parameter combination, or null when none of the
// probed points is clean. Used both for the inherent-crossing verdict and
// to measure other properties (e.g. coverage) at a parameter point where
// the operator is actually well-formed.
export function findCleanOperatorParams(notation: string): [number, number, number] | null {
  if (!notation.trim()) return null;
  const cached = cleanParamsCache.get(notation);
  if (cached !== undefined) return cached;

  const result = ((): [number, number, number] | null => {
    try {
      for (const t of [0.49, 0.51]) {
        if (!operatorPatchHasCrossings(notation, t, t, t)) return [t, t, t];
      }
      for (const tVe of INHERENT_GRID_VALUES) {
        for (const tVf of INHERENT_GRID_VALUES) {
          for (const tFe of INHERENT_GRID_VALUES) {
            if (!operatorPatchHasCrossings(notation, tVe, tVf, tFe)) return [tVe, tVf, tFe];
          }
        }
      }
      return null;
    } catch {
      // unanalysable → treat as clean at defaults rather than condemn
      return [0.5, 0.5, 0.5];
    }
  })();
  cleanParamsCache.set(notation, result);
  return result;
}

// An operator can never be valid for two distinct reasons:
//   - an inevitable overlap (collinear / T-junction) — a structural
//     collinearity, decided analytically with no parameter sweep;
//   - an inevitable proper crossing — two segments that straddle each other
//     at every parameter value. Unlike overlaps these are NOT all structural
//     (interior points move), so confirming one is unavoidable requires
//     checking that no parameter combination is crossing-free — the sweep.
// Overlaps short-circuit first, so the sweep is only ever reached for the
// crossing question it actually needs to answer.
export function operatorHasInherentCrossings(notation: string): boolean {
  if (!notation.trim()) return false;
  if (operatorHasInevitableOverlap(notation)) return true;
  return findCleanOperatorParams(notation) === null;
}

// Analytical operator validation: measured properties of the notation
// itself, evaluated on the canonical patch — no curated list involved.
// - parses: every atom is in the vocabulary
// - buildsFaces: the edge set closes into faces (cross-face loops included)
// - inherentCrossings: no parameter combination avoids crossed edges
// - unusedAtoms: atoms whose removal leaves the output mesh unchanged
//   (their edges dangle and are discarded by face reconstruction)
export interface OperatorAnalysis {
  parses: boolean;
  buildsFaces: boolean;
  inherentCrossings: boolean;
  unusedAtoms: string[];
  // Total area of output faces clipped to the patch's central cell, as a
  // multiple of the cell area. ≈1 for a proper planar subdivision, >1 for
  // overlapping coverage (e.g. E-E,V-V double-covers: quad + inscribed
  // diamond), <1 for gaps.
  centralCellCoverage: number;
  // Smallest vertex valence among output vertices well inside the patch
  // (boundary-cut artifacts excluded). A proper polyhedral vertex has
  // valence ≥ 3; valence 2 is a "false" vertex that renders identically but
  // carries hidden topology for later operators; valence 1 is a stray
  // dangling vertex. Infinity when no interior vertex exists.
  minVertexValence: number;
}

const operatorAnalysisCache = new Map<string, OperatorAnalysis>();

function meshSignature(mesh: Mesh): string {
  let sideSum = 0;
  for (const face of mesh.faces) sideSum += face.length;
  return `${mesh.vertices.length}|${mesh.faces.length}|${sideSum}`;
}

// Sutherland–Hodgman clip of a polygon against the central cell of the
// canonical patch ([-0.5, 0.5]²), followed by shoelace area.
function areaInCentralCell(points: Array<[number, number]>): number {
  let polygon = points;
  const clipEdges: Array<(p: [number, number]) => number> = [
    (p) => p[0] + 0.5,
    (p) => 0.5 - p[0],
    (p) => p[1] + 0.5,
    (p) => 0.5 - p[1],
  ];
  for (const inside of clipEdges) {
    if (polygon.length === 0) return 0;
    const next: Array<[number, number]> = [];
    for (let i = 0; i < polygon.length; i++) {
      const current = polygon[i];
      const previous = polygon[(i + polygon.length - 1) % polygon.length];
      const currentIn = inside(current) >= 0;
      const previousIn = inside(previous) >= 0;
      if (currentIn !== previousIn) {
        const t = inside(previous) / (inside(previous) - inside(current));
        next.push([
          previous[0] + t * (current[0] - previous[0]),
          previous[1] + t * (current[1] - previous[1]),
        ]);
      }
      if (currentIn) next.push(current);
    }
    polygon = next;
  }
  let doubleArea = 0;
  for (let i = 0; i < polygon.length; i++) {
    const [ax, ay] = polygon[i];
    const [bx, by] = polygon[(i + 1) % polygon.length];
    doubleArea += ax * by - ay * bx;
  }
  return Math.abs(doubleArea) / 2;
}

function meshCentralCellCoverage(mesh: Mesh): number {
  let total = 0;
  for (const face of mesh.faces) {
    const points = face.map((index): [number, number] =>
      [mesh.vertices[index * 3], mesh.vertices[index * 3 + 1]]);
    total += areaInCentralCell(points);
  }
  return total; // cell area is 1
}

// Minimum vertex valence among output vertices well inside the patch
// (|x|,|y| < 1.3), so vertices on the patch's cut boundary — which have
// artificially low valence — are excluded.
function minInteriorVertexValence(mesh: Mesh): number {
  const incident = new Map<number, Set<number>>();
  const touch = (a: number, b: number) => {
    let sa = incident.get(a); if (!sa) { sa = new Set(); incident.set(a, sa); }
    let sb = incident.get(b); if (!sb) { sb = new Set(); incident.set(b, sb); }
    sa.add(b); sb.add(a);
  };
  for (const face of mesh.faces) {
    for (let i = 0; i < face.length; i++) touch(face[i], face[(i + 1) % face.length]);
  }
  let min = Infinity;
  for (const [v, neighbours] of incident) {
    const x = mesh.vertices[v * 3], y = mesh.vertices[v * 3 + 1];
    if (Math.abs(x) >= 1.3 || Math.abs(y) >= 1.3) continue;
    if (neighbours.size < min) min = neighbours.size;
  }
  return min;
}

// Minimum vertex valence measured on the operator's RAW edge graph (the atom
// connections themselves), not on the built face-mesh. buildMeshFromEdges
// drops dangling edges — a vertex with a single incident half-edge forms no
// face (see the length-1 bundle in buildMeshFromEdges) and vanishes from the
// mesh — so a face-mesh count can never report a degree-1 vertex. The classic
// case is an unpaired fe-fe! (or vf-vf!, ve-…) atom whose edge has two
// dangling ends: a real degree-1 (stray) vertex that the face count silently
// rounds up to the valence of whatever surviving vertex sits nearby.
//
// For a well-formed operator every interior vertex is closed by faces, so its
// raw edge degree equals its face valence; this only diverges (downward) when
// an atom leaves a genuinely dangling end. Edges are generated over the full
// 5×5 patch and deduped by vertex-id pair (the same physical edge is emitted
// by both adjacent faces), then degree is counted per vertex over interior
// vertices only (|x|,|y| < 1.3), matching minInteriorVertexValence's cut.
function minInteriorEdgeDegree(notation: string, tVe: number, tVf: number, tFe: number): number {
  const atoms = parseOperatorNotation(notation);
  if (atoms.length === 0) return Infinity;

  let resolvedTVe = tVe;
  let resolvedTVf = tVf;
  let resolvedTFe = tFe;
  if (Math.abs(resolvedTVe - resolvedTVf) < EPSILON) resolvedTVf += EPSILON;
  if (Math.abs(resolvedTVe - resolvedTFe) < EPSILON) resolvedTFe += EPSILON;
  if (Math.abs(resolvedTVf - resolvedTFe) < EPSILON) resolvedTFe += EPSILON;

  const classesNeeded = new Set<OmniPointClass>();
  atoms.forEach(([classA, classB]) => {
    classesNeeded.add(classA);
    classesNeeded.add(classB);
  });

  const sourceMesh = buildHalfedgeMesh(makeCanonicalPatch());
  const cache = new OperatorVertexCache();
  const degree = new Map<number, number>();
  const position = new Map<number, OVertex>();
  const seen = new Set<string>();

  for (const face of sourceMesh.faces) {
    const edges = buildOperatorEdgesForFace(
      face, atoms, classesNeeded, cache, resolvedTVe, resolvedTVf, resolvedTFe
    );
    for (const edge of edges) {
      const key = edge.a.id <= edge.b.id ? `${edge.a.id}_${edge.b.id}` : `${edge.b.id}_${edge.a.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      position.set(edge.a.id, edge.a);
      position.set(edge.b.id, edge.b);
      degree.set(edge.a.id, (degree.get(edge.a.id) ?? 0) + 1);
      degree.set(edge.b.id, (degree.get(edge.b.id) ?? 0) + 1);
    }
  }

  let min = Infinity;
  for (const [id, count] of degree) {
    const vertex = position.get(id);
    if (!vertex) continue;
    if (Math.abs(vertex.position.x) >= 1.3 || Math.abs(vertex.position.y) >= 1.3) continue;
    if (count < min) min = count;
  }
  return min;
}

export function analyzeOperator(notation: string): OperatorAnalysis {
  const cached = operatorAnalysisCache.get(notation);
  if (cached) return cached;

  const analysis: OperatorAnalysis = {
    parses: false,
    buildsFaces: false,
    inherentCrossings: false,
    unusedAtoms: [],
    centralCellCoverage: 0,
    minVertexValence: Infinity,
  };

  let atoms: string[] = [];
  try {
    parseOperatorNotation(notation);
    atoms = [...new Set(parseAtomList(notation))];
    analysis.parses = atoms.length > 0;
  } catch {
    // analysis.parses stays false
  }

  if (analysis.parses) {
    const patch = makeCanonicalPatch();
    try {
      // Measure at a crossing-free parameter point when one exists: at the
      // 0.5 defaults some valid operators (the off-diagonal vf-vf! family)
      // are in a crossing state and would report overlapping coverage.
      const [tVe, tVf, tFe] = findCleanOperatorParams(notation) ?? [0.5, 0.5, 0.5];
      const full = applyOmni(patch, notation, tVe, tVf, tFe);
      analysis.buildsFaces = full.faces.length > 0;
      analysis.centralCellCoverage = meshCentralCellCoverage(full);
      // Take the lower of the face-mesh valence and the raw edge-graph degree:
      // the face count sees false (degree-2) vertices that the edge graph
      // closes, while the edge graph sees dangling (degree-1) vertices that the
      // face count drops. Neither alone is the full picture.
      analysis.minVertexValence = Math.min(
        minInteriorVertexValence(full),
        minInteriorEdgeDegree(notation, tVe, tVf, tFe),
      );
      if (analysis.buildsFaces && atoms.length > 1) {
        const fullSignature = meshSignature(full);
        for (const atom of atoms) {
          const reduced = atoms.filter((a) => a !== atom).join(',');
          try {
            if (meshSignature(applyOmni(patch, reduced, tVe, tVf, tFe)) === fullSignature) {
              analysis.unusedAtoms.push(atom);
            }
          } catch {
            // removal breaks the operator → the atom is load-bearing
          }
        }
      }
    } catch {
      // analysis.buildsFaces stays false
    }
    analysis.inherentCrossings = operatorHasInherentCrossings(notation);
  }

  operatorAnalysisCache.set(notation, analysis);
  return analysis;
}

// Coarse status of an operator, the single source of truth for the UI:
//   empty    — no atoms
//   crossing — edges always cross or overlap (incl. T-junctions / double
//              covers); the one truly invalid geometric state
//   invalid  — unknown atoms or builds nothing
//   degree1  — builds, but has a stray degree-1 (dangling) vertex, e.g. an
//              unpaired fe-fe! whose edge has two loose ends; renders, but is
//              not a finished operator (later atoms can still close it)
//   degree2  — builds cleanly but its lowest vertex valence is 2 (renders,
//              but the 2-valent vertices change topology for later operators)
//   complete — builds cleanly with every vertex valence ≥ 3
export type OperatorStatus = 'empty' | 'crossing' | 'invalid' | 'degree1' | 'degree2' | 'complete';

export function classifyOperator(notation: string): OperatorStatus {
  if (!notation.trim()) return 'empty';
  const a = analyzeOperator(notation);
  if (!a.parses || !a.buildsFaces) return 'invalid';
  if (a.inherentCrossings) return 'crossing';
  if (a.minVertexValence < 1) return 'invalid';
  if (a.minVertexValence === 1) return 'degree1';
  if (a.minVertexValence === 2) return 'degree2';
  return 'complete';
}

// True for finished operators only: every vertex valence ≥ 3, no crossings.
export function isOperatorComplete(notation: string): boolean {
  return classifyOperator(notation) === 'complete';
}

// Rejection-samples random atom sets until one is complete (valence ≥ 3, no
// crossings) and tidy (no dead atoms, no gaps/overlaps). The complete space
// is far larger than the curated whitelist; cost is typically a few hundred
// ms, cached thereafter.
export function generateRandomValidOperator(maxAttempts = 60): string | null {
  const sizeWeights = [1, 2, 2, 3, 3, 3, 4, 4, 5];
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const size = sizeWeights[Math.floor(Math.random() * sizeWeights.length)];
    const pick = new Set<string>();
    while (pick.size < size) {
      pick.add(OMNI_ATOMS[Math.floor(Math.random() * OMNI_ATOMS.length)]);
    }
    const notation = joinAtomList(orderAtoms(pick));
    const a = analyzeOperator(notation);
    if (classifyOperator(notation) === 'complete'
      && a.unusedAtoms.length === 0
      && Math.abs(a.centralCellCoverage - 1) <= 0.01) {
      return notation;
    }
  }
  return null;
}

// For operators whose crossings are trivially fixable by slider restriction,
// returns the valid [min, max] range for each slider — one of the two halves
// of [0, 1] split at 0.5. Operators outside that class (no 0.5 transition,
// or a second geometry-dependent transition inside the candidate half, e.g.
// ve1-ve1,ve-vf,vf-vf which also crosses for tVf < 0.25) are left
// unconstrained; the live crossing warning covers them.
// The returned bounds stop at 0.49/0.51 rather than 0.5 because the
// midpoint itself is the degenerate position where points coincide and
// edges overlap — for a third of restrictable operators t=0.5 is itself
// a crossing configuration.
export function getOperatorParamRanges(notation: string): {
  tVe: [number, number];
  tVf: [number, number];
  tFe: [number, number];
} {
  const full: [number, number] = [0.01, 0.99];
  if (!notation.trim()) {
    return { tVe: full, tVf: full, tFe: full };
  }

  const halfRange = (paramIndex: 0 | 1 | 2): [number, number] => {
    const test = (t: number): boolean => {
      const tVe = paramIndex === 0 ? t : 0.5;
      const tVf = paramIndex === 1 ? t : 0.5;
      const tFe = paramIndex === 2 ? t : 0.5;
      try {
        return !operatorPatchHasCrossings(notation, tVe, tVf, tFe);
      } catch {
        return true;
      }
    };
    const lowerOk = test(0.49), upperOk = test(0.51);
    if (lowerOk === upperOk) return full;
    const candidate: [number, number] = lowerOk ? [0.01, 0.49] : [0.51, 0.99];
    // A clean probe next to the 0.5 boundary doesn't prove the whole half is
    // clean: only restrict once interior probes confirm it.
    const interiorProbes = lowerOk ? [0.05, 0.15, 0.25, 0.4] : [0.6, 0.75, 0.85, 0.95];
    if (!interiorProbes.every(test)) return full;
    return candidate;
  };

  return {
    tVe: halfRange(0),
    tVf: halfRange(1),
    tFe: halfRange(2),
  };
}

// For an always-crossing configuration, returns the atoms whose individual
// removal clears the state — the candidates to remove to fix it. Empty when
// no single removal helps (the crossing comes from a multi-atom interaction).
export function getInherentCrossingCulprits(notation: string): string[] {
  const atoms = parseAtomList(notation);
  if (atoms.length <= 1) return atoms;
  return atoms.filter((_, index) =>
    !operatorHasInherentCrossings(atoms.filter((__, j) => j !== index).join(','))
  );
}

export function ortho(mesh: Mesh): Mesh {
  return applyOmni(mesh, OMNI_PRESETS.Ortho);
}
