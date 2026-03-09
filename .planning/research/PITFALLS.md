# Domain Pitfalls

**Domain:** Neovim TypeScript type explorer plugin with Node.js sidecar
**Researched:** 2026-03-09

## Critical Pitfalls

Mistakes that cause rewrites, data loss, or unusable product.

### Pitfall 1: `typeToTypeNode` / `typeToString` with NoTruncation Hangs on Recursive Types

**What goes wrong:** Calling `ts.TypeChecker.typeToTypeNode()` or `typeToString()` with `NodeBuilderFlags.NoTruncation` on types with self-referential structures (fluent builder patterns returning `this`, recursive conditional types, deeply nested mapped types) causes the compiler to enter an infinite loop, consuming 100% CPU and all available memory until the process is killed.

**Why it happens:** TypeScript's type printer expands types structurally. When truncation is disabled and the type has cycles (e.g., methods returning `this`, recursive generics), expansion becomes unbounded. The compiler's internal depth limits are bypassed by the NoTruncation flag. PR #31586 added some cycle detection, but edge cases remain, especially with complex conditional types and mapped types over recursive structures.

**Consequences:** The sidecar process hangs indefinitely, Neovim appears frozen waiting for a response, users must force-kill the process. If the sidecar shares one TS Program, all subsequent requests are blocked too.

**Prevention:**
- Implement a timeout on every `typeToString`/`typeToTypeNode` call (e.g., 2-3 seconds max via `setTimeout` + `Promise.race`, or run in a worker thread with termination)
- Set a custom max truncation length as a safety valve: `(ts as any).defaultMaximumTruncationLength = 10000` -- get more detail than default but not infinite
- Implement depth-limited expansion in the tree builder: expand only N levels, show "[deep type]" or "..." for anything beyond
- Detect recursive type references before attempting full expansion by checking `ts.TypeFlags` for recursive markers

**Detection:** Monitor sidecar response times. Any request taking >5 seconds is almost certainly hitting this. Log type flag information (`type.flags`, `type.objectFlags`) for types that take long to resolve.

**Phase relevance:** Must be addressed in the initial sidecar type resolution implementation. This is the single most likely cause of a "works on my project, hangs on yours" bug.

