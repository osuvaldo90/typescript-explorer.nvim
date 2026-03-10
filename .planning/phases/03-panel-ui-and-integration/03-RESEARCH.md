# Phase 3: Panel UI and Integration - Research

**Researched:** 2026-03-09
**Domain:** Neovim Lua plugin UI -- side panel, tree rendering, autocmd-driven updates
**Confidence:** HIGH

## Summary

Phase 3 builds the user-facing side panel that renders an interactive type tree from TypeNode data returned by the sidecar's `resolve` RPC method. The core challenge is pure Neovim Lua buffer/window management: creating a persistent vertical split with a scratch buffer, rendering tree lines with expand/collapse markers, handling keyboard input for tree navigation, and debouncing CursorHold events to trigger automatic updates.

All necessary infrastructure exists: `rpc.request("resolve", ...)` returns TypeNode trees, `sidecar.is_running()` gates requests, and `config.lua` provides the extension pattern. The phase is purely additive Lua code -- no sidecar changes are needed.

**Primary recommendation:** Use `vim.api.nvim_open_win()` with `split` parameter (available since Neovim 0.10) for window creation, a flat array tree-state model for rendering, and `vim.uv.new_timer()` for debounce. Keep all panel logic in a single `lua/ts-explorer/panel.lua` module with a thin `tree.lua` module for TypeNode-to-lines conversion.

<user_constraints>
## User Constraints (from CONTEXT.md)

### Locked Decisions
- Arrow markers for expand/collapse state: ▸ for collapsed, ▾ for expanded, no marker for leaf nodes
- Node format: `name: typeString` -- matches TypeScript syntax feel
- Modifiers inline: `readonly name?: string` -- TypeScript-native style
- Union branches and function params rendered as child nodes; root shows summary type string
- Function return type shown as `[return]: Type` child node
- Enter (`<CR>`) toggles expand/collapse on a node
- `L` expands all children recursively under cursor
- `H` collapses all children recursively under cursor
- `q` and `<Esc>` both close the panel
- All keymaps configurable via `setup({ panel = { keymaps = { ... } } })`
- Default position: left side
- Default width: 40 columns
- Both configurable via `setup({ panel = { width = 40, position = 'left' } })`
- Resizable with standard Neovim split commands (Ctrl+W < / >) -- no winfixwidth
- Toggle command: `:TsExplorer` (open/close)
- Keep last result when cursor is on whitespace/non-symbol -- no flicker
- 150ms debounce on CursorHold
- Only triggers in typescript and typescriptreact filetypes
- Cancel in-flight request when cursor moves again -- always show latest position's type

### Claude's Discretion
- Buffer setup (scratch, nofile, etc.) and window options
- How to compute cursor byte offset from Neovim (line, col) for the sidecar's `position` param
- Internal tree state data structure
- Highlight groups for tree nodes
- Exact debounce implementation mechanism

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope
</user_constraints>

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| PANE-01 | User can open a persistent side panel (vertical split) showing the type tree | `nvim_open_win()` with `split` param creates vertical splits; scratch buffer with `buftype=nofile` |
| PANE-02 | Tree nodes are collapsible/expandable with keyboard controls | Buffer-local keymaps via `vim.keymap.set` with `buffer` option; tree state tracks expanded node set |
| PANE-03 | Default expand depth is 1 level (root + immediate children) | Tree renderer walks TypeNode children to depth=1 on initial render |
| PANE-04 | Panel updates automatically on cursor move (debounced) | CursorHold autocmd on ts/tsx filetypes + `vim.uv.new_timer()` debounce |
| PANE-05 | Panel replaces the entire tree when cursor moves to a new symbol | Clear and re-render buffer on each resolve response; keep last result on null response |
| PANE-06 | User can open/close the panel with a command | `:TsExplorer` toggle command checks `vim.api.nvim_win_is_valid()` to decide open vs close |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Neovim Lua API | 0.10+ | Window/buffer management, autocmds, keymaps | Native API; `nvim_open_win` split support added in 0.10 |
| vim.uv (libuv) | built-in | Timer for debounce | Ships with Neovim, no dependencies; `vim.uv.new_timer()` |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| vim.json | built-in | Already used by rpc.lua | N/A (existing) |
| vim.fn | built-in | `line2byte`, `col`, `expand` for byte offset | Computing cursor position for sidecar |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| `nvim_open_win(split)` | `vim.cmd("vsplit")` | cmd approach works but less precise control over target window; `nvim_open_win` is the modern API |
| `vim.uv.new_timer()` | `vim.defer_fn` | `defer_fn` cannot be cancelled/reset; timer is needed for proper debounce |
| Custom tree renderer | nui.nvim | External dependency; project is zero-dep Lua plugin |

