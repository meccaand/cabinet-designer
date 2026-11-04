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

**Status:** Accepted (implemented in M5)

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

**Status:** Accepted (implemented in M5)

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

## ADR-019: Cabinet types are traits plus a preset face

**Status:** Accepted (M4)

Every type goes through the same generator. A small `TYPE_TRAITS` table says what differs:

- platform or not
- counter top rules (stretchers allowed, `revealTopBase`) or a full top
- hanging rail
- blind corner

A preset sets the default size and face tree. Adding a type is a table row plus a preset, not a
new generator. A drawer base is a base with a drawer preset.

Fixed shelves at row splits reuse the opening tree's `divider` flag. On a top-level column split
it means a vertical divider; on a top-level row split it means a fixed shelf. These shelves
split the interior into levels, so drawers and shelves stay within theirs.

## ADR-020: Openings are edited on the front elevation

**Status:** Accepted (M4)

The opening tree is edited by clicking cells in a 2D front elevation (core drawing primitives
rendered to SVG, ADR-006), not as an abstract tree. A selected opening offers:

- its fill
- hinge side
- shelves
- its size or "auto"
- split into rows or columns
- remove

Splitting in the same direction as the parent adds siblings rather than nesting. Pure tree
operations live in `core/model/face.ts` and are unit-tested. The elevation's right-hand chain
dimensions the same sizes the tree stores: front heights (frameless) or opening heights (face
frame).

## ADR-021: Length inputs commit only what was typed

**Status:** Accepted (M4)

`LengthInput` shows the stored value formatted (with ≈ when off-grid). It commits on Enter or
blur, but only if the text changed, so tabbing through a field showing "≈29 1/16″" never replaces
the exact value with its rounding. Escape reverts. Errors are announced inline (`role="alert"`,
`aria-invalid`). Any form `parseLength` accepts works regardless of project units.

## ADR-022: Effects must not return values

**Status:** Accepted (M4)

A one-line arrow effect `useEffect(() => el?.scrollTo(0, 0), …)` crashed cabinet switching.
Current Chrome's `scrollTo` returns a Promise, which React then calls as a cleanup function
("destroy is not a function"). Effects are written with block bodies. The editor end-to-end
tests caught it.

## ADR-023: Room layout is a wall chain; positions are along walls

**Status:** Accepted (M5)

Walls form a chain at 90° turns. Walking along it, cabinets are on the right, so right turns are
inside corners. A placement is (wall, offset along the wall, height off the floor), and the
world transform is derived. Plan geometry stays axis-aligned, so footprints, overlap checks and
snapping are simple rectangle maths in `core/layout`, unit-tested without a browser.

Moving items is one-dimensional along the wall, by dragging in the plan or the elevation. A
drag previews locally and commits once on release, so a drag is one undo step. Snapping covers
wall ends, neighbours at overlapping heights, and the run on the adjoining wall at an inside
corner. Changing an item's wall is done in the editor.

## ADR-024: Autosave to IndexedDB; JSON for backup and transfer

**Status:** Accepted (M5)

- **Saving:** each edit is saved 400 ms after it happens through `ProjectRepository`
  (`IndexedDbRepository`; `MemoryRepository` for tests or when IndexedDB is missing).
- **Startup:** the last-opened project id is a per-browser convenience in `localStorage`. The
  app reopens that project, or the most recently saved one, or on first run creates and saves the
  sample.
- **Bad data:** stored data that doesn't validate (e.g. a newer format) is reported, not opened.
- **Export/import:** export writes the project JSON as is. Import validates and migrates through
  `loadProject`, and gets a new id if it would overwrite an existing project.
- **History:** undo history is per session and resets on reload or project switch.

## ADR-025: End panels are generated parts; fillers are room items

**Status:** Accepted (M5)

An end panel belongs to its cabinet (`cabinet.endPanels`), so it's generated with the cabinet's
parts, checked by the same invariants, and moves with the cabinet. A filler belongs to the room:
it sits between cabinets or against a wall and has its own position and size. A filler becomes
a single part (`fillerPart`) for the 3D view and, in M6, the cut list.

The toe-kick notch on end panels is a structured `notch` on the part (not text with baked-in
units), so the UI and the cut list can show it in project units.
