# Phase 3: Panel UI and Integration - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Interactive side panel that renders a live, expandable/collapsible type tree for the symbol under the cursor. The panel updates automatically on cursor move (debounced). Navigation (go-to-definition), syntax highlighting, icons, and pin/lock are v2 features — out of scope.

</domain>

<decisions>
## Implementation Decisions

### Tree rendering format
- Arrow markers for expand/collapse state: ▸ for collapsed, ▾ for expanded, no marker for leaf nodes
- Node format: `name: typeString` — matches TypeScript syntax feel
- Modifiers inline: `readonly name?: string` — TypeScript-native style
- Union branches and function params rendered as child nodes; root shows summary type string
- Function return type shown as `[return]: Type` child node

### Keyboard controls
- Enter (`<CR>`) toggles expand/collapse on a node
- `L` expands all children recursively under cursor
- `H` collapses all children recursively under cursor
- `q` and `<Esc>` both close the panel
- All keymaps configurable via `setup({ panel = { keymaps = { ... } } })`

### Panel position & sizing
- Default position: left side
- Default width: 40 columns
- Both configurable via `setup({ panel = { width = 40, position = 'left' } })`
- Resizable with standard Neovim split commands (Ctrl+W < / >) — no winfixwidth
- Toggle command: `:TsExplorer` (open/close)

### Cursor-follow behavior
- Keep last result when cursor is on whitespace/non-symbol — no flicker
- 150ms debounce on CursorHold
- Only triggers in typescript and typescriptreact filetypes
- Cancel in-flight request when cursor moves again — always show latest position's type

### Claude's Discretion
- Buffer setup (scratch, nofile, etc.) and window options
- How to compute cursor byte offset from Neovim (line, col) for the sidecar's `position` param
- Internal tree state data structure
- Highlight groups for tree nodes
- Exact debounce implementation mechanism

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- `lua/ts-explorer/rpc.lua`: Request/response layer — call `rpc.request("resolve", {filePath, position}, callback)` for type resolution
- `lua/ts-explorer/sidecar.lua`: Sidecar lifecycle management with crash recovery — panel just needs to check `sidecar.is_running()`
- `lua/ts-explorer/config.lua`: Config system with `defaults`, `setup(opts)`, `get()` — extend for panel options
- `sidecar/src/types.ts`: TypeNode interface with `kind`, `name`, `typeString`, `optional?`, `readonly?`, `children?` — direct mapping to tree rendering

### Established Patterns
- LazyVim-compatible plugin structure
- Config via `vim.tbl_deep_extend("force", defaults, opts)`
- Sidecar communication via NDJSON over stdio
- Error handling via `vim.notify` at ERROR level
- `:TsExplorerRestart` command pattern for user commands

### Integration Points
- `rpc.request("resolve", ...)` — sends file path + position, gets TypeNode back
- `config.lua` — extend defaults with panel section (width, position, keymaps)
- `init.lua` — add `:TsExplorer` command registration
- Plugin directory: `plugin/ts-explorer.lua` — register autocmds and commands on load
- CursorHold autocmd on typescript/typescriptreact filetypes

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 03-panel-ui-and-integration*
*Context gathered: 2026-03-09*
