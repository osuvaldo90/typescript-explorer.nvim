---
phase: quick-3
plan: 01
subsystem: lua-plugin
tags: [bugfix, utf8, offset-calculation, rpc-logging]
dependency_graph:
  requires: []
  provides: [correct-utf8-position-mapping]
  affects: [panel-cursor-follow, rpc-response-logging]
tech_stack:
  added: []
  patterns: [character-offset-conversion, debug-logging-gated-by-config]
key_files:
  created: []
  modified:
    - lua/ts-explorer/panel.lua
    - lua/ts-explorer/rpc.lua
decisions:
  - Use vim.fn.strchars() to convert byte offsets to character offsets for TypeScript compatibility
  - Keep debug logging gated behind log.level == "debug" for zero-cost in normal operation
metrics:
  duration: 10 min
  completed: 2026-03-10
---

# Quick Task 3: Fix bus hover not updating type explorer

Byte-to-character offset conversion fix for files with multi-byte UTF-8 characters; the plugin was sending byte positions but TypeScript expects character (UTF-16) positions.

## Root Cause

The plugin's `_resolve_at_cursor` in `panel.lua` calculated the cursor position using `vim.fn.line2byte(line) - 1 + col`, which produces a **byte offset**. However, TypeScript's AST uses **character offsets** (UTF-16 code units). The file `test.ts` contains 3 multi-byte UTF-8 characters before line 239:

- Byte 2185: em dash (U+2014) -- 3 bytes, 1 character
- Byte 4842: left arrow (U+2190) -- 3 bytes, 1 character
- Byte 4878: em dash (U+2014) -- 3 bytes, 1 character

This caused a cumulative 6-byte discrepancy. When the cursor was on `bus` (character offset 4920), the plugin sent byte offset 4926, which landed on the `new` keyword inside a `NewExpression` AST node. Since `NewExpression` has no symbol, `getSymbolAtLocation()` returned null, and the sidecar returned `{node: null}`. The panel kept the last result (no-flicker behavior), appearing as if nothing happened.

## Changes Made

### panel.lua -- Character offset calculation

Replaced `vim.fn.line2byte()` byte offset with a character-counting approach:
1. Iterate all lines before the cursor line, summing `vim.fn.strchars(line) + 1` (for newline)
2. For the cursor line, extract bytes up to the cursor column and count characters with `vim.fn.strchars()`
3. Send the character offset to the sidecar instead of the byte offset

Added debug logging for the resolve request/response lifecycle (offset value, callback state, result node info).

### rpc.lua -- JSON decode error logging

Added `log.error()` when `vim.json.decode` fails, including the error message and line length. Previously, decode failures were completely silent, making diagnosis impossible.

Added `log.debug()` for received line length on every response.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 63dc780 | fix(quick-3): convert byte offsets to character offsets for TypeScript position mapping |

## Verification

- User confirmed hovering over `bus` at line 239 now updates the type explorer pane
- All 31 sidecar tests pass with no regressions
- Other symbols (truncationTest, handler, parsed, deepObj) continue to resolve correctly

## Deviations from Plan

None -- plan executed as written. The root cause was identified through code analysis rather than runtime logging (the byte vs character offset mismatch was discoverable by comparing TypeScript AST positions with Python byte positions).

## Self-Check: PASSED
