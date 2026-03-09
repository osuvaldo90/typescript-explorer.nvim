# nvim-ts-type-explorer

## What This Is

An interactive TypeScript type explorer for Neovim. Shows the full, untruncated type of the symbol under the cursor in a side panel with a collapsible tree view. Powered by a long-running Node.js sidecar that interfaces with the TypeScript compiler API (or tsgo if its API is mature enough).

## Core Value

Users can see the complete, untruncated type of any TypeScript symbol instantly — no more hovering over truncated LSP tooltips.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] Side panel showing resolved type tree for symbol under cursor
- [ ] Collapsible object properties, union branches, intersection branches
- [ ] No type truncation (full type resolution)
- [ ] Syntax highlighting via treesitter
- [ ] Debounced updates on cursor move (replace previous tree entirely)
- [ ] Default expand depth of 1 level (root + immediate children)
- [ ] Node.js sidecar starts with Neovim, communicates over stdio JSON
- [ ] tsgo backend if API is viable, fallback to typescript npm package

### Out of Scope

- Non-TypeScript languages — plugin is TypeScript-only
- Type editing or refactoring — read-only exploration
- Inline virtual text — use existing tools (e.g., ts-type-inlay)
- Floating window mode — side panel only for v1
- History/pin support — panel replaces on cursor move, no back-navigation

## Context

- Neovim plugin ecosystem uses Lua for UI/keymaps/buffer management
- Node.js sidecar pattern is common (e.g., coc.nvim) — long-running process avoids startup cost per request
- TypeScript compiler API exposes `ts.TypeFormatFlags.NoTruncation` for full type strings
- tsgo (Go rewrite of TypeScript) may offer faster type resolution but API stability is unknown — needs research
- Tree rendering in Neovim can use virtual text, extmarks, or plain buffer lines with foldable markers

## Constraints

- **Platform**: Neovim 0.9+ (for modern extmark/float APIs)
- **Language**: Lua for plugin, TypeScript/Node.js for sidecar
- **Communication**: stdio JSON-RPC between Neovim and sidecar
- **Dependencies**: Minimal — treesitter for highlighting, typescript npm package (or tsgo) for type resolution

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Side panel over floating window | Persistent view better for type exploration | — Pending |
| Sidecar starts with Neovim | Always-ready, no cold start on first use | — Pending |
| Replace tree on cursor move | Simpler UX, no state management for history | — Pending |
| Default expand depth = 1 | Large types manageable, user drills into what they need | — Pending |
| Research tsgo first | Could be faster/lighter than Node.js typescript, worth investigating | — Pending |

---
*Last updated: 2026-03-09 after initialization*
