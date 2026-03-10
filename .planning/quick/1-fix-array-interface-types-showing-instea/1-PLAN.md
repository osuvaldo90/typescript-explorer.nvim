# Quick Task 1: Fix array interface types showing {} instead of Diagnostic[] in explorer

**Mode:** quick
**Created:** 2026-03-10

## Root Cause

The bundled TypeScript compiler (via `noExternal: [/.*/]` in tsup) resolves `ts.getDefaultLibFilePath()` relative to the bundle output (`dist/lib.esnext.full.d.ts`) instead of `node_modules/typescript/lib/`. Without lib files, the type checker can't resolve `Array<T>`, so `Diagnostic[]` falls back to `{}`.

## Tasks

### Task 1: Externalize TypeScript from bundle
- **files:** `sidecar/tsup.config.ts`
- **action:** Change `noExternal` to exclude `typescript` so it loads from node_modules at runtime
- **verify:** `npm run build` produces ~13KB bundle; `node dist/main.js` resolves `Diagnostic[]` correctly
- **done:** Bundle uses runtime TypeScript with correct lib file paths

### Task 2: Unwrap array element types in display
- **files:** `sidecar/src/services/type-walker.ts`
- **action:** Instead of wrapping array element in intermediate "element" node, surface element's properties directly as array node's children
- **verify:** `diagnostics: Diagnostic[]` shows message/severity/range as direct children; `string[]` shows no children
- **done:** Array types display element properties directly

### Task 3: Update tests
- **files:** `sidecar/src/services/type-walker.test.ts`
- **action:** Update TRES-06 and GAP-06 tests to match unwrapped array behavior
- **verify:** `npm test` passes all 43 tests
- **done:** All tests green
