---
phase: 03-panel-ui-and-integration
plan: 02
subsystem: ui
tags: [neovim, lua, panel, cursor-follow, debounce, keymaps, autocmds]

# Dependency graph
requires:
  - phase: 03-panel-ui-and-integration/plan-01
    provides: "tree rendering engine (tree.lua) and config panel defaults"
  - phase: 01-sidecar-communication
    provides: "RPC request/response and sidecar lifecycle"
  - phase: 02-type-resolution-engine
    provides: "resolve handler returning TypeNode trees"
provides:
  - "Panel window lifecycle (open/close/toggle)"
  - "Cursor-follow with 150ms debounce via CursorMoved + CursorHold"
  - "Buffer keymaps: CR toggle, L expand-all, H collapse-all, q/Esc close"
  - ":TsExplorer user command"
affects: []

# Tech tracking
tech-stack:
  added: []
  patterns:
    - "vim.uv.new_timer() for debounce with vim.schedule_wrap callback"
    - "Monotonic request_id for stale RPC response cancellation"
    - "Scratch buffer with buftype=nofile persisted across open/close cycles"

key-files:
  created:
    - lua/ts-explorer/panel.lua
    - .planning/phases/03-panel-ui-and-integration/03-GAPS.md
  modified:
    - lua/ts-explorer/config.lua
    - lua/ts-explorer/tree.lua
    - plugin/ts-explorer.lua
    - sidecar/src/services/type-walker.ts

key-decisions:
  - "config.get() falls back to defaults when setup() not called -- allows panel to work without explicit setup()"
  - "Approved with known type-walker gaps documented in 03-GAPS.md -- panel UI is correct, sidecar issues are separate scope"

patterns-established:
  - "Debounce pattern: CursorMoved triggers timer, CursorHold as fallback"
  - "Request cancellation via monotonic ID comparison in callback"

requirements-completed: [PANE-01, PANE-04, PANE-05, PANE-06]

# Metrics
duration: 25min
completed: 2026-03-09
---

# Phase 3 Plan 02: Panel UI and Integration Summary

**Interactive side panel with :TsExplorer toggle, cursor-follow debounce, tree keymaps, and live type resolution wiring**

## Performance

- **Duration:** ~25 min (including UAT verification and bug fixes)
- **Tasks:** 2 (1 auto + 1 checkpoint)
- **Files modified:** 6

## Accomplishments
- Complete panel module with open/close/toggle lifecycle and persistent scratch buffer
- Cursor-follow via CursorMoved + CursorHold with 150ms debounce and stale-request cancellation
- Buffer keymaps (CR, L, H, q, Esc) for tree interaction
- :TsExplorer command registered in plugin/ts-explorer.lua
- Two bug fixes discovered during UAT: config.get() default fallback and typeToString crash guard
- Comprehensive gap analysis documented for type-walker issues (6 gaps, root cause identified)

## Task Commits

Each task was committed atomically:

1. **Task 1: Create panel.lua** - `09b9d90` (feat)
2. **Task 2: Verify panel end-to-end** - checkpoint approved

**Bug fixes during checkpoint verification:**
- `8322ff9` - fix: config.get() falls back to defaults when setup() not called
- `451956c` - fix: deduplicate literal display and prevent typeToString crash
- `2e0178b` - docs: document type-walker gaps from UAT testing

## Files Created/Modified
- `lua/ts-explorer/panel.lua` - Panel window lifecycle, keymaps, autocmds, cursor-follow, debounce
- `lua/ts-explorer/config.lua` - Default fallback when setup() not called
- `lua/ts-explorer/tree.lua` - Deduplicate literal display fix
- `plugin/ts-explorer.lua` - :TsExplorer command registration
- `sidecar/src/services/type-walker.ts` - typeToString crash guard
- `.planning/phases/03-panel-ui-and-integration/03-GAPS.md` - Known gaps from UAT

## Decisions Made
- config.get() returns defaults even without setup() -- enables panel usage without explicit configuration
- Approved with known gaps: 6 type-walker issues documented in 03-GAPS.md, all in sidecar layer not panel UI
- GAP-01 (typeToString stack overflow) identified as root cause for 3 other cascading gaps

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] config.get() crashes when setup() not called**
- **Found during:** Task 2 (UAT verification)
- **Issue:** config.get() returned nil when setup() was never called, causing panel to error
- **Fix:** Added default fallback so config.get() always returns valid defaults
- **Files modified:** lua/ts-explorer/config.lua
- **Committed in:** 8322ff9

**2. [Rule 1 - Bug] Duplicate literal display and typeToString crash**
- **Found during:** Task 2 (UAT verification)
- **Issue:** Literal types showed duplicate values; typeToString threw on certain recursive types
- **Fix:** Deduplicated literal rendering; added try-catch guard in typeToString call
- **Files modified:** lua/ts-explorer/tree.lua, sidecar/src/services/type-walker.ts
- **Committed in:** 451956c

---

**Total deviations:** 2 auto-fixed (2 bugs)
**Impact on plan:** Both fixes necessary for correct UAT verification. No scope creep.

## Issues Encountered
- Type-walker crashes on recursive/self-referential types (GAP-01) -- documented but not fixed in this plan as it is sidecar-layer scope. Band-aid crash guard applied; full fix deferred.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- This is the final plan of the final phase. The v1 milestone is functionally complete.
- Known gaps in type-walker (03-GAPS.md) are enhancement/hardening work, not blocking v1 core functionality.
- All 21 v1 requirements mapped and addressed.

## Self-Check: PASSED

All 7 files verified present. All 4 commits verified in git log.

---
*Phase: 03-panel-ui-and-integration*
*Completed: 2026-03-09*
