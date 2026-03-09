---
phase: 01-sidecar-communication
plan: 02
subsystem: plugin
tags: [lua, neovim, ndjson, rpc, sidecar, jobstart, stdio]

requires:
  - phase: 01-01
    provides: Node.js sidecar with NDJSON protocol and echo handler
provides:
  - Neovim Lua plugin that auto-starts sidecar on VimEnter
  - NDJSON RPC layer with request/response correlation over stdio
  - Crash recovery with configurable max restarts
  - Clean shutdown via VimLeavePre + jobstop + SIGTERM
  - TsExplorerRestart user command
affects: [phase-2, phase-3]

tech-stack:
  added: [neovim-lua, vim.fn.jobstart, vim.json]
  patterns: [lazy-require-modules, ndjson-line-buffering, crash-recovery-with-backoff-limit]

key-files:
  created:
    - plugin/ts-explorer.lua
    - lua/ts-explorer/init.lua
    - lua/ts-explorer/config.lua
    - lua/ts-explorer/sidecar.lua
    - lua/ts-explorer/rpc.lua
    - lua/ts-explorer/log.lua
  modified:
    - sidecar/src/main.ts

key-decisions:
  - "SIGTERM handler added to sidecar for clean jobstop shutdown"
  - "lazy.nvim users need lazy=false for VimEnter autocmd to fire correctly"
  - "Line buffering in rpc.lua handles partial NDJSON reads from jobstart on_stdout"

patterns-established:
  - "Plugin entry in plugin/ts-explorer.lua with vim.g.loaded guard and autocmds"
  - "Module layout: lua/ts-explorer/{config,log,rpc,sidecar,init}.lua"
  - "RPC correlation: pending callbacks keyed by integer request ID"
  - "Sidecar path resolution via debug.getinfo source path"

requirements-completed: [SIDE-01, SIDE-02, SIDE-05]

duration: ~15min
completed: 2026-03-09
---

# Phase 1 Plan 02: Neovim Lua Plugin Wiring Summary

**Neovim Lua plugin with auto-start sidecar, NDJSON RPC over stdio, crash recovery, and verified echo round-trip**

## Performance

- **Duration:** ~15 min (including human verification checkpoint)
- **Started:** 2026-03-09T22:40:00Z
- **Completed:** 2026-03-09T22:56:37Z
- **Tasks:** 2
- **Files modified:** 7

## Accomplishments
- Complete Neovim plugin with 6 Lua modules wired for sidecar communication
- Echo round-trip verified end-to-end in real Neovim session
- Clean process lifecycle: auto-start on VimEnter, clean shutdown on VimLeavePre, no orphans
- Crash recovery with configurable max restarts (default 3)

## Task Commits

Each task was committed atomically:

1. **Task 1: Lua plugin modules** - `4ed1fbf` (feat)
2. **Task 2: Verify echo round-trip** - checkpoint:human-verify (approved)
3. **SIGTERM fix (deviation)** - `588032e` (fix)

## Files Created/Modified
- `plugin/ts-explorer.lua` - Plugin entry point with load guard, commands, autocmds
- `lua/ts-explorer/init.lua` - Public API (setup function)
- `lua/ts-explorer/config.lua` - Configuration defaults and merge
- `lua/ts-explorer/sidecar.lua` - Process lifecycle: start, stop, restart, crash recovery
- `lua/ts-explorer/rpc.lua` - NDJSON message protocol with line buffering and ID correlation
- `lua/ts-explorer/log.lua` - Logging helper using vim.notify, stderr capture
- `sidecar/src/main.ts` - Added SIGTERM handler for clean jobstop shutdown

## Decisions Made
- Added SIGTERM handler to sidecar so Neovim's jobstop() triggers clean exit (discovered during verification)
- lazy.nvim plugin spec requires `lazy = false` for VimEnter autocmd to fire -- this is user config, not plugin code
- Line buffering in rpc.on_data handles Neovim's chunked stdout delivery correctly

## Deviations from Plan

### Auto-fixed Issues

**1. [Rule 1 - Bug] Added SIGTERM handler to sidecar for jobstop shutdown**
- **Found during:** Task 2 (human verification)
- **Issue:** jobstop() sends SIGTERM but sidecar only handled stdin close -- jobstop was killing the process ungracefully
- **Fix:** Added `process.on("SIGTERM", () => process.exit(0))` to sidecar/src/main.ts
- **Files modified:** sidecar/src/main.ts, sidecar/dist/main.js
- **Verification:** Neovim :qa exits cleanly, no orphaned processes
- **Committed in:** `588032e`

---

**Total deviations:** 1 auto-fixed (1 bug fix)
**Impact on plan:** Essential for clean shutdown. No scope creep.

## Issues Encountered
- lazy.nvim with `event = "VimEnter"` defers plugin load such that the VimEnter autocmd never fires. Fix: use `lazy = false` in user's plugin spec. This is a user configuration concern, not a plugin bug.

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Phase 1 complete: sidecar starts, communicates, and shuts down correctly
- Ready for Phase 2: type resolution engine can build on the established RPC protocol
- rpc.request() provides the transport layer for future resolveType method

---
*Phase: 01-sidecar-communication*
*Completed: 2026-03-09*
