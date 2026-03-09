---
phase: 01-sidecar-communication
plan: 01
subsystem: sidecar
tags: [ndjson, node, stdio, typescript, tsx, tsup]

requires:
  - phase: none
    provides: first plan in project
provides:
  - Node.js sidecar process reading NDJSON from stdin and writing responses to stdout
  - Echo handler for round-trip protocol testing
  - Self-termination on stdin close (SIDE-05)
  - Protocol types (Request, Response, ErrorResponse)
  - Top-level Makefile for test orchestration
affects: [01-02, phase-2]

tech-stack:
  added: [typescript, tsx, tsup, node-test-runner]
  patterns: [ndjson-over-stdio, stderr-only-logging, tdd-red-green]

key-files:
  created:
    - sidecar/package.json
    - sidecar/tsconfig.json
    - sidecar/tsup.config.ts
    - sidecar/src/main.ts
    - sidecar/src/protocol.ts
    - sidecar/src/handlers/echo.ts
    - sidecar/src/protocol.test.ts
    - sidecar/src/lifecycle.test.ts
    - Makefile
  modified: []

key-decisions:
  - "Used Node.js built-in test runner (node:test) via tsx -- no external test framework needed"
  - "CJS output format via tsup for maximum Node.js compatibility"
  - "Separate error codes for PARSE_ERROR, UNKNOWN_METHOD, and HANDLER_ERROR"

patterns-established:
  - "NDJSON protocol: {id, method, params} -> {id, result} or {id, error: {code, message}}"
  - "All sidecar logging through log() helper using console.error (stderr only)"
  - "Tests spawn sidecar as child process for true integration testing"

requirements-completed: [SIDE-02, SIDE-05]

duration: 2min
completed: 2026-03-09
---

# Phase 1 Plan 01: Sidecar NDJSON Protocol Summary

**Node.js sidecar with NDJSON stdin/stdout protocol, echo handler, and self-termination on stdin close**

## Performance

- **Duration:** 2 min
- **Started:** 2026-03-09T22:24:22Z
- **Completed:** 2026-03-09T22:26:21Z
- **Tasks:** 2
- **Files modified:** 9

## Accomplishments
- TDD red-green cycle: 5 tests written first, all failing, then implementation made them pass
- NDJSON request/response protocol over stdio with structured error handling
- Sidecar self-terminates cleanly (exit 0) when stdin closes
- tsup bundles to single dist/main.js file for production use

## Task Commits

Each task was committed atomically:

1. **Task 1: Sidecar project setup + protocol types + tests (RED)** - `27ff11d` (test)
2. **Task 2: Implement sidecar main.ts + echo handler (GREEN)** - `d4bf7fb` (feat)

_TDD tasks: RED commit has failing tests, GREEN commit makes them pass._

## Files Created/Modified
- `sidecar/package.json` - Project config with build/test scripts
- `sidecar/tsconfig.json` - TypeScript config (ES2022, Node16, strict)
- `sidecar/tsup.config.ts` - Bundle config (CJS, node18, single file)
- `sidecar/src/protocol.ts` - Request, Response, ErrorResponse type definitions
- `sidecar/src/main.ts` - Entry point: readline on stdin, dispatch, stdout responses
- `sidecar/src/handlers/echo.ts` - Echo handler returns params unchanged
- `sidecar/src/protocol.test.ts` - Echo round-trip, unknown method, malformed JSON tests
- `sidecar/src/lifecycle.test.ts` - Stdin close exit, no stdout contamination tests
- `Makefile` - Top-level test orchestration (test-sidecar, build-sidecar targets)

## Decisions Made
- Used Node.js built-in test runner (node:test) via tsx -- zero external test framework dependencies
- CJS output format via tsup for maximum Node.js compatibility
- Three distinct error codes: PARSE_ERROR (malformed JSON), UNKNOWN_METHOD (bad method), HANDLER_ERROR (handler exception)
- Tests spawn the sidecar as a child process for true end-to-end protocol testing

## Deviations from Plan

None - plan executed exactly as written.

## Issues Encountered
None

## User Setup Required
None - no external service configuration required.

## Next Phase Readiness
- Sidecar NDJSON protocol is complete and independently testable
- Echo handler provides round-trip verification for plan 01-02 (Neovim Lua wiring)
- dist/main.js builds correctly for production use by Neovim plugin

---
*Phase: 01-sidecar-communication*
*Completed: 2026-03-09*
