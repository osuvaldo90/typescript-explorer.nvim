---
phase: quick-7
plan: 1
subsystem: ui
tags: [neovim, keybinding, lua]

requires:
  - phase: 01-sidecar
    provides: sidecar.restart() function
provides:
  - "<leader>tr keybinding for sidecar restart"
affects: []

tech-stack:
  added: []
  patterns: [conditional keybinding registration gated by truthiness]

key-files:
  created: []
  modified:
    - lua/ts-explorer/config.lua
    - lua/ts-explorer/init.lua

key-decisions:
  - "Followed existing toggle_panel pattern exactly for consistency"

patterns-established:
  - "Keybinding defaults: set to false to disable, truthiness-gated registration"

requirements-completed: [QUICK-7]

duration: 1min
completed: 2026-03-10
---

# Quick Task 7: Add Keyboard Shortcut Summary

**Configurable `<leader>tr` keybinding to restart TypeScript Explorer sidecar, matching existing toggle_panel pattern**

## Performance

- **Duration:** < 1 min
- **Started:** 2026-03-10T13:52:11Z
- **Completed:** 2026-03-10T13:52:29Z
- **Tasks:** 1
- **Files modified:** 2

## Accomplishments
- Added `restart_sidecar = "<leader>tr"` default keybinding in config.lua
- Registered keymap in init.lua setup() with truthiness gate (set to false to disable)
- Calls `require("ts-explorer.sidecar").restart()` matching existing TsExplorerRestart command

## Task Commits

1. **Task 1: Add restart_sidecar keybinding to config defaults and register in init.lua** - `f98e3b1` (feat)

## Files Created/Modified
- `lua/ts-explorer/config.lua` - Added restart_sidecar default keybinding
- `lua/ts-explorer/init.lua` - Added conditional keymap registration for restart_sidecar

## Decisions Made
None - followed plan as specified.

## Deviations from Plan
None - plan executed exactly as written.

## Issues Encountered
None.

## User Setup Required
None - no external service configuration required.

---
*Quick Task: 7*
*Completed: 2026-03-10*