## Architecture Patterns

### Recommended Project Structure
```
lua/ts-explorer/
├── init.lua          # setup() entrypoint (exists)
├── config.lua        # config defaults + get() (exists, extend)
├── sidecar.lua       # sidecar lifecycle (exists)
├── rpc.lua           # request/response (exists)
├── log.lua           # logging (exists)
├── panel.lua         # NEW: window/buffer lifecycle, autocmds, debounce
└── tree.lua          # NEW: TypeNode -> line rendering, expand/collapse state
plugin/
└── ts-explorer.lua   # command registration (exists, extend)
```

### Pattern 1: Panel Module (Window + Buffer Lifecycle)

**What:** Single module manages the panel window and buffer, owns the autocmd group, handles toggle.
**When to use:** Always -- this is the panel entry point.

```lua
-- panel.lua sketch
local M = {}
local state = {
  bufnr = nil,    -- scratch buffer (persists across open/close)
  winid = nil,    -- window handle (nil when closed)
  tree = nil,     -- current tree state (from tree.lua)
  timer = nil,    -- debounce timer
  request_id = 0, -- monotonic counter for cancellation
  augroup = nil,  -- autocmd group id
}

function M.open()
  if state.winid and vim.api.nvim_win_is_valid(state.winid) then
    return -- already open
  end
  -- Create buffer if needed
  if not state.bufnr or not vim.api.nvim_buf_is_valid(state.bufnr) then
    state.bufnr = vim.api.nvim_create_buf(false, true) -- nofile scratch
    vim.bo[state.bufnr].buftype = "nofile"
    vim.bo[state.bufnr].bufhidden = "hide"
    vim.bo[state.bufnr].swapfile = false
    vim.bo[state.bufnr].filetype = "tsexplorer"
    M._setup_keymaps()
  end
  -- Open split window
  local config = require("ts-explorer.config").get()
  local position = (config.panel and config.panel.position) or "left"
  local width = (config.panel and config.panel.width) or 40
  state.winid = vim.api.nvim_open_win(state.bufnr, false, {
    split = position, -- "left" or "right"
    win = 0,
    width = width,
  })
  -- Window options
  vim.wo[state.winid].number = false
  vim.wo[state.winid].relativenumber = false
  vim.wo[state.winid].signcolumn = "no"
  vim.wo[state.winid].cursorline = true
  vim.wo[state.winid].wrap = false
  vim.wo[state.winid].spell = false
  M._setup_autocmds()
end

function M.close()
  if state.winid and vim.api.nvim_win_is_valid(state.winid) then
    vim.api.nvim_win_close(state.winid, true)
  end
  state.winid = nil
  M._teardown_autocmds()
end

function M.toggle()
  if state.winid and vim.api.nvim_win_is_valid(state.winid) then
    M.close()
  else
    M.open()
  end
end
```

### Pattern 2: Tree State Model

**What:** Flat rendering model: TypeNode tree + expanded set = rendered lines with line-to-node mapping.
**When to use:** For all tree rendering and interaction.