**Confidence:** HIGH -- based on [TypeScript issue #29564](https://github.com/microsoft/TypeScript/issues/29564) and [issue #60237](https://github.com/microsoft/TypeScript/issues/60237).

---

### Pitfall 2: Sidecar Process Becomes a Zombie or Orphan

**What goes wrong:** The Node.js sidecar process outlives the Neovim session. After Neovim exits (especially on crash, SIGKILL, or abnormal termination), the sidecar keeps running as an orphan process consuming memory indefinitely.

**Why it happens:** Several failure modes:
1. `VimLeavePre` autocmd cleanup does not fire when Neovim is killed with SIGKILL
2. If the sidecar spawns child processes (e.g., `tsserver`), `jobstop()` historically only killed the parent, not descendants (fixed in neovim PR #8107, but only on Unix via process groups)
3. On Windows, process group semantics differ and cleanup is less reliable
4. If Neovim crashes, no cleanup handlers run at all

**Consequences:** Users accumulate orphan Node.js processes. Each holds an entire TypeScript Program in memory (hundreds of MB for large projects). Users notice system slowdown over time, blame the plugin.

**Prevention:**
- The sidecar must detect when its stdin closes (Neovim's end of the pipe) and self-terminate. This is the primary safety net -- when Neovim dies, stdin EOF fires regardless of how it died.
- Implement a heartbeat: Neovim sends periodic pings, sidecar exits if no ping received within N seconds
- Use `VimLeavePre` autocmd as best-effort cleanup, but do NOT rely on it as the only mechanism
- Write the sidecar PID to a known temp file; on plugin startup, check for and kill stale processes from previous sessions
- On the sidecar side: `process.stdin.on('end', () => process.exit(0))` and `process.stdin.on('close', () => process.exit(0))`

**Detection:** `ps aux | grep node` showing multiple sidecar processes after closing Neovim.

**Phase relevance:** Must be part of the first working sidecar implementation. Retrofitting lifecycle management is error-prone.

**Confidence:** HIGH -- based on [neovim issue #6530](https://github.com/neovim/neovim/issues/6530), [neovim issue #9001](https://github.com/neovim/neovim/issues/9001), and [vim.system zombie issue #29475](https://github.com/neovim/neovim/issues/29475).

---

### Pitfall 3: LanguageService Memory Leak from Stale SourceFiles

**What goes wrong:** The TypeScript LanguageService (or a manually created Program) holds all parsed SourceFiles in memory. As files change, old versions accumulate if the host does not properly report version changes. Over a long editing session (hours), memory grows unboundedly.

**Why it happens:** The `LanguageServiceHost` interface requires implementing `getScriptVersion()` and `getScriptSnapshot()`. If versions are not properly incremented when files change on disk, the LanguageService creates new SourceFile objects but the DocumentRegistry may retain old ones. Additionally, creating a new `ts.Program` via `createProgram` for each request (instead of using LanguageService) means the entire program is re-parsed from scratch every time -- no caching, massive memory churn from GC pressure.

**Consequences:** Sidecar memory grows from 200MB to 2GB+ over a day of editing. Eventually triggers OOM or extreme GC pauses causing multi-second freezes.

**Prevention:**
- Use `ts.createLanguageService()` with a proper `LanguageServiceHost`, NOT `ts.createProgram()` per-request
- Implement `getScriptVersion()` correctly: track file modification times, increment version on change
- Share a `DocumentRegistry` via `ts.createDocumentRegistry()` if multiple LanguageService instances exist
- Set `isOpen` flag on the LanguageServiceHost only for files the user has actually open in Neovim buffers -- this tells TS to keep ASTs in memory for those files only
- Consider periodic `languageService.dispose()` and recreation as a safety valve (every N hours or when memory exceeds threshold)
- Monitor `process.memoryUsage().heapUsed` and log warnings when approaching limits

**Detection:** Sidecar memory usage trends upward over time without stabilizing. Track with periodic `process.memoryUsage()` logging.

**Phase relevance:** Architecture decision at sidecar design phase. Switching from `createProgram` to `createLanguageService` later requires significant refactoring.

**Confidence:** HIGH -- based on [TypeScript wiki: Using the Language Service API](https://github.com/microsoft/typescript/wiki/using-the-language-service-api) and [TypeScript issue #10759](https://github.com/microsoft/TypeScript/issues/10759).

---

### Pitfall 4: stdout Corruption Breaks the RPC Channel

**What goes wrong:** Any code in the sidecar that writes to `process.stdout` (a stray `console.log`, a dependency's debug output, Node.js deprecation warning on stdout) corrupts the JSON-RPC message stream, causing parse errors and total communication breakdown.

**Why it happens:** When Neovim communicates with the sidecar over stdio, `stdout` IS the RPC channel. Any non-protocol bytes injected into the stream make messages unparseable. Common causes:
- Developer leaves a `console.log()` during debugging
- A npm dependency writes to stdout (some libraries do this for "helpful" messages)
- Node.js itself writes warnings to stderr (safe) but some tools redirect stderr to stdout

**Consequences:** Neovim and sidecar lose sync. All subsequent messages fail. The plugin appears dead with no useful error message. Extremely hard to debug because the corruption happens silently.

**Prevention:**
- Override `console.log` / `console.warn` / `console.error` at sidecar startup to redirect ALL console output to a log file or stderr
- Use stderr for all human-readable logging (Neovim ignores stderr from jobs by default, or route it to on_stderr handler)
- Add a protocol-level framing: use Content-Length headers (like LSP) rather than newline-delimited JSON, so corrupted messages are detectable
- Lint rule: ban `console.log` in sidecar code
- Test the RPC channel with garbage injection to verify error recovery

**Detection:** Plugin suddenly stops updating. Check sidecar stderr logs for uncaught write errors.

**Phase relevance:** Must be established in the initial RPC protocol design. Adding framing later is a breaking protocol change.

**Confidence:** HIGH -- based on [neovim/node-client issue #107](https://github.com/neovim/node-client/issues/107) and [issue #329](https://github.com/neovim/node-client/issues/329).

---

## Moderate Pitfalls

### Pitfall 5: CursorMoved Event Storm Overwhelms the Sidecar

**What goes wrong:** `CursorMoved` fires on every single cursor movement (every character in normal mode, every j/k press, holding arrow keys). Without debouncing, the plugin sends hundreds of type-resolution requests per second. The sidecar queues them all, falls behind, and responses arrive for stale cursor positions.

**Why it happens:** Neovim's `CursorMoved` autocmd is intentionally fine-grained. There is no built-in debounce/throttle in Neovim's Lua API (though [there is an open request for vim.debounce()](https://github.com/neovim/neovim/issues/33179)). Developers often implement debounce incorrectly -- for example, using `vim.defer_fn` without canceling previous timers.

**Prevention:**
- Implement proper trailing-edge debounce: cancel previous timer on each CursorMoved, start new timer (150-300ms). Use `vim.uv.new_timer()` for cancellable timers, not `vim.defer_fn()`
- On the sidecar side: implement request cancellation. When a new request arrives, cancel any in-progress type resolution for the previous position
- Use request IDs: tag each request, ignore responses for superseded request IDs
- Consider `CursorHold` instead of debounced `CursorMoved` for the initial implementation (fires after `updatetime` ms of no movement, default 4000ms -- set to 300-500ms)
- Send the cursor position with each request and have the sidecar skip processing if position has changed by the time it starts work

**Detection:** High CPU usage during normal navigation. Sidecar log shows rapid request/response cycling. Panel flickers as it processes stale positions.

**Phase relevance:** Implement debounce from the very first CursorMoved handler. Do not "add it later" -- the entire request/response flow design depends on cancellation semantics.

**Confidence:** HIGH -- based on community patterns and [neovim-throttle-debounce](https://github.com/runiq/neovim-throttle-debounce).

---

### Pitfall 6: Operating on Invalid or Wrong Buffer

**What goes wrong:** Autocmd handlers fire and attempt to update the type explorer panel buffer, but the buffer has been deleted, wiped, or is no longer the expected buffer. This causes errors like "Invalid buffer id" or worse, writing type information into the user's source code buffer.

**Why it happens:**
- Buffer IDs can become invalid between the time an autocmd fires and the callback runs (async gap)
- Some plugins (e.g., fzf-lua) set `bufhidden=wipe` which deletes buffers WITHOUT firing BufDelete/BufWipeout autocmds
- When opening/closing splits rapidly, the "current buffer" can change between request send and response receive
- The type explorer panel buffer itself can be closed by the user while a response is in-flight

**Prevention:**
- Always validate buffer with `vim.api.nvim_buf_is_valid(bufnr)` AND `vim.api.nvim_buf_is_loaded(bufnr)` before ANY buffer operation
- Store the target buffer number explicitly in each request; on response, verify it is still the correct buffer
- Use buffer-local autocmds (`buffer = bufnr` parameter) to scope handlers to specific buffers
- Create the panel buffer with `bufhidden=hide` (not wipe) so it can be reused without recreation
- Guard all `nvim_buf_set_lines` / `nvim_buf_set_extmark` calls with pcall to catch invalid buffer errors gracefully

**Detection:** Lua errors in `:messages` referencing "Invalid buffer id". Type text appearing in source buffers.

**Phase relevance:** Buffer management discipline must be established from the first buffer-writing code.

**Confidence:** HIGH -- based on [neovim issue #28575](https://github.com/neovim/neovim/issues/28575).

---

### Pitfall 7: tsconfig.json Resolution Fails Silently

**What goes wrong:** The sidecar cannot find or incorrectly resolves `tsconfig.json`, resulting in the TypeScript Program being created with wrong compiler options or missing files. Types resolve as `any` or show import errors, and the user has no idea why.

**Why it happens:**
- Monorepo projects have multiple `tsconfig.json` files; picking the wrong one gives wrong types
- `tsconfig.json` may use `extends`, `references`, or path aliases that require resolution relative to the config file location
- The file being edited may not be included in any `tsconfig.json` (`include`/`exclude` patterns)
- Some projects use `tsconfig.build.json`, `tsconfig.app.json`, etc. -- which one to pick?

**Prevention:**
- Use `ts.findConfigFile()` starting from the current file's directory, walking up
- For monorepos: resolve per-file, not per-workspace. Cache the mapping of file -> tsconfig
- Parse the resolved config with `ts.parseJsonConfigFileContent()` to get the actual resolved options (handles `extends`)
- If no tsconfig found, show an explicit warning in the panel ("No tsconfig.json found") rather than silently falling back to default options
- Support a plugin config option to specify tsconfig path explicitly as an override

**Detection:** Types showing as `any` when they should be resolved. Path aliases not resolving. Plugin works in simple projects but fails in monorepos.

**Phase relevance:** tsconfig resolution is foundational. Get it right before building type display features on top.

**Confidence:** MEDIUM -- common knowledge in TypeScript tooling, multiple tsconfig-related issues in various TS tool projects.

---

### Pitfall 8: Panel Autocmd Loops

**What goes wrong:** Setting buffer content in the type explorer panel triggers `BufModified`, `TextChanged`, or similar autocmds, which trigger more updates, creating an infinite loop that freezes Neovim.

**Why it happens:** Writing lines to the panel buffer is a buffer modification. If autocmds are set up broadly (e.g., listening to `TextChanged` on all buffers), the panel update triggers another update cycle.

**Prevention:**
- Set `buftype=nofile` and `modifiable=false` on the panel buffer (set `modifiable=true` only briefly during writes, then back to `false`)
- Use autocommand groups with `clear = true` on recreation to prevent duplicate handlers
- Filter autocmds by buffer filetype or buffer variable to exclude the panel buffer
- Set a guard variable (`_updating = true`) during panel writes and check it in autocmd handlers
- Use `nvim_buf_set_lines` with the `noautocmd` flag when available, or wrap in `vim.api.nvim_command('noautocmd ...')`

**Detection:** Neovim freezes or becomes extremely slow when the panel is open. CPU spikes to 100%.

**Phase relevance:** Panel buffer setup phase.

**Confidence:** HIGH -- well-known Vim/Neovim pattern.

---

## Minor Pitfalls

### Pitfall 9: Windows Path Handling

**What goes wrong:** File paths sent between Neovim and the sidecar use different separators or casing on Windows. TypeScript expects forward slashes internally, Neovim may report backslashes, and case-insensitive filesystem lookups fail when doing strict string comparison on paths.

**Prevention:**
- Normalize all paths to forward slashes at the RPC boundary
- Use `path.resolve()` on the sidecar side for all incoming paths
- Use case-insensitive path comparison on Windows (check `ts.sys.useCaseSensitiveFileNames`)
- Handle drive letter casing consistently (always lowercase `c:` or always uppercase `C:`)

**Phase relevance:** Can be addressed later but easier to normalize paths from the start.

**Confidence:** MEDIUM -- standard cross-platform concern.

---

### Pitfall 10: Treesitter Highlighting Mismatch in Panel Buffer

**What goes wrong:** The type explorer panel uses treesitter for syntax highlighting of TypeScript type syntax, but the content in the panel is not valid TypeScript -- it is a tree representation with indentation, collapse markers, etc. Treesitter parsers error out or highlight incorrectly.

**Prevention:**
- Use a custom filetype for the panel (e.g., `typescripttype`) with a dedicated treesitter grammar, OR
- Use manual `nvim_buf_add_highlight` / extmark-based highlighting instead of relying on treesitter parsing
- If using treesitter: write each type fragment as valid TypeScript syntax (`type T = { ... }`) that the parser can handle, with tree structure expressed through indentation only
- Extmark-based highlighting gives full control and avoids parser dependency

**Phase relevance:** UI rendering phase. Decision between treesitter vs extmarks for highlighting should be made early.

**Confidence:** MEDIUM -- based on how other explorer plugins (e.g., nvim-tree, symbols-outline) handle custom buffer highlighting.

---

### Pitfall 11: Initial Project Load Blocks First Request

**What goes wrong:** Creating the TypeScript Program/LanguageService for a large project takes 5-30 seconds. If the sidecar starts synchronously, the first type query blocks until the entire project is loaded. User opens Neovim, moves cursor, and nothing happens for 30 seconds.

**Prevention:**
- Start project loading immediately on sidecar startup (not on first request)
- Return a "loading..." status for requests that arrive before the project is ready
- Show a loading indicator in the panel
- Consider lazy loading: only create the Program when the user first opens a TypeScript file
- For very large projects: use LanguageService with `getScriptVersion` so incremental updates are fast after initial load

**Detection:** Long delay between opening Neovim and first type display.

**Phase relevance:** Sidecar startup architecture.

**Confidence:** HIGH -- standard issue with TypeScript tooling startup.

---

### Pitfall 12: Sidecar Crash Leaves Plugin in Broken State

**What goes wrong:** The sidecar crashes (OOM, unhandled exception, Node.js segfault) and the Lua plugin does not detect this. Subsequent cursor moves queue requests to a dead process. The panel shows stale data indefinitely.

**Prevention:**
- Monitor the `on_exit` callback from `jobstart()` to detect sidecar death
- Implement automatic restart with exponential backoff (max 3 retries, then show error)
- Show a clear error state in the panel when the sidecar is down: "Type explorer unavailable -- sidecar crashed (restarting...)"
- Log crash information (exit code, signal) for debugging
- Provide a `:TypeExplorerRestart` command for manual recovery
- Wrap sidecar entry point in try/catch with graceful error reporting to stderr

**Detection:** Panel stops updating. No errors in Neovim messages. Sidecar process not running.

**Phase relevance:** Sidecar lifecycle management, same phase as Pitfall 2.

**Confidence:** HIGH -- standard resilience pattern.

---

## Phase-Specific Warnings

| Phase Topic | Likely Pitfall | Mitigation |
|-------------|---------------|------------|
| RPC Protocol Design | stdout corruption (#4), message framing | Use Content-Length framing from day one. Ban console.log. |
| Sidecar Lifecycle | Zombie processes (#2), crash recovery (#12) | stdin EOF detection + heartbeat. on_exit restart handler. |
| TypeScript Program Setup | Memory leaks (#3), initial load blocking (#11) | Use LanguageService, not createProgram. Async initialization with loading state. |
| Type Resolution | Infinite expansion (#1), recursive types | Timeout every typeToString call. Depth-limit tree expansion. |
| Cursor-Driven Updates | Event storm (#5), stale responses | Cancellable debounce with request IDs from the start. |
| Panel Buffer | Invalid buffer (#6), autocmd loops (#8) | Validate buffer on every write. nofile + modifiable guard. |
| tsconfig Resolution | Silent failures (#7) | Per-file resolution. Explicit error display. |
| UI Rendering | Treesitter mismatch (#10) | Prefer extmark highlighting over treesitter for panel. |
| Cross-Platform | Path handling (#9) | Normalize at RPC boundary. |

## Sources

- [TypeScript issue #29564: typeToTypeNode infinite loop](https://github.com/microsoft/TypeScript/issues/29564)
- [TypeScript issue #60237: Infinite type instantiation with recursive conditional types](https://github.com/microsoft/TypeScript/issues/60237)
- [TypeScript issue #10759: Very high memory usage](https://github.com/microsoft/TypeScript/issues/10759)
- [TypeScript wiki: Using the Language Service API](https://github.com/microsoft/typescript/wiki/using-the-language-service-api)
- [TypeScript wiki: Using the Compiler API](https://github.com/microsoft/TypeScript/wiki/Using-the-Compiler-API)
- [TypeScript wiki: Performance](https://github.com/microsoft/Typescript/wiki/Performance)
- [Neovim issue #6530: jobstop does not kill process children](https://github.com/neovim/neovim/issues/6530)
- [Neovim issue #9001: provider/node.vim hang on exit](https://github.com/neovim/neovim/issues/9001)
- [Neovim issue #29475: vim.system zombie process](https://github.com/neovim/neovim/issues/29475)
- [Neovim issue #28575: LSP race condition with invalid buffer](https://github.com/neovim/neovim/issues/28575)
- [Neovim issue #33179: vim.debounce() and vim.throttle() request](https://github.com/neovim/neovim/issues/33179)
- [Neovim node-client issue #107: stdout write killing plugin](https://github.com/neovim/node-client/issues/107)
- [Neovim node-client issue #329: console.log crashes Nvim](https://github.com/neovim/node-client/issues/329)
- [neovim-throttle-debounce](https://github.com/runiq/neovim-throttle-debounce)
- [Neovim Job Control docs](https://neovim.io/doc/user/job_control.html)
