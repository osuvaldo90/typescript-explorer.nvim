# Architecture Patterns

**Domain:** Neovim TypeScript type explorer plugin with Node.js sidecar
**Researched:** 2026-03-09

## Recommended Architecture

Two-process model: a thin Lua plugin in Neovim handles UI, keymaps, and buffer rendering, while a long-running Node.js sidecar process handles TypeScript compiler API operations. Communication is over stdio using newline-delimited JSON (NDJSON) with a simple request/response protocol.

```
+--------------------------------------------------+
|                   Neovim Process                  |
|                                                   |
|  +-------------------+    +--------------------+  |
|  | lua/ts-explorer/  |    | Side Panel Buffer  |  |
|  |   init.lua        |--->| (scratch, nofile,  |  |
|  |   sidecar.lua     |    |  nomodifiable)     |  |
|  |   protocol.lua    |    +--------------------+  |
|  |   renderer.lua    |            ^               |
|  |   tree.lua        |            |               |
|  +--------+----------+    renders tree lines      |
|           |                       |               |
|      stdin/stdout           +-----+--------+      |
|      (NDJSON)               | renderer.lua |      |
|           |                 +--------------+      |
+-----------+--------------------------------------+
            |
            v
+--------------------------------------------------+
|              Node.js Sidecar Process              |
|                                                   |
|  +----------------+    +----------------------+   |
|  | stdio server   |--->| TypeScript Compiler  |   |
|  | (line reader)  |    | API (LanguageService)|   |
|  +----------------+    +----------+-----------+   |
|                                   |               |
|                         +---------+---------+     |
|                         | Type Tree Builder |     |
|                         | (recursive walk)  |     |
|                         +-------------------+     |
+--------------------------------------------------+
```

### Component Boundaries

| Component | Responsibility | Communicates With |
|-----------|---------------|-------------------|
| `lua/ts-explorer/init.lua` | Plugin entry point, setup(), user commands, autocommands | All Lua modules |
| `lua/ts-explorer/sidecar.lua` | Spawn/kill/restart Node.js process via `vim.fn.jobstart()` | Node.js process (stdio) |
| `lua/ts-explorer/protocol.lua` | Serialize requests, deserialize responses, match request IDs, handle timeouts | sidecar.lua (sends/receives raw data) |
| `lua/ts-explorer/renderer.lua` | Convert type tree JSON into buffer lines with indentation, icons, highlights | tree.lua (tree state), side panel buffer |
| `lua/ts-explorer/tree.lua` | Track expand/collapse state per node, manage tree node data structure | renderer.lua |
| `lua/ts-explorer/panel.lua` | Create/manage side panel window, scratch buffer setup, window options | renderer.lua |
| `node/src/server.ts` | Read stdin line-by-line, parse JSON requests, dispatch to handlers, write JSON responses to stdout | TypeScript service |
| `node/src/service.ts` | Create and manage `ts.createLanguageService`, resolve tsconfig, handle file changes | TypeScript compiler API |
| `node/src/type-tree.ts` | Walk type recursively via `checker.getPropertiesOfType()`, build serializable tree structure | service.ts (gets TypeChecker) |

### Data Flow

**Request flow (cursor move triggers type lookup):**

```
1. User moves cursor in .ts file
2. CursorHold autocommand fires (debounced)
3. init.lua reads cursor position + buffer file path
4. protocol.lua serializes: {"id": 1, "method": "getTypeTree", "params": {"file": "...", "line": 10, "character": 5}}
5. sidecar.lua sends JSON + newline to stdin of Node.js process
6. Node.js server.ts reads line, parses JSON, dispatches to service
7. service.ts uses LanguageService to get TypeChecker at position
8. type-tree.ts recursively walks type, builds tree structure
9. server.ts writes response JSON + newline to stdout
10. sidecar.lua receives on_stdout callback with data
11. protocol.lua deserializes, matches response to request ID
12. tree.lua receives type tree, merges with existing expand/collapse state
13. renderer.lua converts tree to buffer lines with indent + icons
14. panel.lua sets buffer lines (briefly set modifiable, write, unset)
```

