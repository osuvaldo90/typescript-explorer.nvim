---
phase: quick-5
plan: 01
subsystem: panel-ui
tags: [tree, config, ux]
dependency_graph:
  requires: []
  provides: [default-expand-depth]
  affects: [tree-rendering, panel-display]
tech_stack:
  added: []
  patterns: [depth-limited-recursive-expansion]
key_files:
  created: []
  modified:
    - lua/ts-explorer/tree.lua
    - lua/ts-explorer/config.lua
decisions:
  - "5 levels chosen as default -- shows meaningful structure without overwhelming"
  - "Config require inside function to avoid circular dependency at module load"
metrics:
  duration: "3 min"
  completed: "2026-03-10"
---

# Quick Task 5: Default 5-Level Expansion in Type Explorer

Depth-aware default expansion in tree.lua using configurable panel.default_expand_depth (default 5).

## What Changed

### config.lua
- Added `default_expand_depth = 5` to `panel` section of `M.defaults`
- Configurable via `setup({ panel = { default_expand_depth = N } })`

### tree.lua
- Rewrote `expand_default(tree_state)` from single-line `{ ["0"] = true }` to recursive depth-limited expansion
- New internal `expand_to_depth(node, path, current_depth)` walks the tree, expanding nodes with children up to `depth_limit`
- `current_depth` starts at 0 for root; with limit=5, depths 0-4 are expanded, depth 5+ collapsed
- Reads config via `require("ts-explorer.config")` inside the function (avoids circular deps at load time)
- Fallback `or 5` if config field somehow missing

## Verification

Tested with a 7-level linear chain:
- Nodes at depths 0-4 expanded (5 entries in `expanded` table)
- Node at depth 5 shows collapsed marker
- Existing toggle, expand_recursive, collapse_recursive functions unaffected (no changes to those paths)

## Deviations from Plan

None -- plan executed exactly as written.

## Commits

| Task | Commit | Description |
|------|--------|-------------|
| 1 | 8bab781 | feat(quick-5): expand type explorer panel 5 levels deep by default |

## Self-Check: PASSED
