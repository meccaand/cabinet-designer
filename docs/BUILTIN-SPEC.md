# Feature Spec: Styled Built-In Cabinetry ("Traditional Painted Built-In")

## Goal

Extend the cabinet designer so it can model **furniture-style built-ins**: wall-to-wall compositions of base cabinets, stepped-back open shelving, full-height towers, a media niche, and continuous trim. The reference is a living room with built-ins on two walls: a fireplace wall and a media wall meeting at an inside corner.

The key idea: a built-in is **not one cabinet**. It is an _assembly_ of simple boxes unified by:

1. a shared **style preset** (door style, paint, hardware, moulding profiles), and
2. **continuous horizontal datums** (plinth, countertop, shelf lines, frieze, crown) that run across every module on a wall, and around corners.

Most of the work is adding (a) the style layer, (b) a few new module types, and (c) a "run" object that owns the trim and alignment.

> All dimensions below are **estimates read from a rendering**. Treat them as defaults/parameters, not fixed values.

---

## 1. Style preset (applies to every module in the built-in)

| Attribute     | Value in reference                                                              | Notes for the app                                                                                                        |
| ------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Construction  | Face-frame                                                                      | Visible stiles/rails between door pairs and between shelf bays                                                           |
| Door style    | **Shaker**: 5-piece, square inside edge, flat recessed center panel             | Stile/rail width ≈ 2.25"–2.5"                                                                                            |
| Door mounting | Reads as **inset** (doors sit within the face frame with an even, small reveal) | Support `inset` and `overlay` as a style option. Default to inset for this preset                                        |
| Finish        | Single painted color everywhere: cases, doors, shelves, backs, trim             | Muted gray-blue-green, satin. Display default ≈ `#8A9A97` (the render is warm-lit, so the photo reads darker and warmer) |
| Hardware      | Small round knobs, antique/aged brass, ≈1–1.25" dia                             | One knob per door. On door pairs, both knobs sit on the **meeting stiles**, about 2.5–3" down from the top of the door   |
| Back panels   | Flat, painted the same color                                                    | No beadboard                                                                                                             |
| Shelf edge    | Thick, face-framed look, ≈1.25–1.5" visible nosing                              | Render shelves thicker than raw ¾" stock                                                                                 |
| Toe kick      | **None**. Furniture-style flush plinth with base moulding                       | See trim                                                                                                                 |
| Lighting      | Brass **picture lights**, ≈14–18" wide                                          | Mounted on the frieze, centered over open shelf bays                                                                     |

Model this as a reusable `StylePreset` that modules reference by id, so swapping one preset (e.g., to stained oak or a slab door) restyles the whole built-in.

---

## 2. Module types

### 2.1 Base cabinet (built-in base)

