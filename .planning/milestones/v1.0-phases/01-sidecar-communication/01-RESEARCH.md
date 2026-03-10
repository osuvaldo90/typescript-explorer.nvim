# Phase 1: Sidecar Communication - Research

**Researched:** 2026-03-09
**Domain:** Neovim-to-Node.js IPC via stdio, Neovim Lua plugin structure
**Confidence:** HIGH

## Summary

Phase 1 establishes bidirectional NDJSON communication between a Neovim Lua plugin and a Node.js sidecar process over stdio. The Neovim side uses `vim.fn.jobstart()` to spawn the Node.js process and `vim.fn.chansend()` to write messages to its stdin. The Node.js side uses `process.stdin` with Node's built-in `readline` module to read line-delimited JSON and `process.stdout.write()` to send responses. The sidecar self-terminates by listening for the `end` event on `process.stdin`.

This is a well-understood pattern in the Neovim ecosystem (coc.nvim, copilot.lua). The main complexity lies in handling partial stdout data from `jobstart()` callbacks (Neovim does not guarantee complete lines per callback invocation) and ensuring clean process lifecycle management including crash recovery.

**Primary recommendation:** Use `vim.fn.jobstart()` with non-buffered `on_stdout` and manual line buffering for the Neovim side. Use Node.js `readline` on `process.stdin` for the sidecar side. Use a lightweight custom NDJSON request/response protocol (not full JSON-RPC 2.0) with message IDs for correlation.

<user_constraints>

## User Constraints (from CONTEXT.md)

### Locked Decisions
- Crash recovery: Auto-restart silently on crash -- 3 restart attempts, then show error via vim.notify and stop retrying. In-flight requests are dropped on crash. Provide a `:TsExplorerRestart` user command for manual restart.
- Plugin structure: LazyVim compatible setup -- follow Neovim/LazyVim plugin best practices, standard Lua plugin layout conventions.

### Claude's Discretion
- Message protocol design (request/response format, message IDs, error envelopes -- JSON-RPC vs custom NDJSON schema)
- Logging and debugging approach (log verbosity, file vs stderr-only, user-facing diagnostics)
- Sidecar Node.js project structure and build setup

### Deferred Ideas (OUT OF SCOPE)
None -- discussion stayed within phase scope

</user_constraints>

<phase_requirements>

## Phase Requirements

| ID | Description | Research Support |
|----|-------------|-----------------|
| SIDE-01 | Node.js sidecar starts automatically when Neovim loads the plugin | Plugin `plugin/` directory auto-execution + `vim.fn.jobstart()` API |
| SIDE-02 | Sidecar communicates with Neovim over stdio using newline-delimited JSON | NDJSON protocol over jobstart stdio + readline on Node.js side |
| SIDE-05 | Sidecar self-terminates when stdin closes (no zombie processes) | `process.stdin.on('end')` + VimLeavePre autocmd + jobstop() |

</phase_requirements>

## Standard Stack

### Core

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Neovim Lua API | 0.9+ | Plugin host, job control, autocmds | Built-in, no dependencies |
| Node.js | 18+ LTS | Sidecar runtime | Required for TypeScript compiler API in later phases |
| `node:readline` | built-in | Line-by-line stdin parsing | No external deps needed for NDJSON parsing |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| TypeScript | ~5.x | Sidecar source language + compiler | Write sidecar in TypeScript, compile to JS |
| `tsx` | latest | Dev-time TypeScript execution | Development/debugging only -- production runs compiled JS |
| `tsup` or `esbuild` | latest | Bundle sidecar to single JS file | Production build -- single file simplifies distribution |

### Alternatives Considered

| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| Custom NDJSON | JSON-RPC 2.0 | JSON-RPC adds batch support, named errors, notification semantics -- overkill for this use case. Custom NDJSON is simpler and sufficient. |
| `vim.fn.jobstart()` | `vim.system()` | `vim.system()` (Neovim 0.10+) is designed for short-lived commands, not long-running bidirectional IPC. `jobstart()` is the correct choice. |
| `vim.fn.jobstart()` | `vim.loop.spawn()` | Lower-level libuv binding, requires manual `vim.schedule_wrap()` for all callbacks. `jobstart()` handles this automatically. |
| `node:readline` | `ndjson` npm package | External dependency for trivial functionality. `readline` is built-in and handles line buffering perfectly. |

