---
phase: quick-6
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - sidecar/src/services/language-service.ts
  - sidecar/src/services/language-service.test.ts
  - sidecar/src/main.ts
  - lua/ts-explorer/panel.lua
autonomous: true
requirements: [QUICK-6]

must_haves:
  truths:
    - "After editing and saving a .ts file, the type explorer shows the correct type at cursor, not stale module-level type"
    - "getScriptVersion returns a per-file version number that increments on fileChanged notification"
    - "Sidecar accepts fileChanged RPC method and increments the file version"
    - "Lua plugin sends fileChanged notification to sidecar on BufWritePost"
  artifacts:
    - path: "sidecar/src/services/language-service.ts"
      provides: "Per-file version tracking via fileVersions Map, notifyFileChanged export"
      contains: "fileVersions"
      exports: ["getLanguageService", "notifyFileChanged"]
    - path: "sidecar/src/main.ts"
      provides: "fileChanged RPC handler"
      contains: "fileChanged"
    - path: "lua/ts-explorer/panel.lua"
      provides: "BufWritePost autocmd sending fileChanged RPC"
      contains: "BufWritePost"
  key_links:
    - from: "lua/ts-explorer/panel.lua"
      to: "sidecar/src/main.ts"
      via: "rpc.request('fileChanged', { filePath = file })"
      pattern: "fileChanged"
    - from: "sidecar/src/main.ts"
      to: "sidecar/src/services/language-service.ts"
      via: "notifyFileChanged(params.filePath)"
      pattern: "notifyFileChanged"
    - from: "sidecar/src/services/language-service.ts"
      to: "TypeScript LanguageServiceHost"
      via: "getScriptVersion returns fileVersions.get(fileName)"
      pattern: "getScriptVersion.*fileVersions"
---

<objective>
Fix stale type resolution after file edits by implementing per-file version tracking in the sidecar and notifying it from Lua on save.

Purpose: When a user edits and saves a .ts file, the sidecar's cached AST becomes stale because getScriptVersion always returns "0". TypeScript never re-reads the file, causing offset mismatches that resolve to wrong (often module-level) types.

Output: Per-file version map in language-service, fileChanged RPC handler in main, BufWritePost autocmd in panel.
</objective>

<execution_context>
@/Users/osvi/.claude/get-shit-done/workflows/execute-plan.md
@/Users/osvi/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@sidecar/src/services/language-service.ts
@sidecar/src/main.ts
@lua/ts-explorer/panel.lua
@lua/ts-explorer/rpc.lua

<interfaces>
From sidecar/src/services/language-service.ts:
```typescript
export function getLanguageService(filePath: string): ts.LanguageService;
// serviceCache: Map<string, ts.LanguageService> (module-level)
// host.getScriptVersion currently returns "0" always
```

From sidecar/src/main.ts:
```typescript
// JSON-line RPC protocol: { id, method, params } -> { id, result } or { id, error }
// Methods: "echo", "resolve"
// handleResolve imported from ./handlers/resolve.js
```

From lua/ts-explorer/rpc.lua:
```lua
function M.request(method, params, callback)
  -- Sends JSON-line RPC to sidecar via chansend
  -- callback(err, result)
```
</interfaces>
</context>

<tasks>

<task type="auto" tdd="true">
  <name>Task 1: Add per-file version tracking and notifyFileChanged to language-service</name>
  <files>sidecar/src/services/language-service.ts, sidecar/src/services/language-service.test.ts</files>
  <behavior>
    - Test 1: getScriptVersion returns "0" for a file that has never been changed
    - Test 2: After calling notifyFileChanged(filePath), getScriptVersion returns "1" for that file
    - Test 3: Calling notifyFileChanged twice increments to "2"
    - Test 4: notifyFileChanged for one file does not affect another file's version
    - Test 5: After notifyFileChanged, the LanguageService re-reads the file from disk (resolves updated content)
  </behavior>
  <action>
In `sidecar/src/services/language-service.ts`:

1. Add a module-level `const fileVersions = new Map<string, number>()` alongside the existing `serviceCache`.

