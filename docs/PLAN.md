# Cabinet Designer — Plan

## Context

We're building a local-first browser app for hobbyist and small-shop woodworkers. It combines a CabinetPlans.io-style parametric workflow (parameters in, parts/cut sheets out) with a simplified SketchUp-style 3D viewer. CabinetPlans has no 3D view, and SketchUp needs plugins to produce cut lists. This app gives you both, with dimensional accuracy as the #1 requirement.

Repo: `~/Desktop/Andrew/Code/cabinet-designer`, private remote `meccaand/cabinet-designer`. Node 26 (LTS). Decisions are logged in [DECISIONS.md](DECISIONS.md).

## Status

| Milestone           | State                    |
| ------------------- | ------------------------ |
| 1. Foundation       | ✅ Done                  |
| 2. Core engine      | ✅ Done                  |
| 3. 3D viewer        | ✅ Done                  |
| 4. Cabinet editor   | ✅ Done                  |
| 5. Project layout   | ✅ Done                  |
| 6. Outputs          | ✅ Done                  |
| 7. Export & polish  | ✅ Done                  |
| 8. Hardening        | ✅ Done                  |
| 9. L-shaped corners | ✅ Done, awaiting review |
| 10. Style presets   | ✅ Done, awaiting review |
| 11. Runs & datums   | ✅ Done, awaiting review |
| 12. Niche & ends    | Planned                  |
| 13. Run trim        | Planned                  |
| 14. Reference room  | Planned                  |

M10–M14 add **styled built-ins** (spec: [BUILTIN-SPEC.md](BUILTIN-SPEC.md), architecture: ADR-038). A built-in is a set of wall runs of modules sharing one style preset and continuous datums. Each run compiles to ordinary cabinets plus trim, so every existing output keeps working.

| #   | Milestone                   | Scope                                                                                                                                                                                                                     | Acceptance (spec §9) |
| --- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 10  | Style presets               | `StylePreset` (construction overrides + finish); knobs/pulls placed and drawn; shelf nosing; flush plinth; paint colour in 3D; schema v3 (ADR-039). Trim profiles move to M11/M13, where they are used                    | #5                   |
| 11  | Runs & datums               | Built-in + run model; section (base door groups + open bay), stile, tower, pilaster, obstruction; countertop part; linked shelf lines; stiles aligned above/below; symmetric defaults; continuous plinth                  | #2, #3               |
| 12  | Media niche & finished ends | Niche + bridge cubbies (bridge bottom = top shelf line), TV clearance check, recessed-panel end panels following the step-back                                                                                            | —                    |
| 13  | Run trim & corners          | Crown, frieze, base moulding, countertop: continuous, continue/stop at obstructions, miter at inside corners, return at exposed ends; blind dead corner; picture lights; LF + miter/return counts in the BOM, CSV and PDF | #4                   |
| 14  | Reference room & polish     | "Traditional painted built-in" template and quick-add, elevation polish, e2e rebuilding both reference walls in ≤10 actions each, golden cut lists for review                                                             | #1                   |

M9 adds an L-shaped base and L-shaped open shelving for inside corners (ADR-037).

Small changes since M8:

- A new project sets up its room before cabinets are added (ADR-035).
- Any floor cabinet can do without its toe kick; the box then fills the height (ADR-036).

## Scope decisions from your answers

