# Cabinet Designer

Browser-based parametric cabinet design for hobbyist and small-shop woodworkers: design
cabinets, see them in 3D, and take accurate cut lists and sheet layouts to the shop.
Local-first; no account or server.

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

- `src/core/`: pure TypeScript domain logic (units, data model; later part generation, cut
  lists, nesting). No React, three.js or browser APIs. This is enforced by tsconfig and ESLint.
- `src/app/`: the React UI.
- `e2e/`: Playwright tests.