- Height to top of countertop ≈ **32"** (lower than a kitchen's 34.5").
- Depth ≈ **16–18"**.
- Doors: configurable count. In the reference, **pairs of doors** sit under each upper bay; the TV section has **two pairs** side by side.
- A full-height **face-frame stile (~2–2.5")** separates each door pair. A thin meeting gap divides the doors within a pair.
- Top: a thin painted top (≈1") with a small overhang (≈½–¾") and an eased edge. It forms the **countertop ledge** the uppers sit on.
- Bottom: flush **plinth** (≈4–5" tall) with a simple base moulding cap, flush with or slightly proud of the face frame. No recessed toe kick.

### 2.2 Upper open-shelf bay (stepped-back hutch)

- Sits **on top of the base countertop**. Its front is **set back** from the base face (≈4–6" shallower: upper depth ≈ **12"**), which leaves a visible ledge.
- Open, no doors. **4 shelves → 5 openings**, roughly evenly spaced from the countertop to the underside of the frieze.
- Bay width ≈ **28–32"**.
- Bays are separated by wide face-frame stiles (≈2.5–3").
- Shelf heights should **align across neighboring bays** (see datums).

### 2.3 Media niche with bridge (new)

The center section of the media wall:

- A framed rectangular **opening** from the countertop up to a horizontal **bridge**. Width ≈ **60–66"**, height ≈ **36–40"**.
- The niche back is a flat, painted panel, set back so a wall-mounted TV fits flush-ish inside. The face frame border around the niche matches the stile width.
- **Bridge above the niche**: a row of open **cubbies**, 2 in the reference, split by one vertical divider. The **bottom of the bridge aligns with the top shelf line** of the flanking bays.
- Parameters: `opening_width`, `opening_height`, `bridge_cubby_count`, `tv_size` (for placement or clearance validation only).

### 2.4 Tower (full-height unit) (new)

Used on the fireplace wall. A base cabinet + upper bookcase combined into one full-height unit:

- **Left tower (beside fireplace, open end):**
  - Base: one pair of doors, deeper than the upper, so it has the same countertop ledge as the media wall.
  - Upper: open bookcase, 4 shelves.
  - **Finished end panel** facing the room (left side) with a **recessed panel detail** on both the base and upper sections. The panel shapes follow the step-back.
  - **Pilaster** on the fireplace side: a flat, wide (≈5–7") full-height vertical board between the bookcase and the chimney breast, ending in a block under the crown.
  - Picture light centered above.
- **Right tower (between fireplace and inside corner, narrow):**
  - Width ≈ **18–24"**.
  - Base: **single door**, knob on the side opposite the hinge.
  - Upper: open bookcase, 4 shelves, picture light above.
  - Meets the media wall run at the inside corner.

A tower can be built as `Base + UpperBay` stacked with a shared end panel. A dedicated type is easier for users, though.

### 2.5 Fillers, pilasters, end panels

- `Stile/Filler`: plain vertical face-frame member between modules (width param).
- `Pilaster`: wider decorative vertical, optional plinth block at the bottom and cap block at the top.
- `FinishedEndPanel`: applied to any exposed side; options `flat | recessed_panel`; follows the base/upper step-back profile.

### 2.6 Non-cabinet elements on the run (placeholders)

The **fireplace + mantel** and the **chimney breast** are not cabinetry. The run still needs to reserve their space. Add an `Opening/Obstruction` module (width, height, optional label) so trim can continue over it (crown) or stop at it (plinth, countertop).

---

## 3. Run-level trim (owned by the wall run, not individual boxes)

Trim must be generated **continuously across all modules in a run** and **mitered around inside and outside corners**, never per-box.

| Trim                   | Description                                                                                              | Default                              |
| ---------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| Crown moulding         | Runs the full length of every wall, including over the fireplace/chimney breast; returns at exposed ends | ≈4–5" tall, simple cove/ogee profile |
| Frieze board           | Flat band between the top of the shelf openings and the crown. Picture lights mount here                 | ≈5–6" tall                           |
| Base moulding / plinth | Continuous along the cabinet bottoms; stops at the fireplace hearth/surround                             | ≈4–5"                                |
| Countertop / ledge     | Continuous across all base modules on a run; stops at obstructions                                       | ≈1" thick, ½–¾" overhang             |
| Scribe strips          | At walls and ceiling                                                                                     | Optional, ≈¾"                        |

---

## 4. Alignment rules (datums)

These are what make it read as one piece of furniture. Implement them as run-level constraints the modules snap to:

1. **Floor/plinth line**: common for all modules on the run.
2. **Countertop line**: common height for all base sections, _including tower bases_.
3. **Shelf lines**: shelves in adjacent upper bays share heights. Default is even spacing between the countertop and the frieze. The user can override, but bays stay linked by default.
4. **Bridge line**: the bottom of the media bridge = the top shelf line of the flanking bays.
5. **Frieze/crown line**: one ceiling-referenced height across the whole room, both walls.
6. **Vertical alignment**: the stiles between upper bays line up with the stiles between base door pairs below them. Each upper bay sits over exactly one base door group (TV section: one niche over two door pairs).
7. **Symmetry**: on the media wall, the left and right bays should default to equal widths, mirrored around the niche.

---

## 5. Reference instance (example data)

An illustrative shape. Adapt it to the app's existing schema.

```json
{
  "stylePreset": {
    "id": "traditional-painted-builtin",
    "construction": "face_frame",
    "door": { "style": "shaker", "mount": "inset", "stileRailWidth": 2.25, "reveal": 0.125 },
    "finish": { "type": "paint", "sheen": "satin", "color": "#8A9A97" },
    "hardware": {
      "type": "knob",
      "shape": "round",
      "diameter": 1.125,
      "finish": "aged_brass",
      "placement": "meeting_stile_top",
      "offsetFromTop": 2.75
    },
    "shelfNosing": 1.5,
    "toeKick": "none",
    "plinth": { "height": 4.5, "moulding": "simple_cap" },
    "countertop": { "thickness": 1.0, "overhang": 0.625, "edge": "eased" },
    "frieze": { "height": 5.5 },
    "crown": { "height": 4.5, "profile": "cove" },
    "accessories": { "pictureLight": { "finish": "brass", "width": 16 } }
  },
  "room": { "ceilingHeight": 108 },
  "runs": [
    {
      "id": "fireplace-wall",
      "modules": [
        {
          "type": "tower",
          "width": 32,
          "baseDepth": 18,
          "upperDepth": 12,
          "base": { "doors": 2 },
          "upper": { "shelves": 4 },
          "leftEnd": "finished_recessed_panel",
          "pictureLight": true
        },
        { "type": "pilaster", "width": 6, "depth": 12 },
        {
          "type": "obstruction",
          "label": "fireplace + chimney breast",
          "width": 60,
          "crown": "continue",
          "plinth": "stop",
          "countertop": "stop"
        },
        {
          "type": "tower",
          "width": 21,
          "baseDepth": 18,
          "upperDepth": 12,
          "base": { "doors": 1, "hinge": "right" },
          "upper": { "shelves": 4 },
          "pictureLight": true
        }
      ],
      "endCondition": { "right": "inside_corner:media-wall" }
    },
    {
      "id": "media-wall",
      "baseDepth": 18,
      "upperDepth": 12,
      "countertopHeight": 32,
      "modules": [
        { "type": "stile", "width": 3 },
        {
          "type": "section",
          "width": 30,
          "base": { "doorGroups": [{ "doors": 2 }] },
          "upper": { "type": "open_bay", "shelves": 4 },
          "pictureLight": true
        },
        { "type": "stile", "width": 3 },
        {
          "type": "section",
          "width": 66,
          "base": { "doorGroups": [{ "doors": 2 }, { "doors": 2 }] },
          "upper": {
            "type": "media_niche",
            "openingHeight": 38,
            "bridge": { "cubbies": 2 },
            "tv": { "size": 65 }
          }
        },
        { "type": "stile", "width": 3 },
        {
          "type": "section",
          "width": 30,
          "base": { "doorGroups": [{ "doors": 2 }] },
          "upper": { "type": "open_bay", "shelves": 4 },
          "pictureLight": true
        },
        { "type": "stile", "width": 3 }
      ],
      "endCondition": { "left": "inside_corner:fireplace-wall", "right": "wall" }
    }
  ]
}
```

---

## 6. Corner handling

- **Inside corner (fireplace wall ↔ media wall):** base cabinets meet as a **blind/dead corner** with fillers so doors on both runs clear each other. Crown, frieze, countertop and plinth **miter** at the corner. Uppers meet with a corner stile.
- **Exposed end (left tower):** finished end panel plus **returned** crown, frieze, countertop and plinth.

---

## 7. Rendering expectations

- **Elevation view per wall:** shows face frames, door-pair splits, knobs, shelf lines, frieze, crown, picture lights, plus the obstruction outline for the fireplace.
- **3D view:** the step-back between base and upper must be visible (countertop ledge). Shelves use the thicker nosing. Crown is a continuous extrusion along the run path.
- **Style swap:** changing the preset (color, door style, hardware) updates every module in the built-in at once.

## 8. Cut list / BOM implications

- Face-frame parts (stiles, rails, mid-stiles) per section.
- Shaker door parts (stiles, rails, panel) per door, sized for inset or overlay.
- Run-level trim as linear footage (crown, frieze, base moulding, countertop) with miter and return counts.
- Hardware counts: knobs per door, picture lights per bay.

## 9. Acceptance criteria

1. A user can recreate both walls of the reference room from presets in under ~10 actions per wall.
2. Changing the countertop height on a run moves every base top, tower ledge and niche bottom together.
3. Changing the number of shelves in one bay re-spaces the shelves in the linked bays too, unless the bays are unlinked.
4. Crown and frieze run continuously across the fireplace obstruction and miter at the inside corner.
5. Switching the preset from inset to overlay recalculates door sizes, and the cut list updates.
