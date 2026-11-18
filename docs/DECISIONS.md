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

**Status:** Accepted (implemented in M5; coalescing by key added in M7, see ADR-031)

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

**Status:** Accepted (implemented in M7; see ADR-028)

jsPDF has vector drawing primitives (sheet diagrams, elevations) and autotable handles cut-list
pagination. pdf-lib targets editing existing PDFs and would need hand-built table layout.

## ADR-006: Shared 2D drawing primitives

**Status:** Accepted (elevations M4–M5, sheet diagrams moved into core in M7, see ADR-029)

Elevations and sheet diagrams are produced in core as primitives (line, rect, text, dimension)
and rendered to SVG on screen and to jsPDF for print, so screen and paper can't drift apart.

## ADR-007: Nester behind an interface; first implementation is 2-stage guillotine

**Status:** Superseded in part by ADR-026 (three stages instead of two)

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

**Status:** Accepted (implemented in M5; coalescing by key added in M7, see ADR-031)

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
- (Superseded in part by ADR-036: the schema is now at version 2, with migrations.) The project
  schema is still settling during M2–M5. No saved projects exist yet, so changes
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

## ADR-026: Three-stage guillotine nesting with a wide multi-start

**Status:** Accepted (M6)

The two-stage strip packer (ADR-007) wasted most of a sheet whenever a short part sat in a tall
strip. On a 14-cabinet kitchen the 1/4" backs took 6 sheets where a hand layout needs 5.

The nester now cuts each strip into sections, each holding parts stacked across the strip. That
is still guillotine: every cut is straight through, so it suits a table saw or track saw. It
tries both strip directions with 6 sort orders and 12 seeded shuffles of the area order, and
keeps the fewest sheets, then the largest leftover on the last sheet. The result is
deterministic.

On the benchmark kitchen:

| Material | Sheets | Floor                | Note                    |
| -------- | ------ | -------------------- | ----------------------- |
| 3/4"     | 14     | 13 (area bound 12.4) |                         |
| 1/2"     | 2      |                      |                         |
| 1/4"     | 5      |                      | matches the hand layout |

Nesting takes about 40 ms in total, fast enough to rerun on every edit. The test suite checks
on random inputs that layouts have no overlaps, keep kerf gaps, respect grain, have no cut
through a part, and account for every part. It also guards these sheet counts against
regressions.

## ADR-027: Outputs are derived live; the library is edited in the app

**Status:** Accepted (M6)

The cut list, sheet layouts and estimate are pure functions of the project
(`buildCutList` → `nestCutList` → `estimate`), recomputed when the project changes and never
stored. They get their own main-area views (Cut list, Sheets, Materials & cost), and a summary
strip shows part count, sheets per material and the total.

The material library, shop settings and project default materials are edited in Materials &
cost. A material can't be removed while a default or any cabinet still uses it. Prices are
assumed to be in dollars. Banding is stored per metre and shown per foot in imperial projects.

## ADR-028: The shop packet is built in the browser from the live outputs

**Status:** Accepted (M7)

The PDF is made client-side with jsPDF and autotable from the same cut list, nests, estimate
and core drawings the screen shows (`src/app/pdf/shopPacket.ts`). jsPDF is loaded only when you
export, so it stays out of the main bundle. The packet contains:

- a cover with the summary, units, kerf and trim, and a contents list with page numbers
- one elevation page per wall that has something on it
- cabinets, two to a page, with type, size, construction and front elevation
- the cut list by material, with headers repeated on each page and rows that never split
- one page per sheet: the diagram, plus its numbered cuts in shop language
- the shopping list and estimate

Every page has a footer with the project name, date and "Page n of N".

**Page size.** Pages are landscape: Letter for inch projects, A4 for metric ones.

**Fonts.** The standard PDF fonts cover only Windows-1252, so `≈` (rounded) prints as `~`. The
cover explains this, and the CSV keeps the exact decimals. Embedding a Unicode font would add
about 300 KB for one character.

**Tests.** They read the text drawn on every page from jsPDF's content streams. They check the
contents page numbers, every cut list row and its sizes, every numbered cut, the footers, A4
for metric projects, and empty and unbuildable projects. A human check renders the PDF to PNG.

## ADR-029: Sheet diagrams and shop text live in core

**Status:** Accepted (M7)

The sheet diagram moved from an SVG component into `core/drawing/sheet.ts`, so the PDF draws
exactly what the screen shows. This added the following to the primitives:

- fills for sheet, trim, part and offcut
- a `cut` line style
- per-text `size`, plus `onFill` for labels that stay dark on a filled shape
- a `badge` (a numbered circle)

Shop-language text is now in `core/report`, shared by the screen, PDF and CSV:

- thickness at 1/32"
- banding in words
- notes and notch
- cut steps
- money
- shopping-list lines

