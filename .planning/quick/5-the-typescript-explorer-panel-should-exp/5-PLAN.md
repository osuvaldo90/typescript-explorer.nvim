---
phase: quick-5
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - lua/ts-explorer/tree.lua
  - lua/ts-explorer/config.lua
autonomous: true
requirements: ["QUICK-5"]

must_haves:
  truths:
    - "When a type is resolved, the explorer panel shows 5 levels expanded by default"
    - "Users can configure default_expand_depth to change the default expansion level"
    - "Nodes deeper than the default expand depth start collapsed"
  artifacts:
    - path: "lua/ts-explorer/tree.lua"
      provides: "expand_default function that expands to configurable depth"
      contains: "expand_default"
    - path: "lua/ts-explorer/config.lua"
      provides: "default_expand_depth config option"
      contains: "default_expand_depth"
  key_links:
    - from: "lua/ts-explorer/tree.lua"
      to: "lua/ts-explorer/config.lua"
      via: "require to read default_expand_depth"
      pattern: "config.get.*default_expand_depth"
---

<objective>
Make the TypeScript explorer panel expand 5 levels deep by default instead of only 1 level (root).

Purpose: Users currently see only the root node's immediate children. Expanding 5 levels by default gives immediate visibility into nested type structure without manual interaction.
Output: Updated tree.lua with depth-aware default expansion, config.lua with configurable depth option.
</objective>

<execution_context>
@/Users/osvi/.claude/get-shit-done/workflows/execute-plan.md
@/Users/osvi/.claude/get-shit-done/templates/summary.md
</execution_context>

<context>
@lua/ts-explorer/tree.lua
@lua/ts-explorer/config.lua
@lua/ts-explorer/panel.lua

<interfaces>
From lua/ts-explorer/tree.lua:
- M.new(type_node) -> tree_state: creates tree state, calls expand_default
- M.expand_default(tree_state): currently sets expanded = { ["0"] = true } (depth 1 only)
- Tree state shape: { root: TypeNode, expanded: { [path_string]: true }, _last_render: ... }
- Path strings: "0" for root, "0.1" for second child of root, "0.1.3" for fourth child of that, etc.
- Nodes have: name, typeString, children (array), optional, readonly

From lua/ts-explorer/config.lua:
- M.defaults table with sidecar, log, panel sections
- M.get() returns values or defaults
- M.setup(opts) merges user opts with defaults
</interfaces>
</context>

<tasks>

<task type="auto">
  <name>Task 1: Add default_expand_depth config and update tree.expand_default</name>
  <files>lua/ts-explorer/config.lua, lua/ts-explorer/tree.lua</files>
  <action>
1. In config.lua, add `default_expand_depth = 5` to the `panel` section of M.defaults (after the `position` field).

2. In tree.lua, rewrite `expand_default(tree_state)` to expand all nodes with children up to the configured depth:

```lua
function M.expand_default(tree_state)
  local config = require("ts-explorer.config")
  local depth_limit = config.get().panel.default_expand_depth or 5
  tree_state.expanded = {}
  local function expand_to_depth(node, path, current_depth)
    if current_depth >= depth_limit then
      return
    end
    if node.children and #node.children > 0 then
      tree_state.expanded[path] = true
      for i, child in ipairs(node.children) do
        local child_path = path .. "." .. (i - 1)
        expand_to_depth(child, child_path, current_depth + 1)
      end
    end
  end
  if tree_state.root then
    expand_to_depth(tree_state.root, "0", 0)
  end
end
```

Key details:
- current_depth starts at 0 for root. With depth_limit=5, nodes at depths 0-4 are expanded, depth 5+ are collapsed.
- This means 5 levels of children are visible (root's children at depth 1 through depth 5 children visible but collapsed).
- The require is inside the function to avoid circular dependency issues at module load time.
- The `or 5` fallback ensures it works even if config somehow missing the field.
  </action>
  <verify>
    <automated>cd /Users/osvi/src/typescript-explorer.nvim-restart && nvim --headless -u NONE -c "set rtp+=." -c "lua local tree = require('ts-explorer.tree'); local node = {name='root', typeString='MyType', children={{name='a', typeString='string', children={{name='b', typeString='number', children={{name='c', typeString='boolean', children={{name='d', typeString='null', children={{name='e', typeString='undefined', children={{name='f', typeString='void', children={}}}}}}}}}}}}}; local st = tree.new(node); local r = tree.render(st); for _,l in ipairs(r.lines) do print(l) end; local count = 0; for _ in pairs(st.expanded) do count = count + 1 end; print('expanded_count=' .. count); assert(count == 5, 'Expected 5 expanded nodes, got ' .. count)" -c "qa!" 2>&1</automated>
  </verify>
  <done>
- config.lua has panel.default_expand_depth = 5
- tree.lua expand_default expands nodes to 5 levels deep
- A linear chain of 7 levels results in 5 expanded entries (depths 0-4), with depth 5+ collapsed
- Existing toggle, expand_recursive, collapse_recursive functions unaffected
  </done>
</task>

</tasks>

<verification>
- Open neovim with the plugin, hover over a deeply nested type, confirm 5 levels visible by default
- Verify collapsed nodes at depth 5+ can still be manually expanded with Enter or L
- Verify config override works: setup({ panel = { default_expand_depth = 2 } }) limits expansion to 2 levels
</verification>

<success_criteria>
- Explorer panel shows 5 levels expanded by default on type resolve
- Configurable via panel.default_expand_depth
- No regression in manual expand/collapse behavior
</success_criteria>

<output>
After completion, create `.planning/quick/5-the-typescript-explorer-panel-should-exp/5-SUMMARY.md`
</output>