| Topic            | Decision                                                                                                                                              |
| ---------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Toe kick         | A **separate platform base** (ladder: front and back rails plus cross members). The cabinet box sits on it, and side panels are plain rectangles.     |
| Base cabinet top | Configurable per cabinet: **front + back stretchers** (default) or **full top panel**.                                                                |
| Shaker           | Stiles and rails 2¼". Panel ¼" ply in a ¼"-deep groove with 1/16" total clearance. Butt joint. Fronts whose panel would be under 2" become slab (M2). |
| Drawer slides    | **Side-mount ball-bearing** only, with a clearance profile (default ½" per side). Standard lengths 10–28" in 2" steps.                                |
| Edge banding     | Each banding material has a thickness and a "subtract from cut size" flag. The cut list shows cut size; drawings show finished size.                  |
| Nesting          | **Guillotine only, with a numbered cut sequence** (rip strips, then crosscut), for a table saw or track saw.                                          |
| Room             | **90° wall runs (straight, L, U)**. Fillers and end panels are supported.                                                                             |
| Corner cabinets  | **Blind corner base + blind corner wall** in the MVP. L-shaped/lazy-susan and diagonal are deferred.                                                  |

## Architecture

```
cabinet-designer/
  src/core/          pure TS: no React/three/DOM. Own tsconfig (lib: ES2022, no DOM) + ESLint import ban
    units/           Length type, parse ("23 1/4", 23-1/4", 1'2", 590mm, 59cm), format (fraction/metric)
    model/           types, zod schemas, defaults, schemaVersion + migrations
    construction/    conventions/defaults, joinery math (joint → dimension deltas)
    generate/        cabinet → Part[]: carcass, platform, faceFrame, openings, doors, drawers, corner
    hardware/        Part[]/openings → HardwareLine[]
    cutlist/         Part[] → grouped cut list, solid-stock BF/LF, banding LF, cost
    nesting/         Nester interface + guillotine implementation + cut-sequence derivation
    drawing/         2D primitives (line/rect/text/dimension) for elevations & sheet diagrams
    layout/          walls → world transforms, snapping, fillers
    export/          CSV, JSON (pure string builders)
  src/app/
    store/           Zustand + immer; history; derived selectors
    persistence/     ProjectRepository interface + IndexedDB impl (idb)
    viewer/          R3F scene: Project → Cabinet group → Part mesh
    ui/              panels, inputs, views (plain CSS modules, no component lib)
    pdf/             jsPDF renderer for drawing primitives + tables
  e2e/               Playwright
  docs/              PLAN.md, DECISIONS.md
```

**Data flow (all derived data comes from pure functions):**
`Project → (per cabinet, memoized by object identity) generateParts(cabinet, settings, materials) → Part[] → cutList / nest / hardware / cost`. Because immer shares structure between states, editing one cabinet regenerates only that cabinet's parts.

### Core data model (abridged)

```ts
type Mm = number                           // canonical length (alias, ADR-002); quantized to 1e-6 mm
Project { id, name, schemaVersion, units: {system:'imperial'|'metric', fractionDenom:16|32, mmDecimals},
          shop: { kerf, sheetEdgeTrim, boardFootWaste },
          construction: ConstructionDefaults,            // grouped conventions; cabinets override per field
          materials: { sheets: SheetMaterial[], solids: SolidStock[], banding: Banding[], hardware: HardwareItem[] },
          room: { walls: Wall[] },                       // chain; Wall {id, length, height, turn:'left'|'right'}
          cabinets: Cabinet[], fillers: Filler[] }
Cabinet { id, name, type: 'base'|'wall'|'tall'|'drawerBank'|'openShelf'|'blindBase'|'blindWall',
          placement: { wallId, offset, elevation }, w, h, d,
          construction: { style:'frameless'|'faceFrame', joinery:'dado'|'rabbet'|'butt'|'pocket',
                          back:'inset'|'applied'|'dado', top:'stretchers'|'full', doorMount:'overlay'|'inset',
                          materials: Partial<Record<MaterialRole, id>>, overrides… },
          face: OpeningNode, endPanels: {left,right}, blind?: { side, blindWidth, pullFillerWidth } }
OpeningNode = { kind:'split', dir:'h'|'v', children: {size:'auto'|Mm, node}[], divider? }
            | { kind:'leaf', fill:'door'|'doorPair'|'drawer'|'falseFront'|'open', shelves?: {count, adjustable} }
Part { id /* deterministic: cabinetId/role/idx */, cabinetId, role, name, materialId,
       cut: {l,w,t}, finished: {l,w,t}, grain:'length'|'none', edges:{l1,l2,w1,w2: bandingId|null},
       transform: {pos, rot} /* cabinet-local */, joints: JointRef[] }
```

The face is an **opening tree**. Each cabinet type is just a preset tree (e.g. a base cabinet is a drawer over a door pair, and a drawer bank is N drawers), so a single generator path handles every type. Face-frame rails and mullions are generated at split boundaries. Every part is a box with a transform, which keeps the scene graph ready for push/pull editing later without designing that now.

### Key ADRs (full text and later additions in DECISIONS.md)

1. **Single Vite app with `src/core` boundary** instead of a workspace package. A separate tsconfig (no DOM lib) plus an ESLint `no-restricted-imports` rule enforce purity. It can be promoted to a package later.
2. **Canonical mm as a plain float, quantized to 1e-6 mm at generator output.** This makes grouping and equality exact. The formatter snaps to 1/16 or 1/32 and marks off-grid values (`7 15/32″ ≈`) so rounding is never silent.
3. **Undo/redo uses immer snapshots** (cap 200, edits coalesced by transaction key, e.g. while typing). No inverse patches: the project document is small and immer shares structure, so this is simpler and has fewer bug classes than patches.
4. **zod for schemas:** validates imported JSON and IndexedDB loads, and drives migrations.
5. **jsPDF + jspdf-autotable rather than pdf-lib:** jsPDF has drawing primitives (vector sheet diagrams and elevations) and autotable handles cut-list pagination. pdf-lib is aimed at editing existing PDFs and would need hand-built table layout.
6. **Shared 2D drawing primitives** in core, rendered to SVG on screen and to jsPDF in exports, so a diagram and its printed version can't drift apart.
7. **Nester interface** `nest(parts, sheets, opts) → { sheets: {tree: GuillotineNode, placements, yield}[], unplaced, cutSequence }`. The first implementation is a **2-stage guillotine** (rip strips along the sheet's length, then crosscut, plus optional trim cuts). It's multi-start (several sort orders and strip orientations) and keeps the result with the fewest sheets, then the largest offcut. Grain parts never rotate. Kerf is applied at every cut. Parts too large for any sheet are reported, never dropped.
8. **Construction defaults are data** (a `ConstructionDefaults` object per project, overridable per cabinet). Tests run against explicit values.
9. **fast-check** for property tests (dev dependency only).
10. **Persistence** goes through a `ProjectRepository` interface ({list, load, save, delete}) backed by IndexedDB via `idb` (~1 KB), with debounced autosave. A sync backend can implement the same interface later.

**Runtime dependencies (complete list; each is added in the milestone that first uses it):** react, react-dom, three, @react-three/fiber, @react-three/drei, zustand, immer, zod, idb, jspdf, jspdf-autotable. **Dev:** typescript, vite, @vitejs/plugin-react, vitest, @vitest/coverage-v8, fast-check, @playwright/test, eslint + typescript-eslint + react-hooks plugin, prettier.

## Construction conventions (reviewed after M1; exact formulas in [CONSTRUCTION.md](CONSTRUCTION.md))

Every value is editable. Per your quality bar, these are the guesses I'd most like you to correct.

| Item                 | Default                                                                                                                                                                                                                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overall dims         | W = outside of the box (the face frame is flush unless an overhang is set; default overhang 0). D = box + back + face frame, **excluding** doors. Base H **includes** the platform.                                                                                                      |
| Standard sizes       | Base 34½ × 24 D. Wall 30 H × 12 D. Tall 84 H × 24 D.                                                                                                                                                                                                                                     |
| Platform base        | 4" high, 3" setback, ¾" ply rails, cross members ≤ 24" apart. One platform per cabinet in the MVP (merging per run comes later).                                                                                                                                                         |
| Sheet stock          | "¾ ply" with actual thickness **0.709" (18 mm)**, "½ ply" 12 mm, "¼ ply" 5.2 mm. Sheets 48 × 96, grain along the 96". Dados are sized to the actual thickness, not the nominal.                                                                                                          |
| Joinery depths       | Joint depth ¼": top/bottom at the ends of the sides sit in **rabbets**, and panels between the ends (fixed shelves, dividers, raised face-frame bottom) sit in **dados** (decided in M2). Back rabbet ⅜" deep × back thickness. Back groove ⅜" deep, set ¾" from the back edge.          |
| Back styles          | **Inset**: back sits in a rabbet, so back = exterior − 2×(side t − rabbet depth). **Applied**: back covers the full exterior and the carcass depth is reduced by the back thickness. **Dado'd**: back = interior + 2×groove depth.                                                       |
| Stretchers           | 4" wide, front and back, placed the same way as the top panel.                                                                                                                                                                                                                           |
| Frameless doors      | Full overlay. 1/16" reveal at the cabinet edges, ⅛" between doors and drawer fronts. Door top on base cabinets sits ⅛" below the box top.                                                                                                                                                |
| Face frame           | ¾" solid stock, stiles 1½", rails 1½", mullions 2", pocket-screwed (rail = opening width). Carcass bottom raised flush with the top of the bottom rail (M2). Overlay doors ½" overlay. Inset doors 1/16" gap all around. Drawer slides packed out with generated **slide spacers** (M2). |
| Shaker               | Stiles and rails 2¼". Panel ¼" ply in a ¼"-deep groove with 1/16" total clearance. Butt joint.                                                                                                                                                                                           |
| Drawer box           | ½" ply sides, front/back between the sides (butt). ¼" bottom in a groove ½" up with 1/16" total clearance. Box W = mounting width − 1". Box H = opening (clipped to the box interior) − 1", centred. Box length = longest standard slide ≤ interior depth − ½".                          |
| Shelves              | Adjustable: interior W − 1/16", D = interior D − ¼", 4 pins (5 mm) each. Fixed: dado'd, using the joinery setting.                                                                                                                                                                       |
| Hinges               | Concealed 35 mm cup. Count by door height: ≤40" → 2, ≤60" → 3, ≤80" → 4.                                                                                                                                                                                                                 |
| Banding              | Default 0.5 mm veneer, not subtracted. Optional 2 mm PVC, subtracted. Banded edges: exposed front edges of the frameless carcass and shelves, and all 4 edges of slab doors and fronts.                                                                                                  |
| Grain                | Sides, doors, backs, dividers and stiles: vertical. Tops, bottoms, shelves, rails: along the width. Drawer and false fronts: horizontal (M2).                                                                                                                                            |
| Saw                  | Kerf ⅛". Sheet edge trim 0 (an option allows ¼" per factory edge).                                                                                                                                                                                                                       |
| Blind corner         | Blind width = depth of the adjacent cabinet + 1". 3" pull filler. Door covers only the open side. The face frame or a blind panel covers the blind portion.                                                                                                                              |
| Board feet           | Based on rough thickness (4/4 for ¾"), with a 20% waste factor.                                                                                                                                                                                                                          |
| Wall & tall cabinets | Wall: no platform, full top and bottom, 3" hanging rail under the top, fronts with the edge reveal all round. Tall: full top, fixed shelf at the door split (M4).                                                                                                                        |
| Blind corners        | Blind width = meeting run's depth + 1" (25" base, 13" wall). Frameless blind panel in door material, or a wide face-frame stile. 3" pull filler. No drawers (M4).                                                                                                                        |
| Open shelving        | Floor bookcase on the platform, full top, 4 adjustable shelves, 36 × 84 × 12 (M4).                                                                                                                                                                                                       |
| End panels           | Door material, floor to top (toe kick notched), wall to door faces, flush with the fronts (M5).                                                                                                                                                                                          |
| Pulls                | One per door and drawer front; two on drawer fronts wider than 24"; none on false fronts (M2). Pull or knob is a convention; placement rules in CONSTRUCTION.md (M10).                                                                                                                   |

## Milestones

Each milestone ends with app running + tests green + summary + known gaps + **stop for review** + commit(s).

1. **Foundation.** Install Node. Scaffold Vite + React 19 + TS strict, ESLint/Prettier, Vitest, Playwright (one smoke test), and a GitHub Actions CI job (lint, typecheck, test). Build `core/units` (parse/format, every input form, precision 1/16 and 1/32, metric) with exhaustive table tests and round-trip property tests. Write the `core/model` types, zod schemas, the defaults factory, and a schema-version scaffold. The app is an empty shell with its main layout regions. Write PLAN.md and DECISIONS.md.
2. **Core engine.** Generate base cabinet parts for frameless and face-frame, covering every joinery × back × top × door-mount combination, plus the platform, shelves, slab/shaker doors, drawer boxes, and the single-cabinet hardware list. Tests: table-driven expected dimensions for each combination, and property tests for these invariants: parts stay inside the envelope; **no two part volumes overlap except at declared joints, by exactly the joint depth**; widths add up (side + interior + side = W). Also 2–3 **golden reference cabinets** with cut lists I compute by hand **for you to verify**.
3. **3D viewer.** R3F scene for one cabinet: orbit/pan/zoom, front/top/side/iso views (orthographic for the standard ones), clicking a cabinet or part to select and highlight it, exploded view, per-part visibility, x-ray (transparent faces with edges), and an overall dimension overlay.
4. **Cabinet editor + all types.** Parameter panel with unit-aware inputs (fractions or mm), live updates, and wall/tall/drawer bank/open shelving/blind corner base and wall types. A simple opening editor (rows and columns, door/drawer/open, drawer heights), and a 2D front elevation drawn from the drawing primitives.
5. **Project layout.** A wall chain editor for straight, L and U runs, a plan view, and per-wall elevation views. Drag cabinets along a wall with snapping to wall ends and neighbors. Fillers, end panels, duplicate, undo/redo, IndexedDB autosave, a project list, and JSON import/export with validation and migrations.
6. **Outputs.** Cut list grouped by material, the guillotine nester with sheet diagrams, yield %, and numbered cut order, a solid-stock BF/LF and banding LF summary, the hardware list, and a cost estimate. The nester gets a benchmark suite (yield and timing on reference projects).
7. **Export & polish.** PDF shop packet (cover page, cut list, sheet diagrams, cabinet elevations, hardware), CSV, keyboard shortcuts, empty states, and a layout that works for viewing on a tablet.
8. **Hardening.** Playwright flows (create project → add cabinets → cut list → export), a performance pass with 60+ cabinets, basic accessibility, and a README with screenshots.

## Verification (applies to each milestone)

- `npm run lint && npm run typecheck && npm test` (Vitest with coverage thresholds: ≥95% lines on `core/units`, `core/generate` and `core/nesting`), plus `npm run e2e`.
- `npm run dev`, then drive the app with Playwright or the browser to check the milestone's features visually. Screenshots go in the review summary.
- For anything dimensional, the golden fixtures are compared against your hand-checked numbers.
- `docs/PLAN.md` and `docs/DECISIONS.md` are updated, and commits are pushed to the private remote.