**Expand/collapse flow (user toggles node):**

```
1. User presses <CR> or toggle key on a tree line
2. tree.lua updates expand/collapse state for that node
3. If expanding and children not yet loaded:
   a. protocol.lua sends getTypeChildren request for that node's type
   b. Response merges into tree state
4. renderer.lua re-renders full tree from current state
5. panel.lua updates buffer
```

## Key Architecture Decisions

### Use `vim.fn.jobstart()` for sidecar, NOT `vim.system()`

**Rationale:** `vim.fn.jobstart()` supports the `rpc` option and provides `chansend()` for writing to stdin. While `vim.system()` is the newer Lua-native API (Neovim 0.10+), it lacks RPC channel support and has documented issues with parallel output handling. For a long-running bidirectional stdio process, `jobstart()` is the proven pattern used by coc.nvim and similar plugins.

**Confidence:** HIGH -- based on Neovim docs and coc.nvim precedent.

### Use NDJSON protocol, NOT msgpack-RPC

**Rationale:** msgpack-RPC is what Neovim uses internally for its own remote plugin protocol, but it adds unnecessary complexity for our use case. We control both sides of the protocol and only need simple request/response semantics. Newline-delimited JSON is human-debuggable, trivial to implement on both sides, and sufficient for our message sizes (type trees are typically a few KB). The LSP protocol uses a Content-Length header approach, but that is also overkill here.

**Protocol format:**
```
Request:  {"id": <number>, "method": "<string>", "params": {<object>}}\n
Response: {"id": <number>, "result": {<object>}}\n
Error:    {"id": <number>, "error": {"code": <number>, "message": "<string>"}}\n
```

**Confidence:** HIGH -- simple, proven, debuggable.

### Use `ts.createLanguageService()` for the TypeScript backend, NOT `ts.createProgram()`

**Rationale:** `createLanguageService()` wraps `createProgram()` internally but adds crucial incremental behavior -- it only re-checks what changed. For a long-running sidecar that serves many requests as the user navigates, this avoids re-parsing the entire project on every cursor move. The LanguageService maintains internal caches and updates them incrementally when files change. `createProgram()` would require manually re-creating the program on every change, which is expensive for large projects.

The alternative of using `ts.server` (the full tsserver protocol) is overkill -- that is designed for full IDE features (completions, diagnostics, refactoring). We only need type resolution.

**Confidence:** HIGH -- based on TypeScript wiki documentation and the LanguageService's design for exactly this editor-integration scenario.

### Use plain buffer lines + extmarks for tree rendering, NOT native Vim folds

**Rationale:** Plugins like outline.nvim and neo-tree render trees by writing plain text lines (with unicode tree guide characters like `├`, `└`, `│`) into a scratch buffer, then applying extmark-based highlights for syntax coloring. This gives full control over the visual representation. Native Vim folds (`foldmethod=expr`) are fragile, interact poorly with extmarks, and don't support the per-node expand/collapse UX we need (where expanding a node inserts new lines rather than unfolding existing hidden lines).

**Tree rendering approach:**
```
-- Each line in the buffer maps to a tree node
-- Indentation is spaces/guides, node content is the type info
-- Extmarks add highlights (type names, punctuation, etc.)

"▼ Props"                    -- expanded node, depth 0
"  ├─ name: string"          -- leaf, depth 1
"  ├─ ▶ style: CSSProperties"  -- collapsed node, depth 1
"  └─ onClick: () => void"   -- leaf, depth 1
```

**Confidence:** HIGH -- this is the standard pattern used by neo-tree, outline.nvim, nvim-tree.lua.

### Scratch buffer in a vertical split for the side panel

