local M = {}

--- Create a new tree state from a TypeNode Lua table.
--- Automatically applies default expansion (depth 1).
--- @param type_node table TypeNode table matching sidecar TypeNode shape
--- @return table tree_state
function M.new(type_node)
  local state = {
    root = type_node,
    expanded = {},
    _last_render = nil,
  }
  M.expand_default(state)
  return state
end

--- Set default expansion: expand all nodes with children up to configured depth.
--- @param tree_state table
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

--- Internal: get a node by its path string.
--- @param root table
--- @param path string e.g. "0", "0.1", "0.1.3"
--- @return table|nil node
local function get_node_by_path(root, path)
  local parts = {}
  for seg in path:gmatch("[^.]+") do
    parts[#parts + 1] = tonumber(seg)
  end
  -- parts[1] should be 0 (root)
  if parts[1] ~= 0 then
    return nil
  end
  local node = root
  for i = 2, #parts do
    if not node.children then
      return nil
    end
    -- parts[i] is 0-based child index
    node = node.children[parts[i] + 1] -- Lua is 1-based
    if not node then
      return nil
    end
  end
  return node
end

--- Internal: render a single node and recurse into expanded children.
--- @param tree_state table
--- @param node table
--- @param path string
--- @param depth number
--- @param lines string[]
--- @param line_map string[]
local function _render_node(tree_state, node, path, depth, lines, line_map)
  local indent = string.rep("  ", depth)
  local has_children = node.children and #node.children > 0
  local marker
  if has_children then
    if tree_state.expanded[path] then
      marker = "▾ "
    else
      marker = "▸ "
    end
  else
    marker = "  "
  end

  local prefix = ""
  if node.readonly then
    prefix = "readonly "
  end

  local suffix = ""
  if node.optional then
    suffix = "?"
  end

  -- For literal nodes where name equals typeString (e.g. union branch "error": "error"),
  -- show just the value to avoid redundancy
  local line
  if node.name == node.typeString then
    line = indent .. marker .. prefix .. node.name .. suffix
  else
    line = indent .. marker .. prefix .. node.name .. suffix .. ": " .. node.typeString
  end
  lines[#lines + 1] = line
  line_map[#line_map + 1] = path

  if has_children and tree_state.expanded[path] then
    for i, child in ipairs(node.children) do
      local child_path = path .. "." .. (i - 1)
      _render_node(tree_state, child, child_path, depth + 1, lines, line_map)
    end
  end
end

--- Render the tree into lines and a line map.
--- @param tree_state table
--- @return table { lines: string[], line_map: string[] }
function M.render(tree_state)
  local lines = {}
  local line_map = {}
  if tree_state.root then
    _render_node(tree_state, tree_state.root, "0", 0, lines, line_map)
  end
  tree_state._last_render = { lines = lines, line_map = line_map }
  return tree_state._last_render
end

--- Toggle expand/collapse for the node at the given 1-based line number.
--- Only acts on nodes with children. Returns true if state changed.
--- @param tree_state table
--- @param line_number number 1-based
--- @return boolean changed
function M.toggle(tree_state, line_number)
  local path = M.node_at_line(tree_state, line_number)
  if not path then
    return false
  end
  local node = get_node_by_path(tree_state.root, path)
  if not node or not node.children or #node.children == 0 then
    return false
  end
  if tree_state.expanded[path] then
    tree_state.expanded[path] = nil
  else
    tree_state.expanded[path] = true
  end
  return true
end

--- Expand the node at line_number and all its descendants recursively.
--- Returns true if state changed.
--- @param tree_state table
--- @param line_number number 1-based
--- @return boolean changed
function M.expand_recursive(tree_state, line_number)
  local path = M.node_at_line(tree_state, line_number)
  if not path then
    return false
  end
  local changed = false
  local function expand_subtree(node, node_path)
    if node.children and #node.children > 0 then
      if not tree_state.expanded[node_path] then
        tree_state.expanded[node_path] = true
        changed = true
      end
      for i, child in ipairs(node.children) do
        expand_subtree(child, node_path .. "." .. (i - 1))
      end
    end
  end
  local node = get_node_by_path(tree_state.root, path)
  if node then
    expand_subtree(node, path)
  end
  return changed
end

--- Collapse the node at line_number and all its descendants recursively.
--- Returns true if state changed.
--- @param tree_state table
--- @param line_number number 1-based
--- @return boolean changed
function M.collapse_recursive(tree_state, line_number)
  local path = M.node_at_line(tree_state, line_number)
  if not path then
    return false
  end
  local changed = false
  local prefix = path .. "."
  -- Remove target path and all descendants
  if tree_state.expanded[path] then
    tree_state.expanded[path] = nil
    changed = true
  end
  for p, _ in pairs(tree_state.expanded) do
    if p:sub(1, #prefix) == prefix then
      tree_state.expanded[p] = nil
      changed = true
    end
  end
  return changed
end

--- Return the path string for the given 1-based line number, or nil.
--- @param tree_state table
--- @param line_number number 1-based
--- @return string|nil path
function M.node_at_line(tree_state, line_number)
  if not tree_state._last_render then
    return nil
  end
  return tree_state._last_render.line_map[line_number]
end

return M
