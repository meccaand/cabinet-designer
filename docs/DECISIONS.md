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
