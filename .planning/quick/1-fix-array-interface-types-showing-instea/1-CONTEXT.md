# Quick Task 1: Fix array interface types showing {} instead of Diagnostic[] in explorer - Context

**Gathered:** 2026-03-10
**Status:** Ready for planning

<domain>
## Task Boundary

Fix diagnostics property showing {} instead of Diagnostic[] in type explorer. When cursor is on TypeCheckEvent (line 28 of test.ts), the diagnostics property renders as `diagnostics: {}` instead of showing the array type with its element structure.

</domain>

<decisions>
## Implementation Decisions

### Array display format
- Should be a collapsible node
- The type string should show that it is an array (e.g., `Diagnostic[]`)
- The explorer should unwrap the array to show the array element type's properties as children

### Claude's Discretion
- Recursion depth handling for nested types

</decisions>

<specifics>
## Specific Ideas

- Hovering over `Diagnostic` directly works fine — the issue is specifically with array-of-interface types
- Expected output for `diagnostics` property:
  ```
  ▾ diagnostics: Diagnostic[]
      message: string
      severity: "error" | "warning" | "info"
      range: { start: number; end: number }
  ```

</specifics>
