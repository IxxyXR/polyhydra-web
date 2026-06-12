# Edge Crossing Detection — Design Session

Branch: `claude/detect-crossed-edges-1c8ss3`

## Problem statement

The only truly invalid state for an operator is when edges cross. This depends on three things simultaneously: input geometry, operator topology (atom set), and slider parameter values (tVe, tVf, tFe).

## Key conceptual split

Two distinct categories of crossing were identified:

### 1. Inherent crossings (structural/topological)
The atom combination itself guarantees crossed edges regardless of input geometry or slider values. No slider adjustment can fix it.

**Detection:** Test the operator on a single canonical convex quad at t=0.49 and t=0.51 (just either side of the 0.5 midpoint). If both produce crossings, the operator is inherently broken.

Why only 2 samples? Because:
- The valid interval, when one exists, always splits at t=0.5
- A delta of ~0.01 from the default is well below the geometry-dependence threshold for convex polygons
- If either side of 0.5 is clean, sliders can fix it → not inherent

**UI:** Shows an "⚠ Always crossing" badge in the diagram status area alongside "Complete", preset name, etc.

### 2. Parameter-induced crossings (contingent)
Crossings that only appear at specific slider values — the other half of [0,1] is clean. Fixable by adjusting sliders.

**Detection:** Same two-sample test per parameter, but individually (sweep each of tVe, tVf, tFe while holding the others at 0.5).

**UI:** The "adjust sliders to fix" warning is suppressed for inherent cases (since sliders can't help). For contingent cases, the slider `min`/`max` are restricted to the valid half-interval.

## Why n (number of face sides) doesn't matter

Edge crossing is a purely topological/connectivity property. For a convex face, two chords cross iff their endpoints interleave in cyclic order — which has the same combinatorial structure for any n-gon. Testing one representative n is sufficient. A single convex quad (n=4) covers all practical cases.

(n=3 triangles can mask skip-2 connection patterns since every vertex is already adjacent to every other, so n=4 is the safe minimum.)

## Why a single face is sufficient (not a tiling patch)

Atoms using `F!` and `vf!` reference neighbouring face centres, which are undefined on an isolated polygon. However, for the crossing check on the canonical quad, the relevant crossing patterns are all within-face, so neighbours aren't needed. The check is on the operator's local geometry, not its global tiling behaviour.

## The valid interval is always [0.01, 0.5] or [0.5, 0.99]

At t=0.5 the interpolated points are exactly at midpoints — the symmetric/degenerate position where collinear overlaps occur. Moving either side breaks symmetry in one of two ways: either edges separate (valid) or cross (invalid). The transition is sharp and always at t=0.5.

## Collinear overlapping edges

The original `hasMeshEdgeCrossings` used strict-sign cross products, which return false when all four d-values are zero (collinear segments). Added a collinear branch: when all cross products are ≤ EPS, project both segments onto the shared line and check whether their 1D intervals overlap with interior extent (not just touching at an endpoint).

## Implementation summary

### `conway-operators.ts`

**`hasMeshEdgeCrossings(mesh)`** — existing function, extended:
- Added collinear overlap detection (all-zero cross products → project to 1D, check interval overlap)

**`makeCanonicalQuad()`** — private helper:
- Creates a regular convex quad (n=4) centred at origin in the XY plane

**`operatorHasInherentCrossings(notation)`** — new export:
- Tests at t=0.49 and t=0.51 (tVe=tVf=tFe=t)
- Returns true only if both produce crossings

**`getOperatorParamRanges(notation)`** — new export:
- For each of tVe, tVf, tFe independently, tests at t=0.49 and t=0.51
- Returns `[0.01, 0.5]`, `[0.5, 0.99]`, or `[0.01, 0.99]` (unconstrained) per parameter

### `App.tsx`

- `selectedOperatorHasInherentCrossings` — useMemo keyed on operator notation
- `selectedOperatorParamRanges` — useMemo keyed on operator notation; null for inherently-crossing operators
- "⚠ Always crossing" badge in diagram status area
- "Adjust sliders to fix" warning gated on `!selectedOperatorHasInherentCrossings`
- Slider `min`/`max` props driven by `selectedOperatorParamRanges` (falls back to `[0.01, 0.99]` when null)

## Revision: verified class membership (review follow-up)

An exhaustive sweep of `OMNI_VALID_OPERATORS` on the canonical quad
(`sweep-check.mts`) showed the original assumptions held for most but not
all operators: of 89 half-interval restrictions issued, 83 were correct,
6 had a second crossing transition *inside* the chosen half (e.g.
`ve1-ve1,ve-vf,vf-vf` also crosses for tVf < 0.25 because the vf chord
sweeps past the stationary ve1-ve1 segment — a transition whose position
depends on tVe, not on the 0.5 symmetry), and 34 included a t=0.5 endpoint
that is itself a crossing configuration.

Changes:

1. **Membership is verified, not assumed.** After the 0.49/0.51 probes pick
   a candidate half, four interior probes must also be clean before a
   restriction is issued. Operators with a second transition fall back to
   unconstrained — the live crossing warning covers them. The trivially
   fixable class keeps its fast path; membership costs at most ~6 extra
   `applyOmni` calls on a single quad, once per notation change.
2. **Range endpoints are 0.49/0.51, not 0.5.** The midpoint is the
   degenerate position where points coincide; the slider can no longer
   reach it.
3. **Bang-atom notations (`F!`, `vf!`, `fe!`) are not analysed.** On an
   isolated patch `buildFacePoints` falls back to `pair?.face ?? face`, so
   these atoms collapse to their own-face equivalents and any verdict would
   describe a different operator. Both probe functions return their neutral
   result for such notations.
4. **The proper-crossing straddle test uses an epsilon.** Collinear but
   disjoint segments produce cross products of ±1e-19 float noise with
   random signs; the previous strict sign test reported phantom crossings
   (e.g. `E-E,E-fe,F-fe,fe-fe` at t≈0.08/0.22/0.6).
5. **App.tsx memos are keyed on the resolved notation** (single combined
   memo). This also fixes alias-named operators ("Ortho" etc.), whose raw
   notation previously failed to parse inside the probes, silently
   disabling the analysis.

`sweep-check.mts` is the regression check: it must report zero interior,
zero endpoint, and zero inherent-false-positive violations.
