# Decision log

Lightweight ADRs. Each entry: context → decision → consequences. Newest at the bottom.
Status values: **Accepted**, **Superseded by ADR-n**.

---

## ADR-001: `src/core` is a pure-TS boundary inside one Vite app

**Status:** Accepted (M1)

**Context.** Part generation, joinery math and nesting are the heart of the app and must be
heavily tested and portable. A separate workspace package would enforce that, but adds build
and tooling overhead for one consumer.

**Decision.** Keep a single Vite app. `src/core` is enforced as framework-free by:

- `tsconfig.core.json`: `lib: ["ES2023"]`, `types: []`, so DOM and Node globals don't typecheck.
- ESLint `no-restricted-imports` on `src/core/**`: React, three, R3F, zustand, immer, idb, jspdf
  and anything under `src/app` are errors.
- Core has no randomness or clock. Callers pass in ids and timestamps.

**Consequences.** Core tests can't use `structuredClone` etc.; they use plain JS. Promoting core
to its own package later is a move, not a rewrite.

## ADR-002: Lengths are millimetres as plain numbers, quantized to 1 nm

**Status:** Accepted (M1)

**Context.** Fractional inches don't survive binary floats exactly. Grouping identical parts in a
cut list needs exact equality, and the cut list must never round silently.

**Decision.**

- Every domain length is mm, typed `Mm = number`. The plan proposed a branded type; it was
  dropped because arithmetic on brands returns `number` and forces re-wrapping on nearly every
  line of generator code. Inches never exist inside the domain, so the brand bought little. Inch
  constants are written as `inch(3 / 4)`.
- `quantize()` snaps to 1 nm (1e-6 mm). Every 1/16, 1/32 and 1/64 inch is an exact integer
  number of nm (1/64" = 396,875 nm).
- The formatter rounds on the integer-nm value (so half-steps round the same way every time) and
  reports `exact`. Off-grid values display with a `≈` prefix, e.g. 18 mm plywood → `≈23/32"`.
- The parser rejects spaces around a fraction slash (`23 /4` is ambiguous) and fractions with
  metric units (`1/2 mm`).

## ADR-003: Undo/redo via immer snapshots

**Status:** Accepted (planned for M5)

Snapshots of the whole project with structural sharing, capped at 200, coalesced by transaction
key (e.g. while typing in a field). Simpler than inverse patches and has fewer bug classes; the
document is small.

## ADR-004: zod schemas are the source of truth for the data model

**Status:** Accepted (M1)

TS types are `z.infer`'d from the schemas, so types and validation can't drift. Imported files
and IndexedDB records go through `loadProject()`, which upgrades through migrations and then
validates. Cross-references (material roles, wall ids, duplicate ids) are checked in a project
level `superRefine`. The recursive opening tree needs a hand-written `OpeningSplit` interface
because zod can't infer recursive types.

## ADR-005: jsPDF + jspdf-autotable for the PDF shop packet

**Status:** Accepted (planned for M7)

jsPDF has vector drawing primitives (sheet diagrams, elevations) and autotable handles cut-list
pagination. pdf-lib targets editing existing PDFs and would need hand-built table layout.

## ADR-006: Shared 2D drawing primitives

**Status:** Accepted (planned for M4/M6)

Elevations and sheet diagrams are produced in core as primitives (line, rect, text, dimension)
and rendered to SVG on screen and to jsPDF for print, so screen and paper can't drift apart.

## ADR-007: Nester behind an interface; first implementation is 2-stage guillotine

**Status:** Accepted (planned for M6)

Rip strips along the sheet length, then crosscut, with optional trim cuts. Multi-start over sort
orders and strip orientations; keep the fewest sheets, then the largest offcut. Grain parts never
rotate; kerf at every cut; parts too large for any sheet are reported, never dropped. Output
includes a numbered cut sequence for table-saw or track-saw use.

## ADR-008: Construction conventions are data, overridable per cabinet

**Status:** Accepted (M1)

`project.construction` holds grouped conventions (carcass, platform, fronts, faceFrame, shaker,
drawer, shelves, hardware, materials). A cabinet stores only the fields it overrides, and
`resolveConstruction()` merges per field. Changing a project default therefore updates every
cabinet that hasn't overridden it. The default values are the assumptions listed in PLAN.md
"Construction conventions", pending review. The default style is **frameless**.

## ADR-009: fast-check for property-based tests

**Status:** Accepted (M1)

Used for round-trip properties in units now, and for the M2 part-generation invariants
(envelope, no overlap except at declared joints, width sums).

## ADR-010: Persistence behind `ProjectRepository`, IndexedDB via `idb`

**Status:** Accepted (planned for M5)

Interface `{ list, load, save, delete }` with debounced autosave. A sync backend can implement the
same interface later.

## ADR-011: Toolchain versions; schema version stays 1 until first release

**Status:** Accepted (M1)

- **TypeScript is pinned to ~6.0.** TS 7 (the native port) is current, but typescript-eslint
  supports `<6.1`. Revisit when typescript-eslint supports TS 7.
- Node 26 LTS (`.nvmrc`), Vite 8, Vitest 5, React 19, zod 4, ESLint 10.
- Dependencies are installed in the milestone that first uses them (three/R3F in M3, zustand/
  immer/idb in M5, jspdf in M7), so no dependency sits unused.
- `npm audit` reports moderate advisories in the ESLint dev toolchain only (minimatch via
  typescript-estree). These are not shipped to the browser; recheck on upgrades.
- The project schema is still settling during M2–M5. No saved projects exist yet, so changes
  stay at `schemaVersion: 1` without migrations until the first release. After that, every
  breaking change bumps the version and adds a migration (the scaffold is in place and tested).

## ADR-012: Parts are axis-aligned boxes in cabinet coordinates

**Status:** Accepted (M2)

**Context.** The plan sketched parts as `{position, rotation}` transforms. Every MVP cabinet part,
blind corners included, is a rectangular board aligned with the cabinet's axes.

**Decision.** A part stores `bounds` (an axis-aligned box: x left → right, y up, z back → front)
plus which axis is its length (grain) and which is its thickness. Finished sizes are _read from
the bounds_, so the 3D model and the cut list can't disagree. Cabinets get a transform when
placed in a room (M5). Angled parts (diagonal corners, deferred) would add an optional rotation.

`box()` does not reorder reversed ranges. A calculation that yields x1 < x0 produces a
negative extent, which the part builder rejects, instead of being silently "fixed".

## ADR-013: Joints are declared, and undeclared overlaps are bugs

**Status:** Accepted (M2)

Each part's bounds include the portion inside a neighbour's dado, rabbet or groove. The generator
records each such joint (host, guest, axis, depth). The shared test invariant checks every pair
of parts:

- Any overlap must be a declared joint, overlapping by exactly its depth along its axis.
- Every declared joint must actually overlap.

This one check covers the joinery math for all 192 construction combinations, 400 random
cabinets per run, and the golden cabinets.

## ADR-014: Opening sizes are front sizes (frameless) and opening sizes (face frame)

**Status:** Accepted (M2)

Woodworkers specify frameless drawers by front height ("a 6-inch top drawer") and face-frame
cabinets by opening size, so the face tree's `size` means whichever is natural for the style.
`createBaseCabinet` converts the preset's 6" top drawer accordingly (5" opening + ½" overlay
each side).

