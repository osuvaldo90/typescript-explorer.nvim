# Quick Task 1: Summary

**Status:** Complete
**Date:** 2026-03-10

## Changes

### Root cause: bundled TypeScript missing lib files
- `sidecar/tsup.config.ts`: Changed `noExternal: [/.*/]` to `noExternal: [/^(?!typescript$).*/]`
- TypeScript is now loaded from `node_modules/` at runtime, so `getDefaultLibFilePath()` correctly resolves to `node_modules/typescript/lib/`
- Bundle size: 9.42MB → 13.4KB (TypeScript no longer inlined)

### Array element unwrapping
- `sidecar/src/services/type-walker.ts`: Array types now surface element's properties directly as children instead of nesting under an intermediate "element" node
- `Diagnostic[]` → shows message, severity, range as direct children
- `string[]` → no children (typeString already conveys the info)

### Tests updated
- `sidecar/src/services/type-walker.test.ts`: Updated TRES-06 (primitive array) and GAP-06 (TypeCheckEvent diagnostics) to match unwrapped behavior
- All 43 tests pass

## Verification

```
▾ TypeCheckEvent
  ▸ diagnostics: Diagnostic[]   ← was: diagnostics: {}
    kind: "typecheck"
    file: string
    id: string
    timestamp: number
```

Expanding diagnostics now shows: message, severity, range.
