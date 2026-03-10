---
status: resolved
trigger: "Diagnose 3 UAT issues: pos 10 null, User->any, Status->null"
created: 2026-03-09T00:00:00Z
updated: 2026-03-10T00:30:00Z
---

## Current Focus

hypothesis: confirmed - interface symbols need getDeclaredTypeOfSymbol, same as type aliases
test: verified with direct TS API calls
expecting: N/A - confirmed
next_action: return diagnosis

## Symptoms

expected: User interface resolves to object with id/name/email properties; Status resolves to union
actual: User returns {kind:"primitive", name:"User", typeString:"any"}; Status works correctly; pos 10 returns null (correct)
errors: none (no crash, just wrong result)
reproduction: resolveAtPosition(fixture, 164) for User interface identifier
started: since implementation

## Eliminated

- hypothesis: Status type alias (pos 243) is broken
  evidence: Tested directly -- Status resolves correctly as union with 3 literal children. The getDeclaredTypeOfSymbol fix for TypeAlias works.
  timestamp: 2026-03-09

- hypothesis: Position 10 is a real failure
  evidence: Position 10 is inside comment "// Simple types for testing type resolution" -- no symbol exists there, {node: null} is correct.
  timestamp: 2026-03-09

## Evidence

- timestamp: 2026-03-09
  checked: Position 10 in fixture file
  found: Position 10 is character 't' inside the comment on line 1
  implication: {node: null} is correct -- no bug here

- timestamp: 2026-03-09
  checked: Position 243 (Status identifier in 'type Status')
  found: Resolves correctly to union with 3 literal children
  implication: The TypeAlias check with getDeclaredTypeOfSymbol works for type aliases

- timestamp: 2026-03-09
  checked: Position 164 (User identifier in 'interface User')
  found: Symbol has flags=64 (SymbolFlags.Interface), NOT TypeAlias. getTypeOfSymbol returns "any". getDeclaredTypeOfSymbol returns the correct User type with properties [id, name, email].
  implication: The code only checks for TypeAlias flag but NOT Interface flag. Interfaces need the same getDeclaredTypeOfSymbol treatment.

- timestamp: 2026-03-09
  checked: type-walker.ts lines 32-37
  found: Code checks `symbol.flags & ts.SymbolFlags.TypeAlias` but does NOT check `ts.SymbolFlags.Interface`. For interfaces, it falls through to getTypeOfSymbol which returns "any".
  implication: Root cause confirmed -- missing Interface flag check

## Resolution

root_cause: In resolveAtPosition (type-walker.ts lines 34-37), the code only checks for TypeAlias symbols when deciding to use getDeclaredTypeOfSymbol. Interface symbols (SymbolFlags.Interface = 64) are not handled, so they fall through to getTypeOfSymbol which returns "any" for interface declarations. The fix already applied for type aliases (getDeclaredTypeOfSymbol) is the exact same fix needed for interfaces.
fix: empty
verification: empty
files_changed: []