2. Change the `getScriptVersion` in the host from:
   ```typescript
   getScriptVersion: () => "0",
   ```
   to:
   ```typescript
   getScriptVersion: (fileName: string) => String(fileVersions.get(fileName) ?? 0),
   ```

3. Export a new function `notifyFileChanged`:
   ```typescript
   export function notifyFileChanged(filePath: string): void {
     const absPath = path.resolve(filePath);
     const current = fileVersions.get(absPath) ?? 0;
     fileVersions.set(absPath, current + 1);
   }
   ```

In `sidecar/src/services/language-service.test.ts`:

Add test cases for the new behavior. Note: the existing tests use a shared serviceCache, so version tracking tests should use the FIXTURE_FILE path. Import `notifyFileChanged` alongside `getLanguageService`. Test that after calling notifyFileChanged, the LanguageService's getProgram() re-reads file content (use a fixture or verify version increment via the service host).

Since we cannot easily access the host's getScriptVersion externally, test the integration: write new content to a temp fixture copy, call notifyFileChanged, and verify the LanguageService picks up the new content via getProgram().getSourceFile().
  </action>
  <verify>
    <automated>cd /Users/osvi/src/typescript-explorer.nvim-restart && npx tsx --test sidecar/src/services/language-service.test.ts</automated>
  </verify>
  <done>notifyFileChanged exported and working; getScriptVersion returns per-file versions; LanguageService re-reads files after version bump; all tests pass</done>
</task>

<task type="auto">
  <name>Task 2: Add fileChanged RPC handler and BufWritePost autocmd</name>
  <files>sidecar/src/main.ts, lua/ts-explorer/panel.lua</files>
  <action>
In `sidecar/src/main.ts`:

1. Add import: `import { notifyFileChanged } from "./services/language-service.js";`

2. Add a new case in the switch statement, after the "resolve" case:
   ```typescript
   case "fileChanged":
     notifyFileChanged(msg.params.filePath);
     result = { ok: true };
     break;
   ```

In `lua/ts-explorer/panel.lua`:

1. In `_setup_autocmds()`, after the existing WinClosed autocmd (after line 79), add a BufWritePost autocmd:
   ```lua
   vim.api.nvim_create_autocmd("BufWritePost", {
     group = state.augroup,
     pattern = { "*.ts", "*.tsx" },
     callback = function(ev)
       if not sidecar.is_running() then
         return
       end
       local file = vim.api.nvim_buf_get_name(ev.buf)
       if file and file ~= "" then
         rpc.request("fileChanged", { filePath = file }, function() end)
       end
     end,
   })
   ```

This fires on every TypeScript file save while the panel is open, sending a fire-and-forget notification to the sidecar so it invalidates the cached AST before the next resolve request.
  </action>
  <verify>
    <automated>cd /Users/osvi/src/typescript-explorer.nvim-restart && npx tsx --test sidecar/src/services/language-service.test.ts && grep -q "fileChanged" sidecar/src/main.ts && grep -q "BufWritePost" lua/ts-explorer/panel.lua</automated>
  </verify>
  <done>Sidecar handles "fileChanged" RPC method, Lua sends fileChanged on BufWritePost for .ts/.tsx files, all existing tests still pass</done>
</task>

</tasks>

<verification>
1. All sidecar tests pass: `npx tsx --test sidecar/src/services/language-service.test.ts`
2. Full test suite passes: `npx tsx --test sidecar/src/**/*.test.ts`
3. `notifyFileChanged` is exported from language-service.ts
4. `fileChanged` case exists in main.ts switch
5. `BufWritePost` autocmd exists in panel.lua _setup_autocmds
6. The autocmd only fires for *.ts,*.tsx patterns
7. The autocmd checks sidecar.is_running() before sending
</verification>

<success_criteria>
- getScriptVersion returns per-file version strings (not hardcoded "0")
- notifyFileChanged increments the version for a specific file
- Sidecar responds to "fileChanged" RPC method
- Lua sends fileChanged on BufWritePost for TypeScript files
- All existing and new tests pass
</success_criteria>

<output>
After completion, create `.planning/quick/6-fix-type-explorer-showing-module-level-t/6-SUMMARY.md`
</output>
