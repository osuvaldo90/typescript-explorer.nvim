---
phase: quick-4
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lua/ts-explorer/config.lua
  - lua/ts-explorer/init.lua
autonomous: false
requirements: [QUICK-4]

must_haves:
  truths:
    - "After setup(), <leader>te toggles the type explorer panel"
    - "User can override the keybinding via setup({ keybindings = { toggle_panel = '<leader>tt' } })"
    - "User can disable the keybinding via setup({ keybindings = { toggle_panel = false } })"
  artifacts:
    - path: "lua/ts-explorer/config.lua"
      provides: "keybindings.toggle_panel default config"
      contains: "toggle_panel"
    - path: "lua/ts-explorer/init.lua"
      provides: "Keybinding registration in setup()"
      contains: "vim.keymap.set"
  key_links:
    - from: "lua/ts-explorer/init.lua"
      to: "lua/ts-explorer/config.lua"
      via: "config.get().keybindings.toggle_panel"
      pattern: "keybindings.*toggle_panel"
    - from: "lua/ts-explorer/init.lua"
      to: "lua/ts-explorer/panel.lua"
      via: "panel.toggle() called by keybinding"
      pattern: "panel.*toggle"
---

<objective>
Add a default keybinding (<leader>te) that toggles the TypeScript Explorer panel, configurable through the setup() options.

Purpose: Users should be able to open/close the panel with a single keystroke without needing to define their own keymaps.
Output: Updated config.lua with keybinding defaults, updated init.lua with keymap registration.
</objective>

<execution_context>
@/Users/osvi/.claude/get-shit-done/workflows/execute-plan.md
@/Users/osvi/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@lua/ts-explorer/config.lua
@lua/ts-explorer/init.lua
@plugin/ts-explorer.lua
@lua/ts-explorer/panel.lua
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add keybindings config and register keymap in setup()</name>
  <files>lua/ts-explorer/config.lua, lua/ts-explorer/init.lua</files>
  <action>
1. In config.lua, add a top-level `keybindings` section to `M.defaults`:
   ```lua
   keybindings = {
     toggle_panel = "<leader>te",  -- set to false to disable
   },
   ```
   This sits alongside `sidecar`, `log`, and `panel` in the defaults table.

2. In init.lua, expand `M.setup(opts)` to register the keybinding after config setup:
   ```lua
   function M.setup(opts)
     require("ts-explorer.config").setup(opts)
     local cfg = require("ts-explorer.config").get()

     -- Register keybindings
     if cfg.keybindings and cfg.keybindings.toggle_panel then
       vim.keymap.set("n", cfg.keybindings.toggle_panel, function()
         require("ts-explorer.panel").toggle()
       end, { desc = "Toggle TypeScript Explorer panel", silent = true })
     end
   end
   ```

   Key details:
   - Use `vim.keymap.set` (not nvim_set_keymap) for the function callback support.
   - Mode "n" (normal mode only).
   - `silent = true` to suppress command echo.
   - If toggle_panel is `false` or nil, skip registration entirely (opt-out).
   - The keybinding is global (not buffer-local) since the panel is a global singleton.
   - No need to handle filetype filtering -- the panel command already works from any buffer, and the :TsExplorer command is already global.
  </action>
  <verify>
    <automated>cd /Users/osvi/src/typescript-explorer.nvim-restart && grep -q "toggle_panel" lua/ts-explorer/config.lua && grep -q "vim.keymap.set" lua/ts-explorer/init.lua && echo "PASS" || echo "FAIL"</automated>
  </verify>
  <done>
  - config.lua has keybindings.toggle_panel = "<leader>te" in defaults
  - init.lua registers the keymap when setup() is called and toggle_panel is truthy
  - Setting toggle_panel = false in opts disables the keybinding
  - Setting toggle_panel = "<leader>tt" in opts overrides the default
  </done>
</task>

<task type="checkpoint:human-verify" gate="blocking">
  <name>Task 2: Verify keybinding works in Neovim</name>
  <files>lua/ts-explorer/config.lua, lua/ts-explorer/init.lua</files>
  <action>Human verifies the keybinding behavior in a live Neovim session.</action>
  <what-built>Default keybinding (&lt;leader&gt;te) for toggling the TypeScript Explorer panel, configurable via setup().</what-built>
  <how-to-verify>
    1. Open Neovim with the plugin loaded
    2. Ensure setup() is called (e.g., require("ts-explorer").setup())
    3. Open a TypeScript file
    4. Press &lt;leader&gt;te -- panel should open
    5. Press &lt;leader&gt;te again -- panel should close
    6. Verify override works: change setup to require("ts-explorer").setup({ keybindings = { toggle_panel = "&lt;leader&gt;tt" } })
    7. Restart Neovim, confirm &lt;leader&gt;tt works and &lt;leader&gt;te does not
    8. Verify disable works: setup({ keybindings = { toggle_panel = false } }) -- neither binding should be registered
  </how-to-verify>
  <verify>Human confirms keybinding works correctly</verify>
  <done>User approves that keybinding toggles panel, is configurable, and can be disabled.</done>
  <resume-signal>Type "approved" or describe issues</resume-signal>
</task>

</tasks>

<verification>
- grep for "toggle_panel" in config.lua confirms default exists
- grep for "vim.keymap.set" in init.lua confirms registration logic
- Manual test in Neovim confirms end-to-end behavior
</verification>

<success_criteria>
- &lt;leader&gt;te toggles panel by default after setup()
- Keybinding is configurable via setup({ keybindings = { toggle_panel = "..." } })
- Keybinding can be disabled via setup({ keybindings = { toggle_panel = false } })
</success_criteria>

<output>
After completion, create `.planning/quick/4-add-a-default-keybinding-leader-te-that-/4-SUMMARY.md`
</output>