**Buffer setup:**
```lua
local buf = vim.api.nvim_create_buf(false, true)  -- nofile, scratch
vim.bo[buf].buftype = "nofile"
vim.bo[buf].bufhidden = "wipe"
vim.bo[buf].swapfile = false
vim.bo[buf].modifiable = false
-- Open in vertical split
vim.cmd("vsplit")
vim.api.nvim_win_set_buf(win, buf)
vim.api.nvim_win_set_width(win, 40)
```

**Confidence:** HIGH -- standard Neovim plugin pattern.

## Patterns to Follow

### Pattern 1: Request-Response Correlation with IDs

**What:** Every request to the sidecar includes a monotonically increasing integer ID. The sidecar echoes the ID in the response. The Lua side maintains a table of pending callbacks keyed by ID.

**When:** Every sidecar communication.

**Example:**
```lua
-- protocol.lua
local M = {}
local pending = {}
local next_id = 1

function M.request(method, params, callback)
  local id = next_id
  next_id = next_id + 1
  pending[id] = callback
  local msg = vim.json.encode({ id = id, method = method, params = params })
  -- send via sidecar channel
  sidecar.send(msg .. "\n")
end

function M.on_response(data)
  local msg = vim.json.decode(data)
  local cb = pending[msg.id]
  if cb then
    pending[msg.id] = nil
    cb(msg.error, msg.result)
  end
end

return M
```

### Pattern 2: Debounced Cursor Updates

**What:** Use `CursorHold` autocommand (fires after `updatetime` ms of inactivity) rather than `CursorMoved` (fires on every movement). This naturally debounces requests.

**When:** Triggering type lookups on cursor movement.

**Example:**
```lua
vim.api.nvim_create_autocmd("CursorHold", {
  pattern = "*.ts,*.tsx",
  callback = function()
    local pos = vim.api.nvim_win_get_cursor(0)
    local file = vim.api.nvim_buf_get_name(0)
    protocol.request("getTypeTree", {
      file = file,
      line = pos[1] - 1,  -- 0-indexed for TS
      character = pos[2],
    }, function(err, result)
      if not err then
        tree.update(result)
        renderer.render()
      end
    end)
  end,
})
```

### Pattern 3: Lazy Sidecar Start

**What:** Start the sidecar on first use (first TypeScript file opened), not at Neovim startup. This avoids unnecessary Node.js processes when editing non-TypeScript files.

**When:** Plugin initialization.

**Why:** Reduces startup cost. The sidecar should start when the user first opens a `.ts`/`.tsx` file or explicitly invokes the plugin.

### Pattern 4: Recursive Type Tree Building with Depth Limits

**What:** The sidecar walks the type tree recursively but with a configurable max depth to prevent infinite recursion on circular types and to keep response sizes manageable. Additional depth is fetched on-demand when the user expands a node.

**When:** Processing every type resolution request.

**Example (TypeScript side):**
```typescript
function buildTypeTree(
  checker: ts.TypeChecker,
  type: ts.Type,
  depth: number,
  maxDepth: number
): TypeNode {
  const node: TypeNode = {
    name: checker.typeToString(type, undefined, ts.TypeFormatFlags.NoTruncation),
    kind: getTypeKind(type),
    expandable: false,
    children: [],
  };

  if (depth >= maxDepth) {
    node.expandable = hasExpandableMembers(type);
    return node;
  }

  if (type.isUnion()) {
    node.children = type.types.map(t => buildTypeTree(checker, t, depth + 1, maxDepth));
    node.expandable = node.children.length > 0;
  } else if (type.getProperties().length > 0) {
    for (const prop of type.getProperties()) {
      const propType = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration!);
      const child = buildTypeTree(checker, propType, depth + 1, maxDepth);
      child.name = prop.getName() + ": " + child.name;
      node.children.push(child);
    }
    node.expandable = node.children.length > 0;
  }

  return node;
}
```

## Anti-Patterns to Avoid

### Anti-Pattern 1: Writing to stdout in Node.js sidecar for logging

**What:** Using `console.log()` or `process.stdout.write()` for debug logging in the Node.js sidecar.