**Installation (sidecar):**
```bash
npm init -y
npm install -D typescript tsx tsup @types/node
```

## Architecture Patterns

### Recommended Plugin Structure
```
typescript-explorer.nvim/
├── plugin/
│   └── ts-explorer.lua          # Auto-loaded on startup, registers commands
├── lua/
│   └── ts-explorer/
│       ├── init.lua              # Public API: setup(), module exports
│       ├── config.lua            # Configuration defaults + merge
│       ├── sidecar.lua           # Process lifecycle (start/stop/restart)
│       └── rpc.lua               # NDJSON message send/receive + correlation
├── sidecar/
│   ├── package.json
│   ├── tsconfig.json
│   ├── src/
│   │   ├── main.ts              # Entry point: stdin/stdout setup, dispatch
│   │   ├── protocol.ts          # Message type definitions
│   │   └── handlers/
│   │       └── echo.ts          # Echo handler for phase 1
│   └── dist/
│       └── main.js              # Bundled output (committed or built on install)
└── README.md
```

### Pattern 1: Neovim Plugin Entry Point
**What:** `plugin/ts-explorer.lua` runs on startup, defers heavy work to `require()`
**When to use:** Always -- this is the standard Neovim plugin loading convention

```lua
-- plugin/ts-explorer.lua
-- Runs automatically when Neovim loads the plugin
-- Keep this minimal -- heavy logic in lua/ts-explorer/

if vim.g.loaded_ts_explorer then
  return
end
vim.g.loaded_ts_explorer = true

-- Register user commands
vim.api.nvim_create_user_command("TsExplorerRestart", function()
  require("ts-explorer.sidecar").restart()
end, { desc = "Restart TypeScript Explorer sidecar" })

-- Start sidecar on plugin load (SIDE-01)
vim.api.nvim_create_autocmd("VimEnter", {
  callback = function()
    require("ts-explorer.sidecar").start()
  end,
  once = true,
})

-- Clean shutdown on exit
vim.api.nvim_create_autocmd("VimLeavePre", {
  callback = function()
    require("ts-explorer.sidecar").stop()
  end,
})
```

### Pattern 2: Sidecar Process Lifecycle
**What:** Start, monitor, restart, and stop the Node.js process
**When to use:** Core of sidecar.lua

```lua
-- lua/ts-explorer/sidecar.lua (simplified)
local M = {}

local job_id = nil
local restart_count = 0
local MAX_RESTARTS = 3

function M.start()
  if job_id then return end

  local sidecar_path = -- resolve path to sidecar/dist/main.js
  job_id = vim.fn.jobstart({ "node", sidecar_path }, {
    on_stdout = function(_, data, _)
      require("ts-explorer.rpc").on_data(data)
    end,
    on_stderr = function(_, data, _)
      -- Log stderr for debugging (never mixed with stdout messages)
      require("ts-explorer.log").debug(data)
    end,
    on_exit = function(_, exit_code, _)
      job_id = nil
      if exit_code ~= 0 then
        M._handle_crash()
      end
    end,
  })
end

function M.stop()
  if job_id then
    vim.fn.jobstop(job_id)
    job_id = nil
  end
end

function M.restart()
  M.stop()
  restart_count = 0  -- Manual restart resets counter
  M.start()
end

function M._handle_crash()
  restart_count = restart_count + 1
  if restart_count <= MAX_RESTARTS then
    M.start()
  else
    vim.notify("TypeScript Explorer: sidecar crashed repeatedly. Use :TsExplorerRestart to retry.", vim.log.levels.ERROR)
  end
end

return M
```

### Pattern 3: NDJSON Message Protocol
**What:** Request/response with message IDs over newline-delimited JSON
**When to use:** All communication between Neovim and sidecar

Message format (custom, lightweight):
```json
{"id": 1, "method": "echo", "params": {"text": "hello"}}
```
Response:
```json
{"id": 1, "result": {"text": "hello"}}
```
Error:
```json
{"id": 1, "error": {"code": "UNKNOWN_METHOD", "message": "..."}}
```