## ADR-030: CSV exports for spreadsheets and cut optimizers

**Status:** Accepted (M7)

There are two CSVs: the cut list (one line per row) and the shopping list (one line per item,
plus a total). Both are RFC 4180 with CRLF line endings. The download adds a UTF-8 byte-order
mark so Excel reads `≈` and `×`.

**Sizes.** Each size appears twice: as shop text (`30 1/2"`) for reading, and as a plain
decimal in the project's unit (inches to 4 places, mm to 2) for other tools.

**Formula injection.** Cabinet and material names are typed by the user. So any text cell that
starts with `=`, `+`, `-`, `@`, a tab or a CR gets an apostrophe prefix, which stops a
spreadsheet from running it as a formula.

## ADR-031: One shortcut table drives the keys and the help

**Status:** Accepted (M7)

`src/app/shortcuts.ts` lists each shortcut with the keys shown in the help, a matcher and an
action. The key handler and the help dialog (`?`) both read it.

**When shortcuts don't apply.**

- They pause while focus is in a field or a dialog, so fields keep their own undo and
  arrow keys.
- Editing keys (arrows, ⌘D, Delete) only work in 3D, plan and elevation, so in the cut list
  the arrow keys still scroll and Delete can't remove a cabinet unseen.
- Camera keys only work in 3D.

**Nudge steps.** Arrows move the selected filler or the active cabinet by 1/16" (1 mm), or by
1" (10 mm) with Shift.

**Undo.** A run of nudges on one item is a single undo step. This is the coalescing ADR-003
planned: an edit with a key merges with the previous edit if that edit had the same key and
nothing else happened in between.

## ADR-032: Side panels become drawers on tablets

**Status:** Accepted (M7)

The layout depends on screen width:

| Width                            | Layout                                                                   |
| -------------------------------- | ------------------------------------------------------------------------ |
| 1200 px and up                   | Three columns                                                            |
| Below 1200 px (tablet landscape) | The cabinet list becomes a drawer from the left, opened by "☰ Cabinets" |
| Below 900 px (tablet portrait)   | The properties panel also becomes a drawer from the right ("Properties") |
| Below 600 px (phones)            | The header wraps                                                         |

**How the drawers work.**

- Drawers are pure CSS keyed on one `drawer` state. When they aren't drawers, that state does
  nothing.
- A backdrop, Esc or Close dismisses a drawer. Picking a cabinet closes the list drawer.
- An opened drawer takes the focus.
- A closed drawer is `visibility: hidden`, so it's out of the tab order.

**Touch.** Coarse pointers get 40 px targets on the header, tabs and 3D toolbar.

The Playwright tests check an 820 × 1180 touch viewport, where no view scrolls sideways.

## ADR-033: Performance with large projects

**Status:** Accepted (M8)

The benchmark is a 64-cabinet, four-wall kitchen (`src/core/__tests__/bigKitchen.ts`) with
about 1,130 parts. Measured on an M1 with the GPU:

| Step                         | Time                                              |
| ---------------------------- | ------------------------------------------------- |
| Generate all cabinets        | 5 ms                                              |
| Cut list                     | 10 ms                                             |
| Nesting (38 + 6 + 15 sheets) | about 200 ms in Node, about 100 ms in the browser |
| Estimate                     | 1 ms                                              |
| 3D room view                 | 60 fps while orbiting                             |

Before this milestone, every edit blocked the page while the sheets were laid out again. That
included moving a cabinet, so five arrow-key nudges took 570 ms. Three changes fixed it:

1. **Nesting is cached by its exact inputs.** `cachingNester` is an LRU of 24 entries, keyed by
   the parts, sheet and options. Moves, renames and price changes don't touch any part, so they
   never re-nest. Five nudges went from 570 ms to 78 ms, with no long tasks.
2. **Outputs follow a deferred project** (`useDeferredValue`). The editor and model repaint
   first, so a width edit reaches the screen in 16–32 ms, and the ~100 ms layout pass runs
   after the paint. A Web Worker would take that pass off the main thread entirely. It isn't
   worth the async state and stale-layout handling at this size.
