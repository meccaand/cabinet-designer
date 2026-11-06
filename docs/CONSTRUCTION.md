# Construction rules

How the generator turns a cabinet into parts. Every formula here is implemented in
`src/core/generate/` and checked by tests. Default values are in [PLAN.md](PLAN.md)
"Construction conventions". All of them are editable per project and per cabinet.

**Accuracy safeguard.** Every part is a real 3D box. Tests check every pair of parts in every
generated cabinet. Two parts may only overlap where one sits in a dado, rabbet or groove of the
other, and only by exactly that joint's depth. If any formula below were wrong, parts would
collide or leave gaps, and that check would fail.

## Coordinates and symbols

x runs left → right, y floor → up, z back → front (z = 0 is the back of the cabinet).

| Symbol  | Meaning                                                                         |
| ------- | ------------------------------------------------------------------------------- |
| W, H, D | Overall width, height, depth (D = box + back + face frame; doors excluded)      |
| t       | Carcass sheet thickness (actual, e.g. 18 mm)                                    |
| bt      | Back thickness                                                                  |
| ft      | Face-frame stock thickness (0 when frameless)                                   |
| P       | Platform (toe-kick base) height; 0 without a toe kick. Box height = H − P       |
| Dbox    | D − ft (front of the carcass box)                                               |
| j       | Joint depth for top/bottom/shelves (`dadoDepth`). 0 for butt and pocket joinery |

## Carcass

- **Sides**: (H − P) × depth. Depth is Dbox, or Dbox − bt for an applied back.
- **Bottom, full top, stretchers**: sit between the sides. Length = W − 2t + 2j.
  - Top/bottom at the ends of the sides sit in **rabbets** (dado & rabbet construction).
  - Panels between the ends (fixed shelves, dividers, a raised face-frame bottom) sit in **dados**.
  - Depth = Dbox − bt (inset or applied back), or Dbox (back in grooves).
- **Face-frame bottom** is raised so its top is flush with the top of the frame's bottom rail.
  Raised by (rail width − t).
- **Stretchers**: front and back, both laid flat, `stretcherWidth` deep. With a grooved back,
  the back stretcher sits just in front of the back.
- **Back**:
  - Inset: sits in rabbets in the sides. Width W − 2(t − rabbet depth), height H − P. Top,
    bottom and stretchers stop in front of it.
  - Applied: covers the whole back, W × (H − P). The rest of the carcass is bt shallower.
  - Grooved: sits in grooves in the sides, the bottom and a full top, `backGrooveSetback` from
    the back edge. Width W − 2t + 2·groove depth. Height runs from (bottom top − groove depth)
    to (top underside + groove depth), or to the top of the sides under stretchers.
- **Platform**: front and back rails W long, P high. The front rail's face is `setback` behind
  the cabinet front. Cross members fit between the rails: length (D − setback) − 2·rail
  thickness. There is one at each end, plus as many as needed so none are more than
  `crossMemberSpacing` apart (centre to centre).
- **No toe kick** (any floor cabinet can turn it off): P = 0. There is no platform, and the box
  fills the full height H, standing on the floor. Frameless overlay fronts start `revealEdge`
  above the box bottom, as on wall cabinets, instead of flush with it. End panels have no notch,
  and fillers start at the floor.

## Cabinet types

| Type              | Platform | Top                | Hung from    | Fronts (frameless overlay)                      | Default size (W × H × D) and face                             |
| ----------------- | -------- | ------------------ | ------------ | ----------------------------------------------- | ------------------------------------------------------------- |
| Base              | yes      | stretchers or full | —            | box bottom to `revealTopBase` below the top     | 24 × 34½ × 24: 6" drawer over doors                           |
| Drawer base       | yes      | stretchers or full | —            | as base                                         | 18 × 34½ × 24: 6" drawer + two equal drawers                  |
| Blind corner base | yes      | stretchers or full | —            | as base, minus the blind portion                | 42 × 34½ × 24: blind 25" left, 6" false front over a door     |
| Tall              | yes      | full               | —            | box bottom to `revealEdge` below the top        | 24 × 84 × 24: upper and lower doors, fixed shelf at the split |
| Open shelving     | yes      | full               | —            | no fronts                                       | 36 × 84 × 12: 4 adjustable shelves                            |
| Wall              | no       | full               | hanging rail | `revealEdge` all round                          | 30 × 30 × 12: doors, 2 adjustable shelves                     |
| Blind corner wall | no       | full               | hanging rail | `revealEdge` all round, minus the blind portion | 36 × 30 × 12: blind 13" left, door                            |

