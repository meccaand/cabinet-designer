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
| P       | Platform (toe-kick base) height. The box sits on top: box height = H − P        |
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