```lua
-- tree.lua sketch
local M = {}

-- Tree state: holds the root TypeNode and which paths are expanded
-- A "path" is a string like "0" (root), "0.1" (second child of root), "0.1.3" etc.
function M.new(type_node)
  return {
    root = type_node,
    expanded = {}, -- set of path strings that are expanded
  }
end

-- Expand root + immediate children by default (depth=1)
function M.expand_default(tree_state)
  tree_state.expanded["0"] = true
  -- root's children are at depth 1, they start collapsed
end

-- Render tree to lines + build line-to-path mapping
-- Returns { lines = string[], line_map = path[] }
function M.render(tree_state)
  local lines = {}
  local line_map = {}
  M._render_node(tree_state, tree_state.root, "0", 0, lines, line_map)
  return { lines = lines, line_map = line_map }
end

function M._render_node(tree_state, node, path, depth, lines, line_map)
  local indent = string.rep("  ", depth)
  local has_children = node.children and #node.children > 0
  local is_expanded = tree_state.expanded[path]

  local marker = ""
  if has_children then
    marker = is_expanded and "▾ " or "▸ "
  else
    marker = "  " -- align with markers
  end

  local prefix = ""
  if node.readonly then prefix = "readonly " end
  local suffix = node.optional and "?" or ""

  local line = indent .. marker .. prefix .. node.name .. suffix .. ": " .. node.typeString
  table.insert(lines, line)
  table.insert(line_map, path)

  if has_children and is_expanded then
    for i, child in ipairs(node.children) do
      M._render_node(tree_state, child, path .. "." .. (i - 1), depth + 1, lines, line_map)
    end
  end
end
```

### Pattern 3: Debounce with Request Cancellation

**What:** CursorHold fires debounced resolve requests; each new request invalidates previous in-flight ones.
**When to use:** For cursor-follow behavior.

```lua
-- Inside panel.lua
function M._on_cursor_hold()
  -- Only in ts/tsx buffers
  local ft = vim.bo.filetype
  if ft ~= "typescript" and ft ~= "typescriptreact" then
    return
  end
  -- Don't trigger from the panel buffer itself
  if vim.api.nvim_get_current_buf() == state.bufnr then
    return
  end
  -- Cancel any pending timer
  if state.timer then
    state.timer:stop()
  else
    state.timer = vim.uv.new_timer()
  end
  state.timer:start(150, 0, vim.schedule_wrap(function()
    M._resolve_at_cursor()
  end))
end

function M._resolve_at_cursor()
  if not require("ts-explorer.sidecar").is_running() then
    return
  end
  local bufnr = vim.api.nvim_get_current_buf()
  local file = vim.api.nvim_buf_get_name(bufnr)
  if file == "" then return end

  -- Compute byte offset: line2byte(line) + col - 1
  local cursor = vim.api.nvim_win_get_cursor(0)
  local line = cursor[1]
  local col = cursor[2] -- 0-based
  local byte_offset = vim.fn.line2byte(line) + col - 1
  -- line2byte returns 1-based byte, so byte_offset = line2byte(line) - 1 + col
  -- Actually: line2byte(line) gives byte of first char on that line (1-based)
  -- TypeScript position is 0-based, so: position = line2byte(line) - 1 + col

  -- Increment request_id for cancellation
  state.request_id = state.request_id + 1
  local my_id = state.request_id

  require("ts-explorer.rpc").request("resolve", {
    filePath = file,
    position = byte_offset,
  }, function(err, result)
    -- Cancel if a newer request was sent
    if my_id ~= state.request_id then return end
    if err then return end
    if result and result.node then
      M._update_tree(result.node)
    end
    -- If result.node is nil, keep last result (no flicker)
  end)
end
```

### Pattern 4: Byte Offset Computation

**What:** Convert Neovim cursor (1-based line, 0-based col) to TypeScript file position (0-based byte offset).
**When to use:** Every resolve request.

```lua
-- vim.fn.line2byte(lnum) returns the byte offset of the first character
-- of line lnum, 1-based. For an empty buffer it returns -1.
-- TypeScript positions are 0-based byte offsets in the file.
--
-- Formula: position = vim.fn.line2byte(line) - 1 + col
-- where line is 1-based (from nvim_win_get_cursor) and col is 0-based
```