## ADR-015: M2 scope limits, enforced with clear errors

**Status:** Accepted (M2)

- Only `base` cabinets generate. Other types return an error until M4.
- Dividers are only allowed between top-level columns. A divider below a full-width drawer
  needs a support decision (fixed shelf, web frame), which is deferred.
- Side-by-side drawers need a divider (frameless). In face-frame cabinets they return an error
  for now, because slides need a centre support or rear brackets.
- End panels are not generated yet (a warning is returned). They come with room layout in M5.

## ADR-016: Viewer state is separate from the project document

**Status:** Accepted (M3)

Selection, camera view, exploded/x-ray/dimension toggles and hidden parts live in their own
zustand store (`viewerStore`). They are never saved and never undone. The project document gets
its own store (`projectStore`), which gains editing, undo/redo and persistence in M4–M5.

Interaction follows SketchUp's group model. The first click selects the cabinet, a click inside
the selected cabinet picks the part, and clicking empty space clears the selection. Standard
views (front, top, side) are orthographic so they read as true elevations. Iso is perspective.

## ADR-017: Dimension labels are a DOM overlay positioned every frame

**Status:** Accepted (M3)

drei's `<Html>` creates one React root per label. Under React 19 it intermittently failed to
mount the first label. Labels are now plain DOM elements over the canvas, and the scene moves
them to their line's projected midpoint in `useFrame`. This is the documented R3F pattern for
per-frame DOM writes; the React Compiler lint rule is disabled for that block, with a comment.
A label is hidden when its line is seen end-on (shorter than 40 px on screen), e.g. depth in the
front view.

## ADR-018: three.js is loaded lazily; React pinned to 19.3.x

**Status:** Accepted (M3)

The 3D view is a lazy chunk (≈966 kB minified / 257 kB gzip). The app shell (≈351 kB / 108 kB)
renders first, then shows "Loading 3D view…". React is pinned to `~19.3` because
@react-three/fiber 9 declares `react <19.4`.
