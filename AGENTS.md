# Agent Guide — polyhydra-web

A React + Three.js app for exploring tilings with Omni operators, palettes, and export.
Live at: https://ixxyxr.github.io/polyhydra-web/

## Tech stack

- **Vite + React 18 + TypeScript**
- **Three.js** for 3D rendering (OrbitControls, BufferGeometry, raycasting)
- **Tailwind CSS** for styl/cleaing
- **Framer Motion (`motion/react`)** for animated sidebar and onboarding callouts
- **Lucide React** icons

## Key source files

| File | Role |
|------|------|
| `src/App.tsx` | Root component — all UI state, URL sync, operator stack, onboarding |
| `src/components/TilingCanvas.tsx` | Three.js scene; rebuilds on prop changes; face raycasting & highlight |
| `src/lib/conway-operators.ts` | Omni operator engine: atom definitions, presets, `applyOperator`, `hasMeshEdgeCrossings` |
| `src/lib/tiling-geometries.ts` | Generates `{vertices, faces}` for each uniform tiling type |
| `src/lib/coloring.ts` | Welsh-Powell graph coloring → `computeFaceColors(mesh, palette, colorMode)` |
| `src/lib/palettes.ts` | Named palettes (`PaletteKey`) and their color arrays |
| `src/lib/omni-diagram.ts` | Generates SVG diagram showing point classes and connections for an operator |
| `src/lib/export.ts` | OBJ / OFF / SVG export from mesh data |
| `src/hooks/useDebounce.ts` | Generic trailing debounce hook (intentionally no deps array) |

## Architecture overview

```
App (state)
  ├── Sidebar (operators, palette, export)
  │     ├── Operator list (Reorder drag)
  │     │     └── Selected operator panel
  │     │           ├── Omni diagram SVG
  │     │           ├── Atom grid (click to add/remove connections)
  │     │           └── Sliders (tVe, tVf, tFe)
  │     ├── Palette picker + shuffle
  │     └── Export / Share
  └── TilingCanvas  ← receives debounced props (~33 ms)
```

### Operator system (`conway-operators.ts`)

An **OperatorSpec** has:
- `notation: string` — comma-separated atom list, e.g. `"F-ve,V-ve"`
- `tVe`, `tVf`, `tFe`: `number` — slider positions (0–1) for point placement

**Atoms** connect two point classes (`src-dst`) and are written as `"src-dst"` strings.
Point classes: `V, E, F, F!, ve, ve0, ve1, vf, vf!, fe, fe!`

`applyOperator(mesh, spec)` builds a new `Mesh` from a source mesh.
`hasMeshEdgeCrossings(mesh)` tests a 2×2 sample mesh for self-intersecting edges (O(E²), cheap on small meshes).

Key helpers:
- `parseOperatorSpec` / `serializeOperatorSpec` — OperatorSpec ↔ URL string
- `isValidSubset` / `isCompleteOperator` — validates atom combinations
- `findPresetName` — returns preset label if notation matches a known preset
- `OMNI_PRESETS` — named presets, e.g. `'Ambo'`, `'Dual'`, `'Join-Medial'`, `'Edge-Medial'`

### Tiling types

`UNIFORM_TILINGS` in `tiling-geometries.ts` maps Wythoff symbol strings (e.g. `"4.4.4.4"`) to generators.
Each generator returns `{ vertices: number[], faces: number[][] }`.
The Multigrid tiling (`"multigrid"`) has additional settings via `TilingGenerationOptions.multigrid`.

### Canvas rendering (`TilingCanvas.tsx`)

Props are bundled in `App.tsx` into `liveCanvasProps` and debounced at 33 ms → `canvasProps` before being spread onto `<TilingCanvas>`.

The canvas effect runs whenever any canvas prop changes. It:
1. Clears the `meshGroup`
2. Generates the base tiling mesh
3. Applies each enabled operator in stack order (wrapped in try/catch)
4. Calls `computeFaceColors` and builds Three.js geometry
5. Optionally adds edge `LineSegments` and vertex `Points`
6. Wires mouse-move raycasting for face highlight (outline + diagonals)

### URL state

All significant settings are encoded in `window.location.search`. On mount, params are parsed and state is hydrated. Changes write via `history.pushState` (guarded by `isReady` ref and `isPopStateRef` to avoid loops on back/forward).

### Onboarding

Five sequential steps tracked as boolean state (`step1Complete`–`step5Complete`).
Each step has a callout rendered inside the sidebar via `AnimatePresence`. Steps advance on user interaction:
1. Tiling type selected
2. Preset or random operator added
3. Atom grid or diagram edited
4. Slider moved (only shown when sliders are present)
5. Export/Share section reached (final callout with Finish button)

## Common tasks

**Add a new operator preset**: append to `OMNI_PRESETS` in `conway-operators.ts`.
```ts
'My Preset': 'A-B,C-D',
```

**Add a new tiling**: add an entry to `UNIFORM_TILINGS` in `tiling-geometries.ts` with a `generate(rows, cols, opts?)` function returning `{ vertices, faces }`.

**Add a new palette**: append to `PALETTES` in `palettes.ts` and add the key to the `PaletteKey` type.

**Change debounce timing**: `useDebounce(liveCanvasProps, 33)` in `App.tsx` (geometry) and the `setTimeout(..., 200)` in the crossing-check effect.

## Dev commands

```bash
npm run dev      # start Vite dev server
npm run build    # production build
npm run lint     # TypeScript typecheck
```

Node PATH note (Windows): if running via Bash tool, prepend `export PATH="/c/Program Files/nodejs:$PATH"`.

## Deployment

GitHub Actions workflow at `.github/workflows/deploy-pages.yml` builds with `VITE_BASE_PATH=/polyhydra-web/` and deploys to GitHub Pages on push to `main`.