Doors wider than 21" default to a pair. Wall cabinets default to 54" off the floor (used by room
layout).

- **Hanging rail** (wall types): `hangingRailWidth` (3") × carcass thickness, butted between the
  sides directly under the top.
  - With a grooved back whose setback is at least a panel thick, it sits in the setback space
    behind the back.
  - Otherwise it sits in front of the back, and shelves, dividers and drawers stop in front of
    it (so wall shelves are one panel thickness shallower).
- **Fixed shelf at a row split** (the top-level row split's "divider", default on tall
  cabinets): a full-width shelf in the shelf material, in dados with dado/rabbet joinery.
  - Frameless: centred on the gap between the door rows.
  - Face frame: top flush with the top of the rail.
  - It divides the interior into levels; drawers and shelves in each row stay within their level.
- **Blind corners**: the blind portion is `blindWidth` from the blind end of the cabinet.
  - Frameless overlay: a **blind panel** (door material, banded) runs from the edge reveal to
    half a gap short of the boundary, and the doors start half a gap past it.
  - Frameless inset: the blind panel sits in its own cell.
  - Face frame: the blind-side stile is widened to cover the blind portion. Its note says to glue
    up or use an edged plywood panel.
  - The **pull filler** (`pullFillerWidth` wide, door material when frameless, face-frame stock
    otherwise) stands out from the face, perpendicular to it, one door gap beyond the nearest
    door edge. It is cut to the height of the fronts (frameless) or of the box (face frame).
  - Blind cabinets can't have drawers: the box would hit the blind side.

## End panels and fillers

- **End panels** (per cabinet, left and/or right): door material, banded on the front edge and
  top.
  - Applied over the side: outside the face-frame overhang, if there is one.
  - Height: the cabinet's full height, so floor cabinets cover the toe kick.
  - Depth: from the wall to the door faces, so the panel is flush with the fronts.
  - Floor cabinets on a toe kick get a recorded toe-kick notch at the bottom front corner: toe-kick height ×
    (door face − platform front). It shows on the part.
  - The panel adds its thickness to the run, and layout and snapping account for it.
- **Fillers** (room items): a strip in door material (frameless) or face-frame stock, with its
  front face at the filler's depth.
  - "Fill gap" makes one exactly as wide as the gap beside a cabinet, at the cabinet's depth.
  - Its height runs from the top of the toe kick (or the floor, without one) to the cabinet
    top.
  - Its note says to scribe it to fit.

## Cut list, sheets and estimate

- **Cut list**: every part from every cabinet and filler, grouped by material in library order.
  - Identical parts share a row: same name (left/right ignored), cut size, grain, banding, notch
    and notes.
  - Rows are numbered 1…n across the whole list, longest first within a material. Sheet diagrams
    label parts by these numbers.
  - Sizes are cut sizes. Thicknesses show at 1/32" in imperial projects.
- **Sheets**: each sheet material is nested on its sheet size with the project's kerf and factory
  edge trim (ADR-007).
  - Cuts are guillotine in three stages: strips off the sheet, sections off a strip, parts off a
    section, then a trim if a part is shorter than its section.
  - Every cut is numbered and described in shop terms (rip = along the sheet length/grain,
    crosscut = across it).
  - A part with grain never turns. Parts larger than a sheet are listed as a warning, never
    dropped.
- **Estimate**:
  - Sheets: whole sheets × price.
  - Solid stock: board feet = Σ length × width × rough thickness / 144 in³, plus the waste %.
  - Edge banding: Σ banded edge lengths + 1" per edge.
  - Hardware: totals from every cabinet × unit price.

## Room layout

- Walls form a chain joined at 90°. Walking along the walls, cabinets are on the right, so a
  right turn is an inside corner (L and U kitchens) and a left turn an outside corner.
- A cabinet's position is its wall, its distance from the wall's start to its left edge, and its
  height off the floor (wall cabinets default to 54").
- Dragging in the plan or elevation snaps the item's outer edge (end panels included) to the wall
  ends, to neighbours at overlapping heights, and, at an inside corner, to the depth of the run on
  the adjoining wall.
- The plan lists problems: items past a wall end, and items that overlap in plan at overlapping
  heights.

## Faces: openings, doors and drawer fronts

The cabinet face is a tree of rows and columns. Each child has a size or "auto", and auto
children share what's left equally.

- **Frameless overlay**: sizes are **front** sizes. Fronts fill a zone from `revealEdge` inside
  each side, from the box bottom up to `revealTopBase` below the box top. Adjacent fronts are
  `revealBetween` apart.
- **Frameless inset**: fronts sit inside the box opening with `insetGap` all round. Sizes are
  front sizes.
- **Face frame**: sizes are **opening** sizes. Stiles run full height. Top and bottom rails, and
  rails and mullions between openings, butt between them (pocket screws). Rail length = the
  width of the opening it spans.
  - Overlay fronts = opening + 2 × `faceFrameOverlay`.
  - Inset fronts = opening − 2 × `insetGap`.
- **Door pairs** split their front in two with `revealBetween` (overlay) or 2 × `insetGap`
  (inset) between them.
- **Grain**: doors are vertical. Drawer and false fronts run across.
- **Slab**: one piece, banded on all four edges.
- **Shaker (butt joint)**: stiles full height. Rails = front width − 2 × stile width.
  - Panel = (front − 2 × frame member + 2 × groove depth − panel clearance) in each direction.
  - A front becomes slab if its panel would be smaller than `minPanel` (2") in either direction.
    The part carries a note saying so.
- Inset fronts push drawers and shelves back by their thickness.

## Drawers (side-mount slides)

- **Slots**: frameless slides mount on the sides (or a divider). The slot is the front's
  vertical extent, clipped to the inside of the box.
- **Face-frame slots**: slides mount flush with the opening edges. **Slide spacers** fill the
  gap between side and opening (thickness = opening edge − inside of side, e.g.
  1½ − 0.709 = 0.791"). They are `spacerWidth` tall and as long as the slide. If a spacer is
  thicker than the face-frame stock, its note says to glue up or shim.
- **Box sizes**:
  - Width = mounting width − 2 × `sideClearance`.
  - Height = slot − `heightDeduction`, centred.
  - Length = the longest slide in `slideLengths` that fits in front of the back with
    `rearClearance`.
- **Box construction**: sides run full length. The box front and back fit between the sides.
  The bottom sits in a groove `bottomGrooveHeight` up, sized
  inside + 2 × groove depth − `bottomClearance` each way.
- Side-by-side drawers need a divider (frameless). In face-frame cabinets they aren't supported
  yet.

## Shelves and dividers

- **Dividers**: only between top-level columns. They are carcass thickness, centred on the
  column boundary, and full interior depth.
  - Bottom: in a dado in the bottom (dado/rabbet joinery), otherwise butted.
  - Top: in a dado in a full top, otherwise butted to the stretchers.
- **Adjustable shelves**: width = bay − `widthClearance`, depth = interior depth −
  `depthSetback`. Front edge banded, `pinsPerShelf` pins each.
- **Fixed shelves**: dadoed into the bay's sides or dividers (width = bay + 2j), full interior
  depth.
- Shelves are spaced evenly in their opening. Doors side by side in the same bay share one set
  of shelves.

## Hardware

- **Hinges**: per door, by height tier (≤40" → 2, ≤60" → 3, ≤80" → 4, taller → 5).
- **Slides**: one pair per drawer, grouped by length.
- **Pulls**: one per door and drawer front. Drawer fronts wider than 24" get two. False fronts
  get none.
- **Shelf pins**: `pinsPerShelf` per adjustable shelf.

## Golden cabinets: please verify

These were worked out by hand from the rules above, separately from the code, and the test
suite (`golden.test.ts`) checks the generator against them. They use the default conventions.

### G1: Frameless 30" base: dado joinery, inset (rabbeted) back, stretchers, slab overlay, 6" drawer over a door pair, 1 adjustable shelf

| Part                  | Qty | Length     | Width      | Thickness | mm (L × W × T)          |
| --------------------- | --- | ---------- | ---------- | --------- | ----------------------- |
| Left side             | 2   | 30 1/2"    | 24"        | ≈23/32"   | 774.70 × 609.60 × 18.00 |
| Bottom                | 1   | ≈29 3/32"  | ≈23 25/32" | ≈23/32"   | 738.70 × 604.40 × 18.00 |
| Front stretcher       | 1   | ≈29 3/32"  | 4"         | ≈23/32"   | 738.70 × 101.60 × 18.00 |
| Back stretcher        | 1   | ≈29 3/32"  | 4"         | ≈23/32"   | 738.70 × 101.60 × 18.00 |
| Back                  | 1   | 30 1/2"    | ≈29 11/32" | ≈7/32"    | 774.70 × 745.05 × 5.20  |
| Platform front rail   | 2   | 30"        | 4"         | ≈23/32"   | 762.00 × 101.60 × 18.00 |
| Platform cross member | 3   | ≈19 19/32" | 4"         | ≈23/32"   | 497.40 × 101.60 × 18.00 |
| Drawer front          | 1   | 29 7/8"    | 6"         | ≈23/32"   | 758.82 × 152.40 × 18.00 |
| Door (L)              | 2   | 24 1/4"    | 14 7/8"    | ≈23/32"   | 615.95 × 377.82 × 18.00 |
| Drawer side           | 2   | 22"        | ≈4 13/32"  | ≈15/32"   | 558.80 × 112.17 × 12.00 |
| Drawer box front      | 2   | ≈26 5/8"   | ≈4 13/32"  | ≈15/32"   | 676.60 × 112.17 × 12.00 |
| Drawer bottom         | 1   | ≈27 1/16"  | ≈21 1/2"   | ≈7/32"    | 687.71 × 545.91 × 5.20  |
| Adjustable shelf      | 1   | ≈28 17/32" | ≈23 17/32" | ≈23/32"   | 724.41 × 598.05 × 18.00 |

### G2: Face-frame 24" base: pocket-screw joinery, applied back, full top, shaker overlay doors, drawer over a door pair, 1 adjustable shelf

| Part                  | Qty | Length     | Width      | Thickness | mm (L × W × T)          |
| --------------------- | --- | ---------- | ---------- | --------- | ----------------------- |
| Left side             | 2   | 30 1/2"    | ≈23 1/32"  | ≈23/32"   | 774.70 × 585.35 × 18.00 |
| Bottom                | 1   | ≈22 19/32" | ≈23 1/32"  | ≈23/32"   | 573.60 × 585.35 × 18.00 |
| Top                   | 1   | ≈22 19/32" | ≈23 1/32"  | ≈23/32"   | 573.60 × 585.35 × 18.00 |
| Back                  | 1   | 30 1/2"    | 24"        | ≈7/32"    | 774.70 × 609.60 × 5.20  |
| Platform front rail   | 2   | 24"        | 4"         | ≈23/32"   | 609.60 × 101.60 × 18.00 |
| Platform cross member | 2   | ≈19 19/32" | 4"         | ≈23/32"   | 497.40 × 101.60 × 18.00 |
| Face frame stile      | 2   | 30 1/2"    | 1 1/2"     | 3/4"      | 774.70 × 38.10 × 19.05  |
| Face frame rail       | 3   | 21"        | 1 1/2"     | 3/4"      | 533.40 × 38.10 × 19.05  |
| Drawer front (slab)   | 1   | 22"        | 6"         | ≈23/32"   | 558.80 × 152.40 × 18.00 |
| Door stile            | 4   | 22"        | 2 1/4"     | 3/4"      | 558.80 × 57.15 × 19.05  |
| Door rail             | 4   | 6 7/16"    | 2 1/4"     | 3/4"      | 163.51 × 57.15 × 19.05  |
| Door panel            | 2   | 17 15/16"  | 6 7/8"     | ≈7/32"    | 455.61 × 174.62 × 5.20  |
| Drawer side           | 2   | 22"        | 4"         | ≈15/32"   | 558.80 × 101.60 × 12.00 |
| Drawer box front      | 2   | ≈19 1/16"  | 4"         | ≈15/32"   | 484.00 × 101.60 × 12.00 |
| Drawer bottom         | 1   | ≈19 1/2"   | ≈21 1/2"   | ≈7/32"    | 495.11 × 545.91 × 5.20  |
| Slide spacer          | 2   | 22"        | 2"         | ≈25/32"   | 558.80 × 50.80 × 20.10  |
| Adjustable shelf      | 1   | ≈22 17/32" | ≈22 25/32" | ≈23/32"   | 572.01 × 579.00 × 18.00 |

### G3: Frameless 18" drawer base: butt joinery, back in grooves, stretchers, slab overlay, three drawers (6" top front, the other two share the rest)

| Part                  | Qty | Length     | Width      | Thickness | mm (L × W × T)          |
| --------------------- | --- | ---------- | ---------- | --------- | ----------------------- |
| Left side             | 2   | 30 1/2"    | 24"        | ≈23/32"   | 774.70 × 609.60 × 18.00 |
| Bottom                | 1   | ≈16 19/32" | 24"        | ≈23/32"   | 421.20 × 609.60 × 18.00 |
| Front stretcher       | 1   | ≈16 19/32" | 4"         | ≈23/32"   | 421.20 × 101.60 × 18.00 |
| Back stretcher        | 1   | ≈16 19/32" | 4"         | ≈23/32"   | 421.20 × 101.60 × 18.00 |
| Back                  | 1   | ≈30 5/32"  | ≈17 11/32" | ≈7/32"    | 766.22 × 440.25 × 5.20  |
| Platform front rail   | 2   | 18"        | 4"         | ≈23/32"   | 457.20 × 101.60 × 18.00 |
| Platform cross member | 2   | ≈19 19/32" | 4"         | ≈23/32"   | 497.40 × 101.60 × 18.00 |
| Drawer front top      | 1   | 17 7/8"    | 6"         | ≈23/32"   | 454.02 × 152.40 × 18.00 |
| Drawer front lower    | 2   | 17 7/8"    | 12 1/16"   | ≈23/32"   | 454.02 × 306.39 × 18.00 |
| Drawer side top       | 2   | 22"        | ≈4 13/32"  | ≈15/32"   | 558.80 × 112.17 × 12.00 |
| Drawer side mid       | 2   | 22"        | 11 1/16"   | ≈15/32"   | 558.80 × 280.99 × 12.00 |
| Drawer side bottom    | 2   | 22"        | ≈10 11/32" | ≈15/32"   | 558.80 × 262.99 × 12.00 |
| Drawer box end top    | 2   | ≈14 5/8"   | ≈4 13/32"  | ≈15/32"   | 371.80 × 112.17 × 12.00 |
| Drawer box end mid    | 2   | ≈14 5/8"   | 11 1/16"   | ≈15/32"   | 371.80 × 280.99 × 12.00 |
| Drawer box end bottom | 2   | ≈14 5/8"   | ≈10 11/32" | ≈15/32"   | 371.80 × 262.99 × 12.00 |
| Drawer bottom         | 3   | ≈15 1/16"  | ≈21 1/2"   | ≈7/32"    | 382.91 × 545.91 × 5.20  |

Hardware: G1 has 4 hinges, 1 pair of 22" slides, 4 pulls and 4 shelf pins. G2 has 4 hinges,
1 pair of 22" slides, 3 pulls and 4 shelf pins. G3 has 3 pairs of 22" slides and 3 pulls.

Notes:

- The G2 drawer front (6" tall) is slab. A shaker panel there would be only 1½".
- The G2 slide spacers (0.791") are thicker than ¾" poplar. See the spacer note above.

### G4: Frameless wall cabinet 30" × 30" × 12": dado joinery, inset back, hanging rail, door pair, 2 adjustable shelves

| Part             | Qty | Length     | Width      | Thickness | mm (L × W × T)          |
| ---------------- | --- | ---------- | ---------- | --------- | ----------------------- |
| Side             | 2   | 30"        | 12"        | ≈23/32"   | 762.00 × 304.80 × 18.00 |
| Bottom           | 1   | ≈29 3/32"  | ≈11 25/32" | ≈23/32"   | 738.70 × 299.60 × 18.00 |
| Top              | 1   | ≈29 3/32"  | ≈11 25/32" | ≈23/32"   | 738.70 × 299.60 × 18.00 |
| Back             | 1   | 30"        | ≈29 11/32" | ≈7/32"    | 762.00 × 745.05 × 5.20  |
| Hanging rail     | 1   | ≈28 19/32" | 3"         | ≈23/32"   | 726.00 × 76.20 × 18.00  |
| Door             | 2   | 29 7/8"    | 14 7/8"    | ≈23/32"   | 758.82 × 377.82 × 18.00 |
| Adjustable shelf | 2   | ≈28 17/32" | ≈10 27/32" | ≈23/32"   | 724.41 × 275.25 × 18.00 |

### G5: Frameless tall cabinet 24" × 84" × 24": upper and lower door pairs with a fixed shelf at the split, 3 + 2 adjustable shelves

| Part                   | Qty | Length     | Width      | Thickness | mm (L × W × T)           |
| ---------------------- | --- | ---------- | ---------- | --------- | ------------------------ |
| Side                   | 2   | 80"        | 24"        | ≈23/32"   | 2032.00 × 609.60 × 18.00 |
| Bottom                 | 1   | ≈23 3/32"  | ≈23 25/32" | ≈23/32"   | 586.30 × 604.40 × 18.00  |
| Top                    | 1   | ≈23 3/32"  | ≈23 25/32" | ≈23/32"   | 586.30 × 604.40 × 18.00  |
| Back                   | 1   | 80"        | ≈23 11/32" | ≈7/32"    | 2032.00 × 592.65 × 5.20  |
| Platform rail          | 2   | 24"        | 4"         | ≈23/32"   | 609.60 × 101.60 × 18.00  |
| Platform cross member  | 2   | ≈19 19/32" | 4"         | ≈23/32"   | 497.40 × 101.60 × 18.00  |
| Door                   | 4   | 39 29/32"  | 11 7/8"    | ≈23/32"   | 1013.62 × 301.62 × 18.00 |
| Fixed shelf (at split) | 1   | ≈23 3/32"  | ≈23 25/32" | ≈23/32"   | 586.30 × 604.40 × 18.00  |
| Adjustable shelf       | 5   | ≈22 17/32" | ≈23 17/32" | ≈23/32"   | 572.01 × 598.05 × 18.00  |

### G6: Frameless blind corner base 42": blind end on the left (25" blind width, 3" pull filler), false front over a single door, 1 adjustable shelf

| Part                  | Qty | Length     | Width      | Thickness | mm (L × W × T)           |
| --------------------- | --- | ---------- | ---------- | --------- | ------------------------ |
| Side                  | 2   | 30 1/2"    | 24"        | ≈23/32"   | 774.70 × 609.60 × 18.00  |
| Bottom                | 1   | ≈41 3/32"  | ≈23 25/32" | ≈23/32"   | 1043.50 × 604.40 × 18.00 |
| Stretcher             | 2   | ≈41 3/32"  | 4"         | ≈23/32"   | 1043.50 × 101.60 × 18.00 |
| Back                  | 1   | 30 1/2"    | ≈41 11/32" | ≈7/32"    | 774.70 × 1049.85 × 5.20  |
| Platform rail         | 2   | 42"        | 4"         | ≈23/32"   | 1066.80 × 101.60 × 18.00 |
| Platform cross member | 3   | ≈19 19/32" | 4"         | ≈23/32"   | 497.40 × 101.60 × 18.00  |
| Blind panel           | 1   | 30 3/8"    | 24 7/8"    | ≈23/32"   | 771.52 × 631.82 × 18.00  |
| False front           | 1   | 16 7/8"    | 6"         | ≈23/32"   | 428.62 × 152.40 × 18.00  |
| Door                  | 1   | 24 1/4"    | 16 7/8"    | ≈23/32"   | 615.95 × 428.62 × 18.00  |
| Pull filler           | 1   | 30 3/8"    | 3"         | ≈23/32"   | 771.52 × 76.20 × 18.00   |
| Adjustable shelf      | 1   | ≈40 17/32" | ≈23 17/32" | ≈23/32"   | 1029.21 × 598.05 × 18.00 |

Hardware: G4 has 4 hinges, 2 pulls and 8 shelf pins. G5 has 8 hinges (39 29/32" doors are
under the 40" tier), 4 pulls and 20 shelf pins. G6 has 2 hinges, 1 pull (none on the false
front) and 4 shelf pins.

Notes:

- The G4 shelves are shallower by the hanging rail (inset back, so the rail is inside the box).
- The G6 pull filler stands 3" proud of the blind panel at the edge of the door opening.
