# Golden outputs: the reference room

The spec's reference living room ([BUILTIN-SPEC.md](../BUILTIN-SPEC.md) §5, built by
`src/core/__tests__/referenceRoom.ts`), exported as the app exports it:

- [reference-room-cut-list.csv](reference-room-cut-list.csv): every part, cut size and note.
- [reference-room-shopping-list.csv](reference-room-shopping-list.csv): sheets, board feet,
  banding, mouldings, hardware and the estimate.

`src/core/__tests__/golden.test.ts` regenerates them on every test run and fails on any
difference. After checking a change, accept it with `npx vitest run -u`.