**Why bad:** stdout is the communication channel. Any non-protocol output corrupts the message stream and causes parse errors on the Lua side. This is a documented problem in the Neovim node-client ecosystem.

**Instead:** Log to stderr (`console.error()` or a file-based logger). Neovim's `jobstart` can capture stderr separately via `on_stderr` callback.

### Anti-Pattern 2: Re-creating TypeScript program on every request

**What:** Calling `ts.createProgram()` fresh for each type lookup request.

**Why bad:** Program creation parses all files in the project. For a large codebase this takes seconds. The sidecar receives requests on every cursor hold event.

**Instead:** Use `ts.createLanguageService()` which maintains incremental state. Only notify it of file changes when buffers are modified.

### Anti-Pattern 3: Using `vim.system()` for long-running bidirectional stdio

**What:** Using `vim.system()` to spawn the sidecar process.

**Why bad:** `vim.system()` is designed for short-lived commands. It lacks `chansend()` for ongoing stdin writes, doesn't integrate with Neovim's channel system, and has documented issues with parallel output.

**Instead:** Use `vim.fn.jobstart()` with `on_stdout`, `on_stderr`, and `on_exit` callbacks. Use `vim.fn.chansend(job_id, data)` to write to stdin.

### Anti-Pattern 4: Rendering the entire type as a single string

**What:** Using `typeToString(type, undefined, TypeFormatFlags.NoTruncation)` and dumping the full string into the buffer.

**Why bad:** Large types produce massive strings (thousands of characters). No interactivity, no expand/collapse, poor readability.

**Instead:** Build a structured tree on the Node.js side, send it as JSON, render it as an interactive tree in the buffer.

### Anti-Pattern 5: Infinite recursion on circular types

**What:** Recursively walking type properties without cycle detection or depth limits.

**Why bad:** TypeScript types can be self-referential (e.g., `type Node = { children: Node[] }`). Without guards, the sidecar hangs or crashes. The TypeScript issue tracker documents `typeToTypeNode` going into infinite loops on certain types.

**Instead:** Track visited type IDs in a Set during recursion. Enforce a max depth. Mark circular references with a `[Circular]` indicator.

## Lua Plugin Directory Structure

```
typescript-explorer.nvim/
├── plugin/
│   └── ts-explorer.lua          # Entry point: define commands, minimal
├── lua/
│   └── ts-explorer/
│       ├── init.lua              # setup() function, user config merge
│       ├── sidecar.lua           # Process lifecycle (start, stop, restart, health)
│       ├── protocol.lua          # NDJSON request/response, ID tracking
│       ├── renderer.lua          # Type tree -> buffer lines + extmarks
│       ├── tree.lua              # Tree node state (expand/collapse/data)
│       ├── panel.lua             # Side panel window/buffer management
│       └── config.lua            # Default config, user overrides
├── node/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── server.ts             # Stdio NDJSON server, request dispatch
│   │   ├── service.ts            # TS LanguageService wrapper
│   │   └── type-tree.ts          # Recursive type tree builder
│   └── dist/                     # Bundled output (esbuild)
│       └── server.js
└── doc/
    └── ts-explorer.txt           # Vim help file
```

**Key conventions:**
- `plugin/ts-explorer.lua` is eagerly loaded -- keep it minimal (just define commands).
- `lua/ts-explorer/*.lua` modules are lazy-loaded via `require("ts-explorer.xyz")`.
- Node.js source is bundled to a single `dist/server.js` via esbuild for fast startup and simple distribution.

## Sidecar Lifecycle Management