**Important:** `line2byte()` counts newline characters. TypeScript's SourceFile positions also count newlines. This means the formula works directly -- no newline conversion needed.

### Anti-Patterns to Avoid
- **Setting winfixwidth:** User explicitly wants resizable panels with Ctrl+W commands.
- **Using vim.defer_fn for debounce:** Cannot be cancelled/reset; use vim.uv timer instead.
- **Re-creating the buffer on every open:** Buffer should persist across toggle cycles to avoid leaking buffer handles.
- **Triggering resolve from panel buffer:** Guard against CursorHold firing when user navigates the panel itself.
- **Using vim.cmd("vsplit") instead of nvim_open_win:** The cmd approach doesn't give precise control over split direction or target window.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Debounce timer | Custom coroutine wrapper | `vim.uv.new_timer()` with `:start(ms, 0, callback)` | Built-in libuv, handles edge cases |
| JSON encoding | String concatenation | `vim.json.encode` / `vim.json.decode` | Already used by rpc.lua |
| Window split | Manual vim commands | `vim.api.nvim_open_win(buf, enter, {split=..., win=0})` | Neovim 0.10+ native API |
| Config merging | Manual table merge | `vim.tbl_deep_extend("force", defaults, opts)` | Already established pattern |

**Key insight:** This phase uses only Neovim built-in APIs. No external dependencies needed.

## Common Pitfalls

### Pitfall 1: line2byte returns -1 on empty buffer
**What goes wrong:** Calling `vim.fn.line2byte(1)` on an empty buffer returns -1, causing negative byte offsets.
**Why it happens:** Neovim returns -1 when the buffer has no content or 'byte' features are disabled.
**How to avoid:** Guard: `if byte_offset < 0 then return end` before sending RPC request.
**Warning signs:** Sidecar returns null for positions that should have types.

### Pitfall 2: nvim_buf_set_lines requires modifiable=true
**What goes wrong:** Cannot update panel buffer content if `modifiable` is false.
**Why it happens:** Scratch buffers are often set to `nomodifiable` for safety.
**How to avoid:** Temporarily set `vim.bo[bufnr].modifiable = true` before `nvim_buf_set_lines`, then set it back to `false` after.
**Warning signs:** "E21: Cannot make changes, 'modifiable' is off" errors.

### Pitfall 3: Autocmd fires in wrong buffer context
**What goes wrong:** CursorHold callback reads wrong buffer's filetype or cursor position.
**Why it happens:** By the time the debounced callback fires, the user may have switched buffers.
**How to avoid:** Capture `bufnr` and file path at CursorHold time, pass them through the debounce; in the callback, verify the buffer is still current.
**Warning signs:** Panel shows types for wrong file or position.

### Pitfall 4: Window handle becomes invalid
**What goes wrong:** Trying to update a closed panel window causes errors.
**Why it happens:** User closes panel with `:q` or `:close` instead of `:TsExplorer`.
**How to avoid:** Always check `vim.api.nvim_win_is_valid(state.winid)` before operations. Add a `WinClosed` autocmd to clean up state.
**Warning signs:** "Invalid window id" errors in vim.notify.

### Pitfall 5: RPC callback fires after panel closed
**What goes wrong:** Async RPC callback tries to write to a buffer/window that no longer exists.
**Why it happens:** User closes panel while a resolve request is in flight.
**How to avoid:** Check `state.winid` validity in the callback before rendering.
**Warning signs:** Sporadic "Invalid window" or "Invalid buffer" errors.

### Pitfall 6: CursorHold updatetime interaction
**What goes wrong:** CursorHold fires based on Neovim's `updatetime` option (default 4000ms), making the panel feel sluggish.
**Why it happens:** The 150ms debounce timer only starts after CursorHold fires; CursorHold itself depends on `updatetime`.
**How to avoid:** Document that users should set `updatetime` to a low value (e.g., 300) for responsive behavior, which is standard for any CursorHold-based plugin. Alternatively, also listen to `CursorMoved` (or `CursorMovedI`) and debounce those events instead.
**Warning signs:** Panel updates feel slow regardless of debounce setting.