Key design points:
- Every request has a unique numeric `id` for correlation
- `method` identifies the handler
- `params` is the payload
- Response has either `result` or `error`, never both
- Each message is a single line terminated by `\n`

### Pattern 4: Stdout Line Buffering (Neovim Side)
**What:** Buffer partial data from `on_stdout` into complete lines
**When to use:** Always required -- `on_stdout` does NOT guarantee complete lines

```lua
-- lua/ts-explorer/rpc.lua (line buffering)
local M = {}
local buffer = ""
local pending = {}  -- id -> callback
local next_id = 0

function M.on_data(data)
  for i, chunk in ipairs(data) do
    if i == 1 then
      buffer = buffer .. chunk
    else
      -- Each element after the first represents a newline boundary
      M._process_line(buffer)
      buffer = chunk
    end
  end
end

function M._process_line(line)
  if line == "" then return end
  local ok, msg = pcall(vim.json.decode, line)
  if ok and msg.id and pending[msg.id] then
    local cb = pending[msg.id]
    pending[msg.id] = nil
    cb(msg.error, msg.result)
  end
end

function M.request(method, params, callback)
  next_id = next_id + 1
  local id = next_id
  pending[id] = callback
  local msg = vim.json.encode({ id = id, method = method, params = params }) .. "\n"
  vim.fn.chansend(require("ts-explorer.sidecar").get_job_id(), msg)
end

return M
```

### Pattern 5: Node.js Sidecar Entry Point
**What:** Stdin/stdout NDJSON handler with self-termination
**When to use:** The sidecar main.ts

```typescript
// sidecar/src/main.ts
import * as readline from "node:readline";

const rl = readline.createInterface({ input: process.stdin });

// Self-terminate when stdin closes (SIDE-05)
process.stdin.on("end", () => {
  process.exit(0);
});

rl.on("line", (line: string) => {
  try {
    const msg = JSON.parse(line);
    const result = handleMessage(msg);
    const response = JSON.stringify({ id: msg.id, result });
    process.stdout.write(response + "\n");
  } catch (err) {
    const errorResponse = JSON.stringify({
      id: null,
      error: { code: "PARSE_ERROR", message: String(err) },
    });
    process.stdout.write(errorResponse + "\n");
  }
});

function handleMessage(msg: { id: number; method: string; params: unknown }) {
  switch (msg.method) {
    case "echo":
      return msg.params;
    default:
      throw new Error(`Unknown method: ${msg.method}`);
  }
}

// All logging goes to stderr (never corrupt stdout channel)
function log(...args: unknown[]) {
  console.error("[ts-explorer]", ...args);
}
```

### Anti-Patterns to Avoid
- **Using `console.log()` in the sidecar:** This writes to stdout and corrupts the message channel. ALL sidecar logging MUST use `console.error()` (stderr).
- **Using `stdout_buffered = true` with jobstart:** This buffers ALL stdout until the job exits -- useless for a long-running sidecar. Use non-buffered mode with manual line assembly.
- **Parsing JSON without buffering lines first:** `on_stdout` data is NOT line-delimited. You will get partial JSON that fails to parse. Always buffer and split on newlines first.
- **Using `vim.system()` for long-running processes:** `vim.system()` is designed for short-lived commands. It does not support ongoing bidirectional communication.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Line buffering from jobstart stdout | Custom stream parser | Simple buffer + split pattern (shown above) | The `on_stdout` data format is well-documented; the buffer pattern is 15 lines |
| JSON encoding/decoding in Lua | Custom JSON parser | `vim.json.encode()` / `vim.json.decode()` | Built into Neovim, handles all edge cases |
| Node.js line-by-line stdin reading | Manual Buffer.concat + split | `node:readline` createInterface | Built-in, handles encoding, buffering, and edge cases |
| TypeScript compilation for sidecar | Manual tsc + file watching | `tsup` or `esbuild` bundler | Single-file output, source maps, fast builds |

**Key insight:** Both Neovim and Node.js have built-in primitives for every piece of this communication layer. No external npm packages or Lua libraries are needed.

## Common Pitfalls

