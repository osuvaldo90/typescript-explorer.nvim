# Roadmap: nvim-ts-type-explorer

## Overview

This roadmap delivers a TypeScript type explorer for Neovim in three phases, building bottom-up from reliable sidecar communication, through full type resolution, to the interactive side panel. Each phase produces a verifiable, independently testable capability. The sidecar protocol must be rock-solid before type resolution builds on it, and type resolution must produce correct structured data before the panel renders it.

## Phases

**Phase Numbering:**
- Integer phases (1, 2, 3): Planned milestone work
- Decimal phases (2.1, 2.2): Urgent insertions (marked with INSERTED)

Decimal phases appear between their surrounding integers in numeric order.

- [ ] **Phase 1: Sidecar Communication** - Reliable bidirectional NDJSON communication between Neovim and a Node.js sidecar process
- [ ] **Phase 2: Type Resolution Engine** - Full untruncated TypeScript type resolution returning structured type trees
- [ ] **Phase 3: Panel UI and Integration** - Interactive side panel with tree rendering wired to live type resolution on cursor move

## Phase Details

### Phase 1: Sidecar Communication
**Goal**: Neovim can start a Node.js sidecar process and exchange structured messages reliably over stdio
**Depends on**: Nothing (first phase)
**Requirements**: SIDE-01, SIDE-02, SIDE-05
**Success Criteria** (what must be TRUE):
  1. Opening Neovim with the plugin installed starts a Node.js sidecar process automatically
  2. Neovim can send a JSON request to the sidecar and receive a JSON response back (echo round-trip)
  3. Closing Neovim causes the sidecar to self-terminate with no orphaned Node.js processes
  4. Sidecar logging goes to stderr only -- no stdout corruption of the message channel
**Plans:** 2 plans

Plans:
- [ ] 01-01-PLAN.md — Node.js sidecar project with NDJSON protocol, echo handler, and self-termination (TDD)
- [ ] 01-02-PLAN.md — Neovim Lua plugin wiring: auto-start, RPC, crash recovery, and integration verification

### Phase 2: Type Resolution Engine
**Goal**: Given a file path and cursor position, the sidecar returns a complete structured type tree with no truncation
**Depends on**: Phase 1
**Requirements**: SIDE-03, SIDE-04, SIDE-06, TRES-01, TRES-02, TRES-03, TRES-04, TRES-05, TRES-06, TRES-07, TRES-08, TRES-09
**Success Criteria** (what must be TRUE):
  1. Sending a file path and position to the sidecar returns the full untruncated type of the symbol at that location
  2. The returned type tree correctly represents object properties, union branches, intersection results, function signatures, array/tuple elements, and resolved generics as structured child nodes
  3. Optional properties include a `?` marker and readonly properties include a `readonly` marker in the returned data
  4. The sidecar discovers and uses the project's tsconfig.json for type resolution
  5. Recursive or pathological types do not hang the sidecar -- resolution times out gracefully
**Plans**: TBD

Plans:
- [ ] 02-01: TBD
- [ ] 02-02: TBD
- [ ] 02-03: TBD

### Phase 3: Panel UI and Integration
**Goal**: User can open a side panel that shows a live, interactive type tree for the symbol under the cursor
**Depends on**: Phase 2
**Requirements**: PANE-01, PANE-02, PANE-03, PANE-04, PANE-05, PANE-06
**Success Criteria** (what must be TRUE):
  1. User can run a command to open a persistent side panel (vertical split) that displays the type tree
  2. Tree nodes are expandable and collapsible with keyboard controls, defaulting to 1 level of expansion
  3. Moving the cursor to a different symbol automatically replaces the panel contents with the new type tree (debounced)
  4. User can close the panel with the same command that opens it
**Plans**: TBD

Plans:
- [ ] 03-01: TBD
- [ ] 03-02: TBD

## Progress

**Execution Order:**
Phases execute in numeric order: 1 -> 2 -> 3

| Phase | Plans Complete | Status | Completed |
|-------|----------------|--------|-----------|
| 1. Sidecar Communication | 0/2 | Planning complete | - |
| 2. Type Resolution Engine | 0/TBD | Not started | - |
| 3. Panel UI and Integration | 0/TBD | Not started | - |
