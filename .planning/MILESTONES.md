# Milestones

## v1.0 MVP (Shipped: 2026-03-10)

**Phases:** 3 | **Plans:** 10 | **Requirements:** 21/21
**Timeline:** 2 days (2026-03-09 → 2026-03-10)
**LOC:** 550 TypeScript + 738 Lua (source), 1,021 TypeScript (tests)
**Git range:** `feat(01-01)` → `feat(quick-7)`

**Delivered:** Interactive TypeScript type explorer for Neovim — full untruncated type trees in a side panel with cursor-follow, powered by a Node.js sidecar using the TypeScript compiler API.

**Key accomplishments:**
1. Node.js sidecar with NDJSON protocol, auto-start, crash recovery, and clean shutdown
2. Full untruncated TypeScript type resolution via LanguageService with recursive walker
3. Structured type trees for objects, unions, intersections, functions, arrays, tuples, generics
4. Interactive side panel with collapsible tree, cursor-follow, and keyboard controls
5. Stack-safe type walker with depth/node limits and cycle detection
6. Live file change sync and configurable keybindings

---