## Code Examples

### Creating the Split Window (Neovim 0.10+ API)
```lua
-- Source: Neovim API docs (nvim_open_win)
-- split values: "left", "right", "above", "below"
-- win=0 means split relative to current window
-- win=-1 means create a top-level split (full height/width)
local winid = vim.api.nvim_open_win(bufnr, false, {
  split = "left",   -- or "right"
  win = 0,           -- split current window
  width = 40,
})
```

### Scratch Buffer Setup
```lua
local bufnr = vim.api.nvim_create_buf(false, true) -- listed=false, scratch=true
vim.bo[bufnr].buftype = "nofile"
vim.bo[bufnr].bufhidden = "hide"  -- keep buffer when window closes
vim.bo[bufnr].swapfile = false
vim.bo[bufnr].modifiable = false  -- set true only when updating content
vim.bo[bufnr].filetype = "tsexplorer"
```

### Updating Buffer Content
```lua
vim.bo[bufnr].modifiable = true
vim.api.nvim_buf_set_lines(bufnr, 0, -1, false, lines)
vim.bo[bufnr].modifiable = false
```

### Buffer-Local Keymaps
```lua
local opts = { buffer = bufnr, noremap = true, silent = true }
vim.keymap.set("n", "<CR>", function() panel.toggle_node() end, opts)
vim.keymap.set("n", "L", function() panel.expand_recursive() end, opts)
vim.keymap.set("n", "H", function() panel.collapse_recursive() end, opts)
vim.keymap.set("n", "q", function() panel.close() end, opts)
vim.keymap.set("n", "<Esc>", function() panel.close() end, opts)
```

### Debounce Timer
```lua
-- Source: vim.uv (libuv bindings built into Neovim)
local timer = vim.uv.new_timer()

-- Start/reset debounce (150ms, no repeat)
timer:stop()  -- cancel any pending fire
timer:start(150, 0, vim.schedule_wrap(function()
  -- This runs on the main Neovim event loop
  do_resolve()
end))

-- Cleanup when panel closes
timer:stop()
timer:close()
```

### Autocmd Group Pattern
```lua
local group = vim.api.nvim_create_augroup("TsExplorerPanel", { clear = true })
vim.api.nvim_create_autocmd("CursorHold", {
  group = group,
  pattern = { "*.ts", "*.tsx" },
  callback = function(ev)
    panel.on_cursor_hold(ev.buf)
  end,
})
vim.api.nvim_create_autocmd("WinClosed", {
  group = group,
  callback = function(ev)
    if tonumber(ev.match) == state.winid then
      state.winid = nil
    end
  end,
})
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vim.cmd("vsplit")` + manual buffer | `nvim_open_win({split=...})` | Neovim 0.10 (2024) | Precise split direction control via Lua API |
| `vim.loop.new_timer()` | `vim.uv.new_timer()` | Neovim 0.10 | `vim.loop` deprecated in favor of `vim.uv` |
| `nvim_buf_set_option()` | `vim.bo[bufnr].option` | Neovim 0.9+ | Shorter syntax, same functionality |
| `nvim_win_set_option()` | `vim.wo[winid].option` | Neovim 0.9+ | Shorter syntax, same functionality |

**Deprecated/outdated:**
- `vim.loop`: Use `vim.uv` instead (same libuv bindings, renamed)
- `nvim_buf_set_option()` / `nvim_win_set_option()`: Use `vim.bo[]` / `vim.wo[]` meta-accessors

## Open Questions

1. **CursorHold vs CursorMoved for responsiveness**
   - What we know: CursorHold depends on `updatetime` (default 4000ms). CursorMoved fires on every cursor movement.
   - What's unclear: Whether CursorHold alone gives acceptable UX, or if CursorMoved with debounce is needed.
   - Recommendation: Start with CursorHold (simpler, matches CONTEXT.md "150ms debounce on CursorHold"). If too sluggish, the debounce timer on CursorMoved is a drop-in replacement. Note in docs that `updatetime` should be low.