```
Plugin load (plugin/ts-explorer.lua)
  └─ Registers :TsExplorer command (does NOT start sidecar yet)

First :TsExplorer invocation or CursorHold in .ts file
  └─ sidecar.start()
      ├─ vim.fn.jobstart({"node", sidecar_path}, {on_stdout=..., on_stderr=..., on_exit=...})
      ├─ Sends "initialize" request with project root / tsconfig path
      └─ Marks sidecar as "starting"

Initialize response received
  └─ Marks sidecar as "ready"
  └─ Processes any queued requests

Sidecar crashes (on_exit fires unexpectedly)
  └─ Log error
  └─ Set state to "dead"
  └─ Auto-restart on next request (with backoff if repeated crashes)

Neovim exits (VimLeavePre autocommand)
  └─ sidecar.stop()
      └─ vim.fn.jobstop(job_id)
```

## Scalability Considerations

| Concern | Small project (< 50 files) | Medium project (500 files) | Large project (5000+ files) |
|---------|---------------------------|---------------------------|----------------------------|
| Sidecar startup | < 1s | 2-5s (LanguageService parses project) | 5-15s (initial parse) |
| Type lookup latency | < 50ms | 50-200ms | 200-500ms |
| Memory (Node.js) | ~50MB | ~200MB | ~500MB+ |
| Mitigation | None needed | None needed | Lazy start, consider project scoping |

For large projects, the LanguageService's incremental behavior is essential. Initial startup may be slow, but subsequent lookups are fast because the service caches parsed files.

## Suggested Build Order

Based on dependencies between components:

```
Phase 1: Foundation (no dependencies)
  ├─ Lua: sidecar.lua (process spawn/kill)
  ├─ Lua: protocol.lua (NDJSON encode/decode)
  ├─ Node: server.ts (stdio reader/writer)
  └─ Verify: round-trip echo test

Phase 2: TypeScript Integration (depends on Phase 1)
  ├─ Node: service.ts (LanguageService setup)
  ├─ Node: type-tree.ts (recursive type walker)
  └─ Verify: request type at position, get tree JSON back

Phase 3: UI (depends on Phase 1, partially Phase 2)
  ├─ Lua: panel.lua (side panel window)
  ├─ Lua: renderer.lua (tree -> buffer lines)
  ├─ Lua: tree.lua (expand/collapse state)
  └─ Verify: render mock tree data in panel

Phase 4: Integration (depends on Phases 2+3)
  ├─ Lua: init.lua (setup, autocommands, commands)
  ├─ Wire cursor events -> sidecar -> render pipeline
  ├─ Expand/collapse interaction
  └─ Verify: end-to-end cursor move -> type tree display

Phase 5: Polish (depends on Phase 4)
  ├─ Syntax highlighting via treesitter or extmarks
  ├─ Error handling, sidecar restart logic
  ├─ User configuration (width, depth, keymaps)
  └─ Health check (:checkhealth)
```

## Sources

- [Neovim Job Control docs](https://neovim.io/doc/user/job_control.html)
- [Neovim Lua Plugin docs](https://neovim.io/doc/user/lua-plugin.html)
- [coc.nvim architecture (DeepWiki)](https://deepwiki.com/neoclide/coc.nvim/1-introduction-to-coc.nvim)
- [TypeScript Language Service API wiki](https://github.com/Microsoft/TypeScript/wiki/Using-the-Language-Service-API)
- [TypeScript Compiler API wiki](https://github.com/microsoft/TypeScript-wiki/blob/main/Using-the-Compiler-API.md)
- [outline.nvim](https://github.com/hedyhli/outline.nvim)
- [neo-tree.nvim](https://github.com/nvim-neo-tree/neo-tree.nvim)
- [Neovim node-client](https://github.com/neovim/node-client)
- [nvim-best-practices](https://github.com/nvim-neorocks/nvim-best-practices)
- [Structuring Neovim Lua plugins](https://zignar.net/2022/11/06/structuring-neovim-lua-plugins/)
- [TypeScript typeToTypeNode infinite loop issue](https://github.com/microsoft/TypeScript/issues/29564)
- [Neovim Lua job control guide](https://jacobsimpson.github.io/nvim-lua-manual/docs/job-control/)
- [Neovim node-client stdout issue](https://github.com/neovim/node-client/issues/107)
