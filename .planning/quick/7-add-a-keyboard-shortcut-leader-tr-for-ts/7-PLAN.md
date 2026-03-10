---
phase: quick-7
plan: 1
type: execute
wave: 1
depends_on: []
files_modified:
  - lua/ts-explorer/config.lua
  - lua/ts-explorer/init.lua
autonomous: true
requirements: [QUICK-7]

must_haves:
  truths:
    - "Pressing <leader>tr in normal mode restarts the sidecar"
    - "The keybinding is configurable and can be disabled by setting to false"
    - "Default config includes restart_sidecar = '<leader>tr' under keybindings"
  artifacts:
    - path: "lua/ts-explorer/config.lua"
      provides: "restart_sidecar default keybinding"
      contains: "restart_sidecar"
    - path: "lua/ts-explorer/init.lua"
      provides: "restart_sidecar keymap registration"
      contains: "restart_sidecar"
  key_links:
    - from: "lua/ts-explorer/init.lua"
      to: "ts-explorer.sidecar"
      via: "require('ts-explorer.sidecar').restart()"
      pattern: "sidecar.*restart"
---

<objective>
Add a configurable `<leader>tr` keyboard shortcut that restarts the TypeScript Explorer sidecar.

Purpose: Quick access to restart without typing the command.
Output: Updated config defaults and keymap registration in init.lua.
</objective>

<execution_context>
@/Users/osvi/.claude/get-shit-done/workflows/execute-plan.md
@/Users/osvi/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@lua/ts-explorer/config.lua
@lua/ts-explorer/init.lua
@plugin/ts-explorer.lua
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add restart_sidecar keybinding to config defaults and register in init.lua</name>
  <files>lua/ts-explorer/config.lua, lua/ts-explorer/init.lua</files>
  <action>
1. In `lua/ts-explorer/config.lua`, add `restart_sidecar = "<leader>tr"` to the `keybindings` table in `M.defaults`, right after the existing `toggle_panel` entry. Add a comment `-- set to false to disable` matching the toggle_panel style.

2. In `lua/ts-explorer/init.lua`, add a second keybinding registration block after the existing `toggle_panel` block, following the exact same pattern:
```lua
if cfg.keybindings and cfg.keybindings.restart_sidecar then
  vim.keymap.set("n", cfg.keybindings.restart_sidecar, function()
    require("ts-explorer.sidecar").restart()
  end, { desc = "Restart TypeScript Explorer sidecar", silent = true })
end
```

This calls `sidecar.restart()` directly (same function the `:TsExplorerRestart` command uses in plugin/ts-explorer.lua).
  </action>
  <verify>
    <automated>grep -n "restart_sidecar" lua/ts-explorer/config.lua lua/ts-explorer/init.lua | grep -c "restart_sidecar" | grep -q "^[2-9]" && echo "PASS: restart_sidecar found in both files" || echo "FAIL"</automated>
  </verify>
  <done>config.lua has restart_sidecar = "<leader>tr" in defaults keybindings; init.lua registers the keymap conditionally; the keymap calls sidecar.restart() with desc and silent=true</done>
</task>

</tasks>

<verification>
- `grep "restart_sidecar" lua/ts-explorer/config.lua` shows the default keybinding
- `grep "restart_sidecar" lua/ts-explorer/init.lua` shows the keymap registration
- The keybinding registration checks for falsy value (set to false to disable)
- The keymap calls `require("ts-explorer.sidecar").restart()` matching the TsExplorerRestart command
</verification>

<success_criteria>
- Default config includes restart_sidecar = "<leader>tr" in keybindings
- init.lua registers the keymap on setup(), gated by truthiness check
- Pattern matches existing toggle_panel registration exactly
</success_criteria>

<output>
After completion, create `.planning/quick/7-add-a-keyboard-shortcut-leader-tr-for-ts/7-SUMMARY.md`
</output>