### Pitfall 1: Stdout Corruption
**What goes wrong:** Sidecar uses `console.log()` for debugging, which writes to stdout and injects non-JSON text into the message stream. Neovim's JSON parser fails on the debug output.
**Why it happens:** `console.log()` defaults to stdout in Node.js -- easy to forget.
**How to avoid:** Use `console.error()` for ALL logging. Consider wrapping in a `log()` function that enforces stderr. Lint rule: ban `console.log` in sidecar code.
**Warning signs:** Intermittent JSON parse errors on the Neovim side, especially during debugging.

### Pitfall 2: Partial Line Parsing
**What goes wrong:** Code tries to `vim.json.decode()` each `on_stdout` data chunk directly. Gets parse errors because chunks don't align with newline boundaries.
**Why it happens:** `on_stdout` callback receives arbitrary byte boundaries from the OS pipe buffer, not logical message boundaries.
**How to avoid:** Always buffer data and split on `\n` before parsing. The buffer pattern in Pattern 4 above handles this correctly.
**Warning signs:** Sporadic "invalid JSON" errors, especially with large messages.

### Pitfall 3: Orphaned Node.js Processes
**What goes wrong:** Neovim exits but the Node.js sidecar keeps running.
**Why it happens:** If the sidecar doesn't detect stdin closure and Neovim's SIGTERM doesn't reach it (e.g., detached process groups).
**How to avoid:** Belt-and-suspenders approach: (1) VimLeavePre autocmd calls `jobstop()`, which sends SIGTERM then SIGKILL. (2) Sidecar listens for `process.stdin` `end` event and calls `process.exit(0)`. Both mechanisms independently ensure cleanup.
**Warning signs:** `ps aux | grep node` shows lingering sidecar processes after Neovim exits.

### Pitfall 4: Race Condition on Startup
**What goes wrong:** Plugin sends a request before the sidecar has finished initializing. Request is lost or causes an error.
**Why it happens:** `jobstart()` returns immediately; the Node.js process takes time to start and set up its readline interface.
**How to avoid:** Have the sidecar send a "ready" message on startup. Queue requests on the Neovim side until the ready signal is received. Or: simply accept that the first request might fail and let the natural retry-on-cursor-move behavior handle it (simpler, acceptable for this use case).
**Warning signs:** First request after startup consistently fails.

### Pitfall 5: Sidecar Path Resolution
**What goes wrong:** Plugin can't find `sidecar/dist/main.js` because the path is relative and the working directory is wrong.
**Why it happens:** Neovim's cwd is the user's project, not the plugin installation directory.
**How to avoid:** Resolve the sidecar path relative to the plugin's own installation directory using `debug.getinfo()` or a known Neovim API pattern.
**Warning signs:** "ENOENT" or "file not found" errors on startup.

## Code Examples

### Resolving Plugin Installation Path
```lua
-- Get the directory where this Lua file is installed
local function get_plugin_root()
  local source = debug.getinfo(1, "S").source:sub(2) -- remove '@' prefix
  -- source is like: /path/to/plugin/lua/ts-explorer/sidecar.lua
  return vim.fn.fnamemodify(source, ":h:h:h") -- go up 3 levels
end
```

### Sending a Request and Handling Response
```lua
-- Usage from other modules
local rpc = require("ts-explorer.rpc")
rpc.request("echo", { text = "hello" }, function(err, result)
  if err then
    vim.notify("Echo failed: " .. err.message, vim.log.levels.ERROR)
    return
  end
  print("Echo response: " .. result.text)
end)
```

### Sidecar tsconfig.json
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "Node16",
    "moduleResolution": "Node16",
    "outDir": "dist",
    "rootDir": "src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": false
  },
  "include": ["src"]
}
```

### tsup Build Config
```typescript
// sidecar/tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts"],
  format: ["cjs"],         // Node.js CommonJS for maximum compatibility
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  minify: false,           // Keep readable for debugging
  noExternal: [/.*/],      // Bundle everything into single file
});
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `vim.loop.spawn()` with manual scheduling | `vim.fn.jobstart()` | Stable since Neovim 0.5+ | Higher-level API, callbacks run in main loop automatically |
| External JSON libs in Lua | `vim.json.encode/decode` | Neovim 0.6+ | No dependency needed for JSON in Lua |
| msgpack-rpc for everything | NDJSON for simple protocols | Ongoing | msgpack-rpc is Neovim's native protocol but overkill for custom sidecar communication |

