---
phase: quick-3
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lua/ts-explorer/panel.lua
  - lua/ts-explorer/rpc.lua
  - sidecar/src/services/type-walker.ts
autonomous: false
requirements: [QUICK-3]

must_haves:
  truths:
    - "Hovering over `bus` at line 239 of test.ts updates the type explorer pane with EventBus<TypeCheckEvent>"
    - "The panel displays the resolved type tree for class instances with generic type parameters"
    - "Large sidecar responses (100KB+) are correctly received and rendered in the panel"
  artifacts:
    - path: "lua/ts-explorer/panel.lua"
      provides: "Cursor-follow type resolution with debug logging"
    - path: "lua/ts-explorer/rpc.lua"
      provides: "JSON-RPC response parsing with robust large-response handling"
  key_links:
    - from: "lua/ts-explorer/panel.lua"
      to: "lua/ts-explorer/rpc.lua"
      via: "rpc.request('resolve', params, callback)"
      pattern: "rpc\\.request"
    - from: "lua/ts-explorer/rpc.lua"
      to: "sidecar stdout"
      via: "on_data -> _process_line -> vim.json.decode"
      pattern: "vim\\.json\\.decode"
---

<objective>
Fix the bug where hovering over `bus` (a generic class instance `EventBus<TypeCheckEvent>`) at line 239 of test.ts does not update the type explorer pane.

Purpose: The sidecar correctly resolves `bus` to an `EventBus<TypeCheckEvent>` object with 982 nodes / 137KB JSON. The bug is on the Lua plugin side -- either in how the RPC response is received/parsed, how the request is triggered, or how the result is processed. This plan diagnoses and fixes the root cause.

Output: Working type explorer that updates when hovering over `bus` and other generic class instances.
</objective>

<execution_context>
@/Users/osvi/.claude/get-shit-done/workflows/execute-plan.md
@/Users/osvi/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@lua/ts-explorer/panel.lua
@lua/ts-explorer/rpc.lua
@lua/ts-explorer/sidecar.lua
@lua/ts-explorer/tree.lua
@lua/ts-explorer/config.lua
@lua/ts-explorer/log.lua
@sidecar/src/services/type-walker.ts
@sidecar/src/main.ts
@test.ts

<investigation_notes>
## Pre-investigation findings (from planning)

The sidecar resolves `bus` correctly:
- Position 4920 in test.ts lands on `bus` identifier
- Returns `EventBus<TypeCheckEvent>` object type, 982 nodes, 137KB JSON
- Command: `cd sidecar && npx tsx -e "import {resolveAtPosition} from './src/services/type-walker.ts'; ..." `

So the bug is NOT in the sidecar type resolution. It is on the Lua side.

## Likely root causes (investigate in order)

### 1. RPC large-response parsing failure
The sidecar response is 137KB. OS pipe buffers are typically 64KB. This means Neovim's
libuv will read the response in multiple chunks. The current `rpc.lua` `on_data` handler
MIGHT fail if a single `on_stdout` callback delivers data split across a newline boundary
within a single callback invocation. However, for a single 137KB line, Neovim should
split it as `["<full_json>", ""]` or deliver it across multiple callbacks where only the
last has the newline.

The on_data handler has this logic:
```lua
for i, chunk in ipairs(data) do
  if i == 1 then
    buffer = buffer .. chunk
  else
    M._process_line(buffer)
    buffer = chunk
  end
end
```

This correctly handles multi-callback delivery. BUT `_process_line` uses `pcall(vim.json.decode, line)`
and silently drops failures. If the JSON is valid but `vim.json.decode` has size/depth limits,
the response would be silently lost.

### 2. Stale request_id discarding the response
If the sidecar takes >150ms (debounce interval) and the cursor triggers a new CursorHold
event during that time, the `request_id` increments and the original response is discarded.
The CursorHold event fires after `updatetime` ms of inactivity (default 4000ms), so this
is unlikely unless the user moves cursor multiple times. But CursorMoved fires on every
cursor movement.

### 3. The callback silently ignoring the error
```lua
if err then return end
```
If the sidecar returns a HANDLER_ERROR, the panel silently does nothing.

### 4. vim.json.decode hitting a depth or size limit
Lua/LuaJIT JSON decoders sometimes have recursion depth limits. With 982 nodes nested
potentially 15 levels deep, this could be an issue.
</investigation_notes>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Diagnose the root cause with targeted logging and fix</name>
  <files>lua/ts-explorer/panel.lua, lua/ts-explorer/rpc.lua</files>
  <action>
Add diagnostic logging to trace the request/response lifecycle for `bus` resolution. Then fix the root cause.

**Step 1: Add temporary debug logging to rpc.lua**

In `_process_line`, add logging to see if the response is received and parsed:
```lua
function M._process_line(line)
  if line == "" then return end
  -- Temporary debug: log response size
  local log = require("ts-explorer.log")
  log.debug("RPC: received line, length=" .. #line)
  local ok, msg = pcall(vim.json.decode, line)
  if not ok then
    log.error("RPC: JSON decode failed: " .. tostring(msg) .. " (line length=" .. #line .. ")")
    return
  end
  -- ... rest of function
end
```

In `on_data`, add logging for chunk sizes:
```lua
function M.on_data(data)
  local log = require("ts-explorer.log")
  log.debug("RPC: on_data called, chunks=" .. #data)
  -- ... rest
end
```

