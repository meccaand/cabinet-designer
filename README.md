# Cabinet Designer

Browser-based parametric cabinet design for hobbyist and small-shop woodworkers: design
cabinets, see them in 3D, and take accurate cut lists and sheet layouts to the shop.
Local-first; no account or server.

What it does today:

- Cabinets: base, wall, tall, drawer bank, open shelving and blind corners, frameless or face
  frame, with editable construction conventions. Sizes accept fractions, feet-inches or mm.
- 3D view with exploded, x-ray and dimension modes; plan and wall elevations of the room.
- Cut list, guillotine sheet layouts with a numbered cut order, and a materials estimate.
- Export: a PDF shop packet, the cut list and shopping list as CSV, and the project as JSON.
- Keyboard shortcuts (press `?` in the app) and a layout for tablets.
- Projects are saved in the browser automatically (IndexedDB).

Work in progress. See [docs/PLAN.md](docs/PLAN.md) for scope and milestones and
[docs/DECISIONS.md](docs/DECISIONS.md) for the decision log.

## Development

Requires Node 22+ (`.nvmrc` pins 26).

```sh
npm install
npm run dev          # dev server
npm test             # unit tests (Vitest)
npm run coverage     # unit tests + coverage thresholds
npm run e2e          # Playwright (first run: npx playwright install chromium)
npm run lint         # ESLint + Prettier check
npm run typecheck    # core, app and tooling tsconfigs
```

## Layout

- `src/core/`: pure TypeScript domain logic: units, data model, part generation, room layout,
  drawings, cut list, nesting, costing and report text/CSV. No React, three.js or browser APIs.
  This is enforced by tsconfig and ESLint.
- `src/app/`: the React UI, the 3D viewer, and the PDF shop packet (`src/app/pdf`).
- `e2e/`: Playwright tests.