**Deprecated/outdated:**
- `vim.api.nvim_call_function("jobstart", ...)`: Use `vim.fn.jobstart()` directly
- plenary.job: Was popular but `vim.fn.jobstart()` is sufficient and has no external dependency

## Open Questions

1. **Should the sidecar dist be committed or built on plugin install?**
   - What we know: Committing dist/ is simpler for users (no build step). Building on install is cleaner for git.
   - What's unclear: lazy.nvim supports `build` hooks that can run `npm install && npm run build`.
   - Recommendation: Commit `dist/main.js` to the repo for zero-friction install. Add a build script for development.

2. **ESM vs CommonJS for the sidecar bundle?**
   - What we know: Node.js 18+ supports both. TypeScript ecosystem is moving to ESM.
   - What's unclear: Whether `tsup` CJS bundling handles all edge cases for later TypeScript compiler API usage.
   - Recommendation: Use CJS for phase 1 (simpler, no `.mjs` extension issues). Can migrate to ESM later if needed.

## Validation Architecture

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Neovim headless + Node.js test runner (node --test) |
| Config file | none -- see Wave 0 |
| Quick run command | `node --test sidecar/src/**/*.test.ts` |
| Full suite command | `make test` (runs both Lua and Node tests) |

### Phase Requirements to Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| SIDE-01 | Sidecar starts on plugin load | integration | `nvim --headless -c "lua require('ts-explorer.sidecar').start()" -c "qa"` | No -- Wave 0 |
| SIDE-02 | Echo round-trip over NDJSON | integration | `node --test sidecar/src/protocol.test.ts` | No -- Wave 0 |
| SIDE-05 | Sidecar exits when stdin closes | unit | `node --test sidecar/src/lifecycle.test.ts` | No -- Wave 0 |

### Sampling Rate
- **Per task commit:** `node --test sidecar/src/**/*.test.ts`
- **Per wave merge:** `make test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `sidecar/src/protocol.test.ts` -- covers SIDE-02 echo round-trip
- [ ] `sidecar/src/lifecycle.test.ts` -- covers SIDE-05 stdin close self-termination
- [ ] `Makefile` with `test` target orchestrating both Lua and Node tests
- [ ] Node.js test runner setup (built-in `node --test`, no framework needed)

## Sources

### Primary (HIGH confidence)
- [Neovim Job Control docs](https://neovim.io/doc/user/job_control/) - jobstart(), chansend(), on_stdout data format, jobstop() behavior
- [Neovim Lua Guide](https://neovim.io/doc/user/lua-guide/) - vim.json, vim.fn, autocmd API
- [Node.js readline docs](https://nodejs.org/api/readline.html) - createInterface, line event
- [Node.js process docs](https://nodejs.org/api/process.html) - process.stdin end event, process.exit

### Secondary (MEDIUM confidence)
- [Structuring Neovim Lua plugins](https://zignar.net/2022/11/06/structuring-neovim-lua-plugins/) - plugin/ vs lua/ directory conventions
- [lazy.nvim structuring docs](https://lazy.folke.io/usage/structuring) - Plugin spec structure
- [NDJSON spec](https://github.com/ndjson/ndjson-spec) - Newline-delimited JSON format specification

### Tertiary (LOW confidence)
- [neovim/neovim#6530](https://github.com/neovim/neovim/issues/6530) - jobstop does not kill descendants (edge case awareness)

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - All components are built-in Neovim/Node.js APIs, well-documented
- Architecture: HIGH - Plugin structure follows established Neovim conventions with many reference implementations
- Pitfalls: HIGH - Known issues documented in Neovim issue tracker and community guides
- Protocol design: MEDIUM - Custom NDJSON is a recommendation (Claude's discretion area), not verified against alternatives in this specific context

**Research date:** 2026-03-09
**Valid until:** 2026-04-09 (stable domain, unlikely to change)