2. **Highlight groups for tree nodes**
   - What we know: CONTEXT.md leaves this to Claude's discretion. Syntax highlighting is v2 (UIPOL-01).
   - What's unclear: Whether basic highlight groups are expected in v1.
   - Recommendation: Define a few highlight groups (TsExplorerMarker, TsExplorerName, TsExplorerType) using `nvim_buf_add_highlight` or extmarks, but keep it minimal. A `filetype=tsexplorer` enables users to add their own syntax files later.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Node.js built-in test runner via tsx |
| Config file | sidecar/package.json `scripts.test` |
| Quick run command | `cd sidecar && npm test` |
| Full suite command | `make test` |

### Phase Requirements -> Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| PANE-01 | Open persistent side panel | manual-only | N/A (requires Neovim runtime) | N/A |
| PANE-02 | Expand/collapse with keyboard | manual-only | N/A (requires Neovim runtime) | N/A |
| PANE-03 | Default expand depth is 1 | unit (tree renderer) | `cd sidecar && npx tsx --test src/tree.test.ts` | No -- Wave 0 |
| PANE-04 | Auto-update on cursor move | manual-only | N/A (requires Neovim runtime) | N/A |
| PANE-05 | Replace tree on new symbol | manual-only | N/A (requires Neovim runtime) | N/A |
| PANE-06 | Open/close with command | manual-only | N/A (requires Neovim runtime) | N/A |

**Note:** Most panel requirements are UI/interaction tests that require a running Neovim instance. The tree rendering logic (TypeNode to lines) can be unit tested in isolation as pure Lua logic. However, the project uses Node.js tests for the sidecar only. Lua-side testing would require plenary.nvim or similar, which is not in the current stack.

**Manual-only justification:** Panel behavior involves Neovim window management, autocmds, and user interaction that cannot be tested without a full Neovim runtime environment. These should be verified via manual UAT.

### Sampling Rate
- **Per task commit:** Manual verification in Neovim (open panel, navigate, check rendering)
- **Per wave merge:** `make test` (sidecar tests still pass -- no regressions)
- **Phase gate:** Full manual UAT against all PANE requirements

### Wave 0 Gaps
- None required -- this phase is pure Lua with no sidecar test files needed. The tree rendering logic lives in Lua, and the existing sidecar test infrastructure remains unchanged. Manual verification covers all requirements.

## Sources

### Primary (HIGH confidence)
- Neovim API docs (api.txt v0.10.0) - `nvim_open_win` split parameter: `split` accepts "left", "right", "above", "below"; `vertical` boolean; `win` for target window
- Neovim API docs - buffer/window option accessors (`vim.bo[]`, `vim.wo[]`)
- Existing codebase - `rpc.lua`, `sidecar.lua`, `config.lua`, `types.ts` patterns

### Secondary (MEDIUM confidence)
- [Neovim throttle & debounce gist](https://gist.github.com/runiq/31aa5c4bf00f8e0843cd267880117201) - `vim.uv.new_timer()` debounce pattern
- [Neovim 0.10 news](https://neovim.io/doc/user/news-0.10/) - nvim_open_win split window support confirmed
- [Neovim vim.debounce() proposal](https://github.com/neovim/neovim/issues/33179) - confirms no built-in debounce yet, timer approach is correct
- [Neovim Lua plugin UI guide](https://www.2n.pl/blog/how-to-make-ui-for-neovim-plugins-in-lua) - scratch buffer patterns

### Tertiary (LOW confidence)
- None

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all Neovim built-in APIs, verified against v0.10 docs
- Architecture: HIGH - patterns match established plugins (nvim-tree, outline.nvim, neo-tree)
- Pitfalls: HIGH - common Neovim plugin pitfalls well-documented in community

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable Neovim API, 30-day validity)