**Step 2: Add logging to panel.lua _resolve_at_cursor callback**

In the RPC callback inside `_resolve_at_cursor`:
```lua
rpc.request("resolve", { filePath = file, position = byte_offset }, function(err, result)
    local log = require("ts-explorer.log")
    log.debug("resolve callback: my_id=" .. my_id .. " current_id=" .. state.request_id)
    if my_id ~= state.request_id then
      log.debug("resolve: STALE response discarded")
      return
    end
    if err then
      log.debug("resolve: ERROR " .. vim.inspect(err))
      return
    end
    if result and result.node and result.node ~= vim.NIL then
      log.debug("resolve: got node kind=" .. result.node.kind .. " name=" .. result.node.name)
      M._update_tree(result.node)
    else
      log.debug("resolve: no node in result")
    end
  end)
```

**Step 3: Test in Neovim**

1. Set log level to debug: `:lua require("ts-explorer.config").setup({log={level="debug"}})`
2. Open panel: `:TsExplorer`
3. Open test.ts and navigate to line 239, place cursor on `bus`
4. Check messages: `:messages`
5. Look for which log message appears (or doesn't) to identify the failure point

**Step 4: Fix based on diagnosis**

Based on the most likely root causes:

**If `vim.json.decode` fails on large responses:**
The fix is to add error logging and potentially work around the size limit. vim.json.decode
uses cjson which has a default nesting depth limit of 1000. With 15 max depth from the
type walker, this shouldn't be hit. But if it IS the issue, the fix is in the sidecar:
reduce maxNodes or flatten the response.

**If the stale request_id discards the response:**
The fix is to NOT increment request_id on repeated CursorHold events when cursor hasn't
actually moved. Add position tracking:
```lua
local last_resolve_pos = nil  -- in state table

-- In _resolve_at_cursor, before sending:
local pos_key = file .. ":" .. byte_offset
if pos_key == state.last_resolve_pos then
  return  -- Already resolving this exact position
end
state.last_resolve_pos = pos_key
```

**If the sidecar returns HANDLER_ERROR:**
Add error display: `log.debug("resolve error: " .. vim.inspect(err))`
Then fix whatever the sidecar error is.

**If no response arrives at all (RPC buffer issue):**
The `on_data` buffering logic looks correct but add explicit logging to confirm chunks
are being received and reassembled. If the buffer grows but never gets processed, the
issue is that the final `on_data` callback with the newline-terminated data never fires.

**Step 5: Clean up debug logging**

After fixing, keep useful debug-level logging but remove any overly verbose temporary
logging. The debug logging should be gated behind `config.log.level == "debug"` so it
has zero cost in normal operation.

IMPORTANT: Keep all debug logging behind the existing `log.debug()` call which checks
config level. Do NOT add `vim.notify` or `print` statements.
  </action>
  <verify>
    <automated>cd /Users/osvi/src/typescript-explorer.nvim-restart && nvim --headless -c "luafile sidecar/tmp.lua" -c "qa!" 2>&1 || echo "Neovim headless test (may need manual verification)"</automated>
  </verify>
  <done>
    - The root cause is identified via debug logging
    - The fix is applied so hovering over `bus` at line 239 of test.ts updates the type explorer pane
    - Debug-level logging is retained for future diagnosis (gated behind config)
    - Other symbols (truncationTest, handler, parsed, deepObj) still work correctly
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify bus hover updates the type explorer pane</name>
  <files>lua/ts-explorer/panel.lua, lua/ts-explorer/rpc.lua</files>
  <action>User verifies the fix works in Neovim by hovering over bus at line 239 of test.ts.</action>
  <what-built>Fix for type explorer not updating when hovering over `bus` (generic class instance) at line 239 of test.ts</what-built>
  <how-to-verify>
    1. Open Neovim with the plugin loaded
    2. Run `:TsExplorer` to open the panel
    3. Open `test.ts`
    4. Navigate to line 239 and place cursor on `bus`
    5. Wait 150ms+ for debounce
    6. Verify the panel updates to show `EventBus<TypeCheckEvent>` with children (handlers, on, emit)
    7. Also verify other symbols still work:
       - Line 236: `truncationTest` should show BigUnion type
       - Line 240: `handler` should show function type
       - Line 243: `parsed` should show Result type
       - Line 244: `deepObj` should show DeepReadonly type
  </how-to-verify>
  <verify>Manual verification by user in Neovim</verify>
  <done>User confirms hovering over bus updates the type explorer pane correctly</done>
  <resume-signal>Type "approved" or describe remaining issues</resume-signal>
</task>

</tasks>

<verification>
- Hovering over `bus` at line 239 of test.ts updates the type explorer pane
- The panel shows `EventBus<TypeCheckEvent>` as an object with expandable children
- Other symbols in test.ts still resolve and display correctly
- No error messages in `:messages` during normal operation
- Sidecar tests still pass: `cd sidecar && npx tsx --test src/services/type-walker.test.ts`
</verification>

<success_criteria>
The type explorer pane updates when hovering over `bus` at line 239 of test.ts, showing the resolved `EventBus<TypeCheckEvent>` type with its children. The fix handles the root cause (whether it's large response parsing, stale request discarding, or error swallowing) and adds debug logging for future diagnosis.
</success_criteria>

<output>
After completion, create `.planning/quick/3-in-test-ts-line-239-hovering-over-bus-do/3-SUMMARY.md`
</output>