3. **3D parts share their geometry.** They share one unit box and its outline, and drei's
   `Edges` (one outline geometry per part) is gone. Parts subscribe to booleans ("am I
   selected"), so selecting re-renders only the parts it changes. Opening the room view went
   from 291 ms of long tasks to 59 ms.

4. **The 3D view draws on demand** (`frameloop="demand"`), not 60 times a second. The camera,
   prop changes and animation steps ask for frames, so an idle room costs no CPU or battery.
   This matters on tablets, and in CI, where WebGL is software-rendered.

The 3D chunk is still 260 KB compressed. It is almost all three.js, because React Three Fiber
v9 registers the whole three.js namespace. It loads after the app shell, so first paint
doesn't wait for it.

Guards:

- A core test runs the whole pipeline on the 64-cabinet kitchen, with a generous time budget
  and yield within 15% of the area floor.
- A cache test checks that a move reuses every layout.
- A Playwright test imports the big kitchen, opens the room view, then nudges ten times (timed,
  in plan) and resizes a cabinet.

## ADR-034: Accessibility baseline

**Status:** Accepted (M8)

Every view and dialog passes axe (WCAG 2.1 AA plus best practices) in light and dark mode,
checked in Playwright. The fixes:

- **Contrast.** The accent darkened to `#a65a17`. Text on the accent uses an `--on-accent`
  token (white in light mode, near-black in dark), and error text uses a `--danger` token that
  lightens in dark mode.
- **Roles.**
  - Drawings with clickable parts (the front elevation, plan, wall elevation) are labelled
    groups, not images.
  - The 3D canvas is a labelled image. Its content is also reachable from the cabinet list and
    the Parts tab.
  - The app name is the page's `h1`.
- **Keyboard.**
  - Cabinets on the plan and wall elevation are focusable buttons: Enter or Space selects one,
    and the arrow shortcuts move it (ADR-031).
  - Scrollable output regions are focusable.
  - Drawers move focus in when they open.

Dragging stays mouse and touch only. The keyboard alternatives are the arrow keys and the
"From wall start" field.

## ADR-035: A new project sets up its room first

**Status:** Accepted (after M8, at Andrew's request)

A new project used to start with one 10' wall and a "No cabinets yet" panel in place of the
3D view. Now it starts with **no walls**, and the 3D view shows the grid beside two first
steps:

1. **Set up the room.** Pick a straight, L or U run, then enter each wall's length and the
   wall height. Walls meet at inside corners. The grid previews the walls as they are entered.
   "Create room" adds them as one undo step.
2. **Add a first cabinet.** The same starter buttons as before, beside the room.

Until the room exists, cabinets can't be added. The sidebar's "Add a cabinet" picker is
disabled, and the plan and elevation tabs show step 1 too.

- **"No room yet" is "no walls".** There is no separate flag in the model. The schema already
  allowed an empty wall list, so there is no migration. Undoing "Create room" brings step 1
  back. Every existing project, and the sample, already has walls, so they open as before.
- **Only the UI's "New project" starts empty.** `createProject` in core still adds a default
  wall, because tests and the sample build on it.
- **Starting values.** The fields start at 120", 96" and 96" walls, 96" high (3000, 2400 and
  2400 mm, 2400 mm high in metric), so "Create room" is one click for someone who just wants to
  try the app.

## ADR-036: Toe kicks can be turned off; the box then fills the height

**Status:** Accepted (after M8, at Andrew's request). Schema version 2.

Each floor cabinet (base, drawer base, blind base, tall, open shelving) has a "Stands on a toe
kick" switch, under Toe kick in its settings. It is a per-cabinet override of a new convention,
`platform.enabled`, which defaults to on.

**Convention, chosen by Andrew.** Without a toe kick, the box grows to the floor. The Height
field stays the overall height, so a 34 1/2" base becomes a 34 1/2" box with 34 1/2" sides. It
is not a 30 1/2" box raised on a separate base. Following from that:

- **Fronts.** Frameless overlay fronts stop `revealEdge` above the box bottom, as on wall
  cabinets, rather than flush with it. Face-frame and inset fronts are unchanged: they follow
  the frame or the opening.
- **End panels** have no toe-kick notch. **Fillers** made with "Fill gap" start at the floor.

**Schema version 2.** Projects already saved in browsers lack the flag. This is the first real
migration: version 1 → 2 adds `enabled: true` to the project's toe-kick conventions, so every
existing cabinet keeps its toe kick. Schema validation now pins `schemaVersion` to the current
version. This supersedes the "stays at 1 until the first release" note in ADR-011: the app is
in use, so breaking changes now migrate.

The property tests now turn the toe kick on and off at random. A unit test checks a
no-toe-kick base by hand: 34 1/2" sides, the bottom at the floor, fronts at the edge reveal, a
full-height end panel with no notch, and every floor type without platform parts.

## ADR-037: L-shaped base and L-shaped open shelving

**Status:** Accepted (M9, at Andrew's request)

Two new types fill an inside corner: an **L-shaped base** and **L-shaped open shelving**. The
shelving stands on the floor, is 84" tall by default and has no doors. Andrew chose the
construction:

- **Two-piece L panels.** The bottom, top and shelves are two rectangles butted at the corner,
  not one notched piece. Every part stays a rectangle, so the cut list, sheet layouts, 3D view
  and overlap checks need no new geometry.
- **A bi-fold pair** on the base.
- **Frameless and face frame**, like every other type.

**Model.**

- **Shape.** `width` and `depth` are the run, along the cabinet's wall. A new `corner`
  (`returnWidth`, `returnDepth`) is the return, along the next wall. Both widths are measured
  into the corner. Schema validation requires `corner` exactly on the L types. No migration is
  needed: existing projects can't contain the new types.
- **Face.** A single leaf: `door` means the bi-fold pair, or `open`. Shelves are fixed only, and
  splits and drawers are rejected: drawers would collide in the corner. The opening editor
  shows only what applies.

**Generator.** The return is built by the same code as the run, in its own coordinates (along
its wall from its outer end, and out from the wall). A quarter-turn frame on `BuildContext`
maps those coordinates into the cabinet's, and prefixes the return's part ids and names. The
door, toe-kick ladder and end-panel builders are reused unchanged. The run owns the corner
square, and the return's pieces butt against it. Exact formulas and two golden cut lists to
verify are in CONSTRUCTION.md.

**Choices made without asking (please check):**

- **The corner is held by the backs.** There is no corner post or cleat; the backs and the
  two-piece panels meet there. With 1/4" backs, a cleat or a thicker back may be wanted.
- **The run's door is the one hinged to the cabinet.** It has no pull, and the return's door
  carries the pull near its free end.
- **Frameless overlay doors.** The run's door stops door thickness + `revealBetween` short of
  the return's door face. The return's door runs to the run's face plane.
- **Frameless inset is rejected,** because there is no post for the doors to close against.
- **Face frame.** The run's corner stile is wider by the frame thickness, and the return's frame
  butts against its face. The overlay doors must clear each other: `stileWidth` ≥ overlay +
  door thickness.
- **Default sizes.** The base is 36 × 34½ × 24 with a 36 × 24 return. The shelving is 30 × 84 ×
  12 with a 30 × 12 return. A face must be at least 6" wide.

**Layout.**

- **Placement.** An L-shaped cabinet always sits in the corner at the end of its wall, so its
  offset is derived from the wall length (`placedOffset`). It can't be dragged or nudged.
- **The return item.** `layoutItems` adds a return item on the next wall, so neighbours,
  snapping, gaps and the next wall's elevation all see it. The run and the return don't count
  as overlapping each other, and a neighbour that hits both is reported once.
- **No inside corner.** If the wall doesn't end in an inside corner, a layout problem says so.
- **Adding cabinets.** A new L cabinet goes to the active cabinet's wall if that wall turns into
  an inside corner, or else to the first wall that does. A cabinet added after an L continues
  along its return's wall.

**Views.**

- **Plan.** The plan draws an L.
- **Front elevation.** It shows the run and the return side by side.
- **3D.** A single L cabinet is viewed from the front-left (iso and side), where its fronts
  face.

**Tests.**

- **Golden cut lists:** G7 (frameless) and G8 (face frame).
- **Every combination:** all 192 constructions × both types, with and without end panels,
  through the invariants. The invariants now know the L envelope.
- **Property tests:** random L cabinets with random returns and the toe kick on or off.
- **Layout, store, PDF and Playwright** tests for the flow.

## ADR-038: Styled built-ins are runs of modules compiled to ordinary cabinets

**Status:** Accepted (planning for M10–M14, at Andrew's request). Spec: [BUILTIN-SPEC.md](BUILTIN-SPEC.md).

**Context.** A furniture-style built-in is not one cabinet. It is an assembly of simple boxes
held together by a shared style (door, paint, hardware, mouldings) and by horizontal datums
(plinth, countertop, shelf lines, frieze, crown) that run across every module on a wall and
around corners.

**Decision.**

- **Model.** The project gains `stylePresets` and `builtIns`. A built-in references a preset
  and owns one **run** per wall. A run is an ordered list of modules (section, tower, stile,
  pilaster, obstruction, later media niche) plus its datums: countertop height, linked shelf
  lines, and the frieze/crown line measured down from the ceiling. Modules hold widths and
  choices only; heights and depths come from the run and the preset.
- **Compile, don't fork.** A pure `core` function turns each run into ordinary `Cabinet`s
  plus run-level trim parts. The generator, invariants, cut list, nesting, 3D view and PDF
  keep working unchanged. Compiled cabinets are derived, not stored, so the datums can't drift.
- **Style preset** = a `ConstructionDefaults` overlay (face frame, Shaker, inset/overlay, stile
  widths) plus appearance (paint colour, sheen), hardware (knob type, size, placement), shelf
  nosing, and trim profiles. Swapping the preset restyles every module.
- **Schema v3.** Additive; the migration only adds empty `stylePresets`/`builtIns`.

**Construction, chosen by Andrew.**

- **Separate boxes.** Each upper bay is its own box standing on the base's countertop. A tower
  is a base box plus an upper box sharing one applied finished end panel.
- **Bought mouldings.** Crown and base cap appear in the shopping list as linear feet with
  miter and return counts. The flat frieze board and the plinth face are cut-list parts.
- **Countertop:** 3/4" ply with a solid edge strip on the front and exposed ends, so it reads
  1" thick. The ply nests on sheets; the strip is solid stock.
- **Plinth:** the existing ladder platform with setback 0, with the base moulding applied over
  its face. (M11: one ladder per box, side by side, chosen by Andrew; see ADR-040.)

**Choices to be made without asking unless Andrew objects (please check):**

- **Shelf nosing:** a 3/4" ply shelf with a 1 1/2" tall solid strip glued to the front edge.
- **Inset door pairs** close against each other with the inset gap between them. There is no
  mullion or astragal.
- **Stile widths:** 2 1/2" between upper bays and between base door groups, 2 1/4" elsewhere.
- **Knobs:** one per door; on a pair, both on the meeting stiles, 2 3/4" down from the top.

## ADR-039: Style presets are construction overrides plus a finish

**Status:** Accepted (M10). Schema version 3.

**Model.** A `StylePreset` is `{ id, name, construction: ConstructionOverrides, finish }`. A
cabinet follows one through an optional `styleId`. Its conventions are resolved in three layers,
each per field: project defaults, then the style's overrides, then the cabinet's own
(`cabinetConstruction`). Every reader of a cabinet's conventions goes through that function: the
generator, the editor, the inspector, the PDF and the store. Editing a preset regenerates every
cabinet that follows it, because the model cache is also keyed on the style object.

A preset is _only_ overrides, so anything a preset sets can also be set per cabinet, and a
cabinet's own setting wins. The editor says how many settings a cabinet overrides and offers
"Use the style's settings" to clear them. A template is a starting point that the project
copies. Templates: **Traditional painted built-in** (face frame, inset Shaker, 2 1/4" stiles and
rails with 2 1/2" mullions, a 4 1/2" flush plinth, 1 1/2" shelf nosing, 1 1/8" knobs 2 3/4" from
the top, gray-green satin paint) and **Blank**.

**New conventions,** so a preset or a cabinet can set them:

- `hardware.handle` (pull or knob), `knobDiameter`, `pullLength`, `handleFromEnd` and
  `handleFromEdge`. The hardware list buys whichever handle the cabinet uses. Knobs are a new
  hardware kind with a library item.
- `shelves.nosingHeight`: a solid strip on the front of open shelves (0 = none).

**Handles are drawn, not cut.** `CabinetModel.handles` holds each pull or knob as a small box on
its front's face, with the id of the front part. It is counted by the same rule as the hardware
list (`handlesPerFront`), and a test checks that the number drawn equals the number bought for
every type. The 3D view draws them in the style's hardware colour and moves them with their
front when exploded. Elevations, on screen and in the PDF, draw knobs as circles and pulls as
bars (a new `circle` primitive and a `hardware` fill).

**Finish.** Paint and stain colour every part in 3D, the plinth included; drawer boxes stay bare
wood. Sheen sets the surface roughness. Elevations keep their neutral fills, because they are
shop drawings.

**Migration 2 → 3** adds an empty `stylePresets` list, the handle settings as pulls (5" pull,
1 1/4" knob, 2 3/4" from the end, 1 1/4" from the edge), `nosingHeight: 0`, and a knob to the
hardware library. These values are written into the migration rather than read from the
defaults, so a later change to the defaults can't alter old files. Existing projects build the
same parts as before; they now also show their pulls.

**Choices made without asking (please check):**

- **Nosing material** is the face-frame stock (3/4" poplar), not a separate material role.
- **Nosing only on open shelves.** Behind doors it would hit the hinges and isn't seen.
- **Handle height:** doors centred more than 48" off the floor take the handle near the bottom.
  A single full-height door therefore gets it near the top, which is wrong for an 84" pantry
  door. A "handle at a fixed height" option can come later.
- **Inset gap** is kept at the project's 1/16" all round, so the gap between the doors of a
  pair is 1/8". The spec's 1/8" reveal is read as that gap between doors.
- **Trim fields** (countertop, frieze, crown, picture lights) are left out of the preset until
  M11/M13, where they are first used, so they aren't designed before they're needed.

## ADR-040: Built-in runs: modules, datums and split stiles

**Status:** Accepted (M11). Schema version 4. Spec: [BUILTIN-SPEC.md](BUILTIN-SPEC.md) §2–§5.

**Model.** `project.builtIns`: a built-in has a style (face frame required), a `topGap` (ceiling
to the top of the uppers: one line round the room, leaving room for the frieze and crown) and
runs. A run has a wall, `offset`, `length`, the datums `countertopHeight`, `baseDepth`,
`upperDepth`, `countertopOverhang`, `countertopEdge` and `shelves` (the linked shelf count),
what each end meets (a wall or the room), and modules: **section**, **stile**, **pilaster** and
**obstruction**. A tower is a section (the "Tower" template adds a finished left end), so towers
and media-wall bays share one code path.

**Compiled, never stored** (ADR-038). `compileBuiltIn` turns a built-in into ordinary cabinets
(a base box and an upper box per section), fillers (pilasters), obstructions and a run
**assembly** of parts that belong to no box: the countertop. `expandProject` adds them to the
project, and every view and output uses that as-built project: 3D, plan, elevations, cut list,
nesting, estimate and the shop packet. The JSON export stays the stored project. The app caches
the compile per built-in (`app/expand.ts`), so unchanged built-ins keep their compiled cabinets
and those cabinets keep their cached parts.

**Datums are the run's.** Box heights, the upper elevation and the countertop all follow
`countertopHeight` (acceptance #2). Upper bays with `shelves: null` follow the run's count, and
identical boxes put their shelves on identical lines (acceptance #3). A section's base and upper
boxes have the same width and stiles, so the stiles line up. 'auto' widths share the run's
length equally, so the bays either side of a fixed centre section mirror each other.

**Construction, chosen by Andrew:**

- **Split stiles.** Where two boxes meet, each carries half the visible stile and the frames
  are screwed together; an end box carries a whole end stile, for scribing. A cabinet's
  `stiles: {left, right}` (new, optional) sets its outer stile widths; the generator checks a
  stile still covers the box side.
- **Fixed, dadoed shelves** in the upper bays.
- **Countertop** in the fewest sheet-length pieces, seams over box joints (the reference media
  wall's joints at 34 1/2" and 103 1/2" make that 3 pieces, not 2: nothing lies between 42" and
  96").
- **One plinth per box** (the existing ladder, no recess).

**Choices made without asking (please check):**

- **A section's width is its clear opening** between its stiles (the spec's "bay width"). Stile
  modules are separate, so the reference media wall reads 3 + 30 + 3 + 66 + 3 + 30 + 3 = 138".
- **End panels sit outside the box width,** like other cabinets' end panels; on a run start that
  meets the room, give the run an offset for them.
- **The countertop's sheet and strip use the `carcass` and `faceFrame` materials** rather than
  new material roles.
- **The countertop's front edge is 3/4" past the face frames by default** (the spec says 1/2–
  3/4"). It can't be less than the strip's thickness, or the strip would hit the face frame.
- **Uppers are built like wall cabinets:** full top and bottom and a hanging rail. The bottom
  rests on the countertop.
- **A built-in's boxes can't be dragged one by one.** Picking one opens the built-in at that
  module. A run moves by its offset.

**Not yet (later milestones or gaps):** inside corners are left to the user's run offsets (the
media wall starts 19" out); M13 adds the blind corner and mitred trim. Obstructions aren't drawn
in plan. Shelf heights can't be set individually yet, only counts. The media niche is M12.

## ADR-041: Media niche, dividers within a level, and framed end panels

**Status:** Accepted (M12). Schema version 5.

**Media niche (one upper box, chosen by Andrew).** A section's upper can be a `mediaNiche`
(`cubbies`, `bridgeLine`, `tvSize`). It compiles to the same upper box as an open bay, with the
face split by a fixed shelf into a bridge of cubbies over the TV opening. The box back is the
niche back. The bridge shelf's top is the top of the flanking bays' shelf on the chosen line
(spec rule 4). Rather than repeating the generator's shelf-spacing maths, the compiler builds a
probe open bay of the same size and reads its shelf tops, so the two can't drift apart. The TV
check (16:9, 1" all round) is a warning, not an error: the built-in still builds. Adding the
upper kind needed no migration (old files can't contain it). The new "TV section" template is
two door pairs under a niche for a 65" TV with two cubbies.

**Dividers within a level.** The cubbies need dividers that run only between the bridge shelf
and the top. The generator now allows a column split with `divider` directly inside a top-level
row split with fixed shelves (until now, dividers were top-level only). Each one is housed in the
shelf or top above and below it, and narrows the bay that shelves and drawers in its columns
use. Dividers nested anywhere else are still rejected.

**Framed end panels (a flat panel plus an applied frame, chosen by Andrew).** A new convention
group `endPanel` (`style` flat or framed, `frameWidth`, `frameThickness`) works per project, per
style and per cabinet. Framed adds four strips over the panel's outside face, so the field reads
as recessed. A built-in's base and upper boxes each get their own panel and frame, so the ends
follow the step-back. The traditional style template now uses framed ends. Migration 4 → 5 adds
`endPanel` (flat) to stored projects.

**Choices made without asking (please check):**

- **Frame strips:** 1/4" thick, planed or resawn from the face-frame stock (poplar), butt-joined,
  glued and pinned. The invariants allow these strips to be thinner than their stock, as they do
  for slide spacers.
- **The frame starts above a toe-kick notch,** so on a recessed toe kick the back stile is
  shortened too. The traditional style's flush plinth has no notch.
- **The bridge shelf isn't nosed:** the face-frame rail covers its front edge.
- **TV clearance** is fixed at 1" all round; it isn't a setting yet.

## ADR-042: Run trim, picture lights and inside corners between runs

**Status:** Accepted (M13). Schema version 6. Spec §3, §6, §8.

**Trim belongs to the run, never to a box.** The run assembly (ADR-040) now holds, besides the
countertop:

- **Frieze boards** (cut parts) and **corner fillers** (cut parts).
- **Crown and base moulding:** bought by length, as `MouldingSegment`s with an end type each
  (square, inside corner, outside corner with a return).
- **Picture lights:** counted as hardware.

A built-in gets `trim` (`crownHeight`, `crownProjection`, `baseMouldingHeight`,
`pictureLightWidth`). The frieze is `topGap − crownHeight`, so the frieze and crown always
exactly fill the space above the uppers. Sections get `pictureLight`. Obstructions get `crown`
(continue or stop). The crown and frieze cross a fireplace by default; the countertop and base
moulding always stop.

**Corners (dead corner with fillers, spec §6).** A run end can meet "the run round the corner".
On the paper check, letting one run's boxes into the corner square left the other run's boxes
standing in front of its last door. So both runs stop short of each other. Each gets a corner
filler at base level and a corner stile at upper level, out to the other's face, and the corner
behind is dead space. The run on the earlier wall is the one whose countertop and frieze run
through to the wall. A run without a matching partner, or whose boxes reach into the other's,
is an error; a filler under 2" is a warning.

**Construction, chosen by Andrew:**

- **Countertops butt at the corner:** the earlier wall's top runs through, and the later one
  butts square into its front edge strip.
- **The frieze is an applied 3/4" board**, flush with the face frames, fastened to blocking on
  the box tops and to the wall where nothing is below. It's one board per stretch, with a note
  past 12'.

**Choices made without asking (please check):**

- **Cut parts butt everywhere:** the frieze inside corner (the later board butts into the
  earlier one's face) and the frieze return at an open end (behind the front board). Mitres are
  only counted for the bought mouldings.
- **Moulding lengths** are to the long points, plus the solid-stock waste allowance (20%) for
  offcuts at the mitres. Prices are per metre in the hardware library (shown per foot in inch
  projects). Defaults: crown $3.50/ft, base $2/ft, picture lights $45 each.
- **Base moulding stops square at pilasters,** rather than wrapping them. The pilaster's plinth
  and cap blocks are not drawn yet.
- **The fireplace is assumed flush with the uppers' face** for the crown and frieze to run
  straight across it. A chimney breast standing proud of the uppers would need outside corners
  round it, which aren't modelled yet.
- **The reference room's fireplace wall grew from 135" to 156"** to leave room for the corner
  (the media wall's 18" boxes plus a 3" filler).

Also fixed: the hardware library's "Used for" list was missing knobs (M10), and now has knobs,
picture lights and the two mouldings.

## ADR-043: Quick-add for built-ins, the reference room, and elevation polish

**Status:** Accepted (M14). No schema change. Spec §9 #1.

**Acceptance #1: each reference wall from presets in under 10 actions.** The fireplace wall
takes 8 and the media wall 2. Unit and e2e tests each rebuild both walls from an empty room
through the store or UI, and check the cut list is part-for-part the reference room's.

- **Wall layouts** (`RUN_LAYOUTS`): media wall, fireplace wall and bookcases. "Lay out the
  wall" fills a run, or replaces its modules. Sections are auto-width, so a layout fits any run.
  The "Traditional painted built-in" style is the template: a new built-in uses it (added if
  missing), as since M11.
- **Corner fitting:** adding a run next to a run of the same built-in round an inside corner
  sets both ends to meet and shortens both, leaving a 3" corner filler each side. The reference
  room's offsets (21") and lengths (123", 138") come out of this with no typing.
- **Run ends keep end panels in step:** an end meeting the room gives the end section a
  finished end; a wall or corner removes it (an end panel in a corner is an error).
- **Moving a run's start keeps its far end** (within the wall), instead of pushing the run
  past the wall.
- **Opening width is always editable:** while auto it shows the laid-out share, and typing a
  width fixes it (one action instead of two).

**Elevation polish.** A wall with a built-in run gets a second tier of dimensions under the
floor line: each section's clear opening, and each pilaster and opening. Up the right side are
its heights: floor to countertop, countertop to top line, top line to ceiling. The 3D room view
now looks from inside the room: into the corner when two walls have something on them,
otherwise from the front right of the one wall. Before, it looked from one fixed side and
showed the back of the media wall.

**Golden outputs.** `docs/golden/` holds the reference room's cut list and shopping list
(CSV), kept current by a snapshot test, for review.

**Fixed while checking the golden cut list:**

- **A flush plinth no longer notches finished end panels.** A setback of 0 gave a "4 1/2" × 0"
  notch".
- **Pilasters are cut from the style's face-frame stock** (poplar for the traditional style),
  not the project's default filler material, and are named "Pilaster". They're painted in 3D.
  Fillers gain optional `name` and `styleId`, set only on fillers compiled from a built-in, so
  saved files don't change.

**Choices made without asking (please check):**

- **Hinge side:** a single door hinges towards the nearer end of its run, so it opens against
  the wall or corner. The reference's right tower (hinged right, next to the corner) agrees.
- **Fireplace layout:** a pilaster on both sides of the fireplace (symmetrical). The reference
  has one on the left only, so rebuilding it deletes one.
- **Corner filler:** quick-add leaves 3", as in the reference. The warning threshold stays 2".
- **Layout stile widths** follow the reference: 2 1/4" on the fireplace wall, 3" elsewhere.

## ADR-044: Corner treatments: blind base and wrap-around shelves

**Status:** Accepted (M15, at Andrew's request). Schema version 7.

M13's dead corner (ADR-042) leaves both runs short of the corner, with fillers and a 9" corner
stile over space nobody can reach. Andrew asked for corners that are used. He chose, from the
options offered:

- **A blind corner base.**
- **Wrap-around open shelves.**
- **The earlier wall's run owns the corner by default.**

He did not choose a diagonal corner box, an L-shaped base with a lazy susan, a blind upper or
diagonal open shelves. The dead corner stays available.

**Model.** A built-in gets `corners`: one entry per corner, keyed by the later wall (the corner
is at its start). Each entry has:

- `base`: dead or blind.
- `upper`: dead or wrap.
- `owner`: the earlier or the later run, whose box takes a blind corner.

A corner with no entry is a dead corner, so the v6 → v7 migration only adds an empty list, and
the spec's reference room is unchanged. Both runs' editors show the same corner.

**Compiled from existing cabinet types, no new geometry:**

- **Blind base.** The owner's end section's base box becomes a `blindBase` (ADR-019) that
  carries on to the wall behind the other run. Its blind stile covers its end stile and
  everything past the run's end. The other run's corner filler is the pull filler, so the blind
  box's own `pullFillerWidth` is 0.
- **Wrap-around shelves.** The two end bays' uppers become one `lShelf` (ADR-037) standing on
  the countertop, with no toe kick. The earlier run is the L's run and owns the corner square;
  the later run is the return. The upper corner stiles go.

**Fitting.** Quick-add gives a new corner a blind base and wrap-around shelves. The owner of a
blind base runs up to the other run's face, and the other run stops a 3" filler short.
Changing a corner's base or owner refits both runs. Changing only the uppers moves nothing.

**Also changed:**

- **L-shaped shelving shelves are spaced within the face-frame opening, like every other
  cabinet's.** They used to be spaced between the bottom and the top, which put them ¼"–¾"
  off the bays beside a wrap-around corner. Frameless L shelving and the G7/G8 cut lists are
  unchanged; the shelves move only in height.
- **L-shaped shelving gets shelf nosing** when the style asks for it, instead of a warning.
  The run piece's nosing runs on across the end of the return's.
- **Wall elevation dimensions:** where items stand over one another, only the lowest is
  dimensioned. A wrap-around return wider than the box below it would otherwise print two
  overlapping labels.

**Choices made without asking (please check):**

- **New corners default to blind base + wrap-around shelves.** The acceptance test for the
  reference room's dead corner now takes 4 actions on the media wall instead of 2, still
  under 10.
- **The blind box's door is where the section's door was.** The blind stile seen between the
  other run's face and the door is just the end stile (2 1/4" in the reference), once the
  owner is fitted up to the other run. In the reference room, whose towers have fixed widths,
  the run stays where it was, so the visible blind stile is 3" + 2 1/4".
- **The wrap-around L has no hanging rail,** like every L shelving cabinet: it stands on the
  countertop and is fixed through its backs. The bays beside it are wall-cabinet builds with
  a hanging rail.
- **The wrap-around L is always the earlier run's.** The owner setting only moves the blind
  base box. Which shelf piece runs through the corner can't be seen.
- **Wrap-around shelves need matching bays:** both corner bays open (not a TV niche), the same
  shelf count, and the same countertop height and top line, or the built-in shows an error.
  While either run has no modules, the corner waits and builds as dead.
- **A picture light over a wrapped bay** centres over its widened opening, out to the corner
  stile.
