---
phase: quick-6
plan: 01
subsystem: sidecar
tags: [typescript, language-service, file-versioning, rpc, neovim-autocmd]

requires:
  - phase: 02-type-resolution
    provides: LanguageService caching and type resolution
provides:
  - Per-file version tracking in LanguageService host
  - fileChanged RPC handler in sidecar
  - BufWritePost autocmd for TypeScript file save notifications
affects: [type-resolution, sidecar-rpc, panel-autocmds]

tech-stack:
  added: []
  patterns: [per-file-version-map, fire-and-forget-rpc-notification]

key-files:
  created: []
  modified:
    - sidecar/src/services/language-service.ts
    - sidecar/src/services/language-service.test.ts
    - sidecar/src/main.ts
    - lua/ts-explorer/panel.lua

key-decisions:
  - "fileVersions Map keyed by absolute path for per-file version tracking"
  - "Fire-and-forget RPC for fileChanged -- saves should not block on response"

patterns-established:
  - "File change notification: Lua BufWritePost -> RPC fileChanged -> notifyFileChanged -> version bump -> LS re-reads"

requirements-completed: [QUICK-6]

duration: 2min
completed: 2026-03-10
---

# Quick Task 6: Fix Type Explorer Showing Module-Level Types Summary

**Per-file version tracking via fileVersions Map so LanguageService re-reads files after save, with BufWritePost autocmd notification chain**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-10T04:21:22Z
- **Completed:** 2026-03-10T04:23:30Z
- **Tasks:** 2
- **Files modified:** 4

## Accomplishments
- getScriptVersion now returns per-file version strings instead of hardcoded "0"
- notifyFileChanged increments version for specific files, triggering LanguageService to re-read from disk
- Sidecar handles "fileChanged" RPC method
- Lua sends fileChanged on BufWritePost for *.ts/*.tsx files (only when sidecar is running)
- 5 new tests covering version tracking, isolation, and file re-reading

## Task Commits

Each task was committed atomically:

1. **Task 1: Add per-file version tracking (RED)** - `22a2bd1` (test)
2. **Task 1: Add per-file version tracking (GREEN)** - `293992e` (feat)
3. **Task 2: Add fileChanged RPC handler and BufWritePost autocmd** - `9161512` (feat)

_Note: Task 1 used TDD with RED/GREEN commits_

## Files Created/Modified
- `sidecar/src/services/language-service.ts` - Added fileVersions Map, per-file getScriptVersion, notifyFileChanged export
- `sidecar/src/services/language-service.test.ts` - Added 5 tests for version tracking behavior
- `sidecar/src/main.ts` - Added fileChanged RPC case calling notifyFileChanged
- `lua/ts-explorer/panel.lua` - Added BufWritePost autocmd sending fileChanged RPC

## Decisions Made
- fileVersions Map uses absolute paths as keys (via path.resolve) for consistency with LanguageService internals
- BufWritePost callback is fire-and-forget (empty callback) so file saves are not blocked waiting for RPC response

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
- Test for file re-reading initially used a tmp file outside the project root, which wasn't in the cached LanguageService's fileNames list. Fixed by using the existing fixture file (save/modify/restore pattern).

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- File change notification chain complete
- Type explorer will now show correct types after file edits instead of stale module-level types
