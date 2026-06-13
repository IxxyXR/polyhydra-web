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

## Revision 2: analytical validation on a multi-face patch

The probe geometry is now a 5×5 grid of unit quads (central face +
ring-1 neighbours probed; all nine have complete neighbourhoods). This
removed the two structural blind spots of the isolated quad: bang atoms
(F!/vf!/fe!) resolve to real adjacent-face geometry, and cross-face
loops (F-V) are visible. The inherent-crossing check probes the
diagonal then a 5×5×5 parameter grid (several curated vf-vf! operators
are only clean away from the diagonal), with per-notation caching.

`analyzeOperator(notation)` measures validity analytically, replacing
the curated whitelist as the source of truth for what a valid operator
IS (the whitelist remains as a name/preset catalogue):

- parses — vocabulary check
- buildsFaces — edges close into faces on the patch
- inherentCrossings — no parameter combination is crossing-free
- unusedAtoms — removal leaves the mesh unchanged
- centralCellCoverage — output clipped to the central cell ≈1 for a
  proper planar subdivision (catches double covers like E-E,V-V → 3.0
  and zero-area spoke walks like F-fe → 0.0), measured at a clean
  parameter point (findCleanOperatorParams)

All 311 whitelisted operators pass every criterion. The Random button
now rejection-samples the analytical space (~86 ms/click, ~75% of
results are valid operators the whitelist never listed) and sets the
sliders to the operator's clean parameter point.

## Revision 3: matrix green hints from analytical validation

The matrix compatibility colouring no longer consults the curated
whitelist (isCompatibleSubset). Each unselected atom is classified by
analysing selected ∪ {atom} directly:

- green   — the result is a complete, analytically-valid operator
            (isOperatorAnalyticallyValid): clicking finishes a valid op
- red      — the result is always-crossing (operatorHasInherentCrossings)
- neutral — builds something but isn't a finished valid operator, or
            doesn't build; we can't cheaply prove whether it extends to
            valid, so it makes no promise

This replaces the previous binary "subset of a known operator" green.
The semantic shift is deliberate: green now means "valid operator right
now" rather than "on the path to a recognised one", so it lights up less
during early construction and converges as the set fills in. The red
always-crossing tier and culprit highlighting are unchanged; the three
tiers are now computed in one memo (atomCompatibilityTiers), one
analyzeOperator call per atom, memoised per selection and cached
per-notation in the library.

Why not the faithful "extends to a valid operator" semantic: a live
reachability search costs ~260s cold, a precomputed catalogue needs
size-6 enumeration (~10^5 combos), and coverage is not a usable
extendability proxy (142/886 extendable subsets over-cover). Per-dot
validity is the only cheap, catalogue-free option.

Still whitelist-backed (intentionally, as a name/recognition registry,
not a validity gate): the "Complete / Degree N" status badge and preset
name matching.

## Revision 4: complete vs valid via vertex valence

Completeness is now defined by minimum output vertex valence, not coverage:
- valence 1 (stray/dangling vertex) → Invalid (still buildable — later
  atoms can raise it — but not a finished operator)
- valence 2 → "Degree 2": renders identically, but the 2-valent vertices
  are real vertices that change topology for subsequent operators, so
  they are flagged specifically (pulsing amber badge; amber matrix dots)
- valence ≥ 3 → Complete

This matches the curated whitelist exactly (all 311 have min valence ≥ 3,
none have a degree-2 interior vertex) and fixes the earlier coverage-based
mislabel of E-vf / E-V as Complete (they have degree-2 vertices).

Double covers (E-E,V-V) are treated as crossing/overlap via T-junction
detection: a vertex lying strictly interior to a non-incident edge. This
only flags *inevitable* overlaps — it runs inside the parameter-swept
inherent-crossing check, so an operator is 'crossing' only when no
parameter combination is overlap-free. Contingent overlaps leave a clean
point and fall through to slider restriction, exactly like contingent
edge crossings. (Coverage was deliberately not used for invalidity:
coverage>1 is common and transient during construction.)

classifyOperator (empty/crossing/invalid/degree2/complete) is the single
source of truth for the status badge, the matrix dot tiers (green =
completes a complete operator, amber = completes a degree-2 operator, red
= crossing/overlap), and the Random button (generates complete operators
only). The old atom-degree label and isOperatorAnalyticallyValid are gone.

## Revision 5: overlaps determined analytically, not by sweeping

Overlaps (collinear overlaps and T-junctions) are collinearity facts fixed
by the point-class geometry — each atom-edge lies on a fixed supporting
line (the original edge, a V→F or E→F spoke, or the atom's own chord), so
whether another vertex/edge lies on it is parameter-invariant. Deciding
them by the 125-point inherent-crossing sweep was wasteful and slightly
fragile (relied on the grid landing on the exact-collinear config).

operatorHasInevitableOverlap(notation) now decides this with no sweep:
evaluate the operator's edge segments at two generic, distinct parameter
points and check for overlap at both. A structural overlap survives both
(it is present at every parameter value); a coincidental alignment at one
point will not recur at the other. operatorHasInherentCrossings short-
circuits on this before falling back to the sweep.

Proper crossings are NOT all structural — interior points (vf/fe/F) move
with the sliders — so the sweep is retained for them. An audit confirmed
the split is real: across 311 curated + 886 reachable + ~2000 random
combos, the analytical overlap check is a strict subset of the swept
verdict (zero cases where it flagged something the sweep missed), and
~15% of random combos are inherent via a proper crossing with no overlap
(e.g. E-E,F-ve,ve-vf) — these genuinely need the sweep. So overlaps are
analytical; the sweep now only answers the crossing question it must.

Segment tests split into segmentsHaveProperCrossing (contingent) and
segmentsHaveCollinearOverlap + segmentsHaveTJunction (structural);
segmentListHasCrossings and operatorPatchHasCrossings are unchanged in
behavior. Slider-range sweep regression unchanged (180 issued, 0 violations).

## Revision 6: degree-1 detection via the raw edge graph

minInteriorVertexValence counts incident edges per vertex on the *built
face-mesh*. buildMeshFromEdges drops dangling edges — a vertex with a single
incident half-edge forms a degenerate <3 loop and is discarded — so the face
count can never observe a degree-1 vertex; it silently reports the valence of
whatever surviving vertex sits nearby. Concretely F-ve,fe-fe!,ve1-ve1 has fe
points wired only through an unpaired fe-fe! (its edge has two loose ends),
yet the patch face-count read 4 and mislabelled it Complete.

analyzeOperator now also computes minInteriorEdgeDegree: it generates the
operator's raw atom edges over the full 5×5 patch, dedupes by vertex-id pair,
and counts degree per interior vertex (|x|,|y| < 1.3, same cut). minVertexValence
is the min of the two — the face count still catches degree-2 false vertices
the edge graph closes; the edge graph catches degree-1 danglers the face count
drops. For a well-formed operator the two agree, so the 311-operator whitelist
is undisturbed (still all Complete).

classifyOperator gains a 'degree1' tier between invalid and degree2 (valence 1,
builds but unfinished — a later atom can still close it); the status badge shows
a pulsing red "Degree 1". The Random generator is unaffected (it already
required Complete).
