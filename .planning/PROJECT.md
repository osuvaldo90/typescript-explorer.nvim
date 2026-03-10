# nvim-ts-type-explorer

## What This Is

An interactive TypeScript type explorer for Neovim. Shows the full, untruncated type of the symbol under the cursor in a persistent side panel with a collapsible tree view. Powered by a long-running Node.js sidecar using the TypeScript compiler API's LanguageService for incremental type resolution.

## Core Value

Users can see the complete, untruncated type of any TypeScript symbol instantly — no more hovering over truncated LSP tooltips.

## Requirements

### Validated

- ✓ Side panel showing resolved type tree for symbol under cursor — v1.0
- ✓ Collapsible object properties, union branches, intersection branches — v1.0
- ✓ No type truncation (full type resolution) — v1.0
- ✓ Debounced updates on cursor move (replace previous tree entirely) — v1.0
- ✓ Default expand depth configurable (shipped at 5 levels) — v1.0
- ✓ Node.js sidecar starts with Neovim, communicates over stdio NDJSON — v1.0
- ✓ Structured types: objects, unions, intersections, functions, arrays, tuples, generics — v1.0
- ✓ Optional `?` and readonly markers on properties — v1.0
- ✓ Crash recovery with configurable max restarts — v1.0
- ✓ Live file change sync (BufWritePost notifies sidecar) — v1.0
- ✓ Keyboard controls: toggle nodes, expand/collapse all, close panel — v1.0

### Active

- [ ] Syntax highlighting via treesitter in the panel buffer
- [ ] Jump to definition from tree node
- [ ] Copy resolved type as type alias to clipboard
- [ ] Icon indicators for type kinds
- [ ] Lock/pin current type to prevent cursor-follow
- [ ] Conditional type resolution showing evaluated result
- [ ] JSDoc/documentation display for type members

### Out of Scope

- Non-TypeScript languages — plugin is TypeScript-only
- Type editing or refactoring — read-only exploration
- Inline virtual text — use existing tools (e.g., inlay hints)
- Floating window mode — side panel only for v1
- History/back navigation — panel replaces on cursor move, simplicity
- tsserver plugin approach — sidecar chosen for independence from LSP server
- tsgo backend — researched, API is experimental/unstable, rejected for v1

## Context

Shipped v1.0 with 550 LOC TypeScript + 738 LOC Lua (source), 1,021 LOC tests.
Tech stack: Neovim Lua plugin + Node.js sidecar, TypeScript LanguageService, NDJSON over stdio.
66 tests passing (5 sidecar + 31 type-walker + 30 integration).
All 21 v1 requirements satisfied, audit passed.

Known technical debt:
- Nyquist VALIDATION.md files remain draft status (non-blocking)
- No treesitter highlighting in panel buffer yet

## Constraints

- **Platform**: Neovim 0.9+ (for modern extmark/float APIs)
- **Language**: Lua for plugin, TypeScript/Node.js for sidecar
- **Communication**: stdio NDJSON between Neovim and sidecar
- **Dependencies**: Minimal — typescript npm package for type resolution

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Side panel over floating window | Persistent view better for type exploration | ✓ Good — works well for drilling into types |
| Sidecar starts with Neovim | Always-ready, no cold start on first use | ✓ Good — instant response on first cursor move |
| Replace tree on cursor move | Simpler UX, no state management for history | ✓ Good — clean mental model |
| Default expand depth = 5 | User feedback: 1 level too shallow, 5 gives useful overview | ✓ Good — adjusted from initial 1-level default |
| tsgo rejected | API experimental/unstable per research | ✓ Good — TypeScript npm works reliably |
| CJS output via tsup | Node.js compatibility for sidecar | ✓ Good — simple build pipeline |
| Node.js built-in test runner | No external test framework needed | ✓ Good — zero test dependencies |
| safeTypeToString 3-tier fallback | Stack-safe type stringification | ✓ Good — handles pathological types gracefully |
| maxNodes=500 cap | Prevents response size explosion on complex types | ✓ Good — 222K nodes down to ~1K |
| Path-string addressing for tree state | Efficient expand/collapse tracking | ✓ Good — O(1) lookup for node state |
| Per-file version tracking | Incremental LanguageService updates on file change | ✓ Good — fixes stale type resolution |

---
*Last updated: 2026-03-10 after v1.0 milestone*
