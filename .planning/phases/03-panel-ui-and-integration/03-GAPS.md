---
phase: 03-panel-ui-and-integration
type: gaps
created: 2026-03-09
source: UAT manual testing
---

# Phase 03 — Known Gaps

Discovered during manual UAT of the panel implementation. All issues are in the sidecar type-walker, not the panel UI itself.

## GAP-01: typeToString stack overflow crashes sidecar

**Severity:** Critical
**Component:** `sidecar/src/services/type-walker.ts`
**Reproducer:** Hover on `bus` (line 113) or `EventBus` class declaration (line 42) in test.ts

`checker.typeToString(type, undefined, NoTruncation)` causes `RangeError: Maximum call stack size exceeded` on recursive/self-referential types like generic classes with `Map` properties. The current try-catch fallback is a band-aid — the real fix needs to either:

- Add a depth limit to `walkType` to stop recursion before TS internals overflow
- Use an iterative approach with an explicit stack
- Detect problematic type patterns (e.g., generic class constructors) and simplify early

**Impact:** Crashes the entire sidecar process. Subsequent resolves fail until sidecar restarts. This is the likely root cause of GAP-06 (diagnostics showing `{}`).

## GAP-02: Overloaded functions only show first signature's parameters

**Severity:** Medium
**Component:** `sidecar/src/services/type-walker.ts` — function branch
**Reproducer:** Hover on `parse` function (line 56-58) in test.ts

The walker uses `type.getCallSignatures()[0]` — only the first overload. For overloaded functions, all signatures should be represented. The typeString correctly shows the full overloaded type, but the children only show the first signature's params.

**Expected:** Show all overload signatures as children, or show the implementation signature params.

## GAP-03: Private class members resolve as `any`

**Severity:** Low
**Component:** `sidecar/src/services/type-walker.ts`
**Reproducer:** Hover on `EventBus` class, inspect `handlers` property; or hover directly on `this.handlers` usage

`private handlers = new Map<...>()` resolves as `any` because TypeScript's `getTypeOfSymbol` may not expose private member types through the public type checker API in all contexts. Need to investigate whether `getDeclaredTypeOfSymbol` or accessing through declaration gives the correct type.

## GAP-04: `parsed` variable shows function type instead of variable type

**Severity:** Medium
**Component:** `sidecar/src/services/type-walker.ts` — `resolveAtPosition`
**Reproducer:** Hover on `parsed` variable at line 117 in test.ts

User reports seeing the `parse` function signature instead of `Result<number, Error>`. Sidecar CLI test returns correct data, so this may be a cursor byte-offset calculation issue in `panel.lua` (`line2byte` offset) causing the position to land on `parse` instead of `parsed`, or a stale panel result from sidecar crash (GAP-01).

**Note:** Needs re-verification after GAP-01 is fixed. If sidecar doesn't crash, cursor-follow may work correctly.

## GAP-05: Slow/no panel update for complex generic types

**Severity:** Medium
**Component:** `sidecar/src/services/type-walker.ts`
**Reproducer:** Hover on `bus` (line 113) or `handler` (line 114) in test.ts

Panel doesn't update when cursor is on symbols that trigger complex type resolution. Root cause is GAP-01 — the sidecar crashes on `bus`, and subsequent resolves (including `handler`) fail because the sidecar is down or restarting.

**Note:** Likely resolves when GAP-01 is fixed. Re-verify after.

## GAP-06: TypeCheckEvent `diagnostics` shows as `{}` with no children

**Severity:** Medium
**Component:** Unknown — possibly cascading from GAP-01
**Reproducer:** Hover on `TypeCheckEvent` (line 29) in test.ts, inspect `diagnostics` property

The `diagnostics` property renders as `diagnostics: {}` (no expand marker, no children) instead of `▸ diagnostics: Diagnostic[]`. However, sidecar CLI test returns correct data with full `Diagnostic` children.

**Hypothesis:** The sidecar crashed from a prior `bus` hover (GAP-01), and subsequent resolve returned error/partial data. The panel silently drops errors and may show stale/incorrect state.

**Note:** Re-verify after GAP-01 is fixed with a fresh sidecar session.

---

## Dependency Analysis

```
GAP-01 (stack overflow) ← root cause
  ├── GAP-05 (slow/no update) — likely cascading
  ├── GAP-06 (diagnostics: {}) — likely cascading
  └── GAP-04 (parsed type) — possibly cascading

GAP-02 (overloads) — independent
GAP-03 (private members) — independent
```

Fix GAP-01 first, then re-verify GAP-04/05/06 before investing in fixes.
