local M = {}

local tree = require("ts-explorer.tree")
local rpc = require("ts-explorer.rpc")
local sidecar = require("ts-explorer.sidecar")

local state = {
  bufnr = nil,
  winid = nil,
  tree_state = nil,
  timer = nil,
  request_id = 0,
  augroup = nil,
}

--- Set up buffer-local keymaps for the panel.
local function _setup_keymaps()
  local config = require("ts-explorer.config").get()
  local km = config.panel.keymaps
  local opts = { buffer = state.bufnr, noremap = true, silent = true }

  vim.keymap.set("n", km.toggle, function()
    if state.tree_state then
      local cursor_line = vim.api.nvim_win_get_cursor(0)[1]
      if tree.toggle(state.tree_state, cursor_line) then
        M._render()
      end
    end
  end, opts)

  vim.keymap.set("n", km.expand_recursive, function()
    if state.tree_state then
      local cursor_line = vim.api.nvim_win_get_cursor(0)[1]
      if tree.expand_recursive(state.tree_state, cursor_line) then
        M._render()
      end
    end
  end, opts)

  vim.keymap.set("n", km.collapse_recursive, function()
    if state.tree_state then
      local cursor_line = vim.api.nvim_win_get_cursor(0)[1]
      if tree.collapse_recursive(state.tree_state, cursor_line) then
        M._render()
      end
    end
  end, opts)

  local close_keys = km.close
  if type(close_keys) == "string" then
    close_keys = { close_keys }
  end
  for _, key in ipairs(close_keys) do
    vim.keymap.set("n", key, function()
      M.close()
    end, opts)
  end
end

--- Register autocmds for cursor-follow and window lifecycle.
local function _setup_autocmds()
  state.augroup = vim.api.nvim_create_augroup("TsExplorerPanel", { clear = true })

  vim.api.nvim_create_autocmd({ "CursorMoved", "CursorHold" }, {
    group = state.augroup,
    pattern = { "*.ts", "*.tsx" },
    callback = function(ev)
      M._on_cursor_move(ev.buf)
    end,
  })

  vim.api.nvim_create_autocmd("WinClosed", {
    group = state.augroup,
    callback = function(ev)
      if tonumber(ev.match) == state.winid then
        state.winid = nil
      end
    end,
  })
end

--- Remove all panel autocmds.
local function _teardown_autocmds()
  if state.augroup then
    vim.api.nvim_del_augroup_by_id(state.augroup)
    state.augroup = nil
  end
end

--- Resolve the type at the current cursor position.
--- @param file string file path
--- @param bufnr number buffer number that triggered the resolve
local function _resolve_at_cursor(file, bufnr)
  if not sidecar.is_running() then
    return
  end
  if not file or file == "" then
    return
  end

  local cursor = vim.api.nvim_win_get_cursor(0)
  local line = cursor[1]
  local col = cursor[2]

  -- TypeScript uses UTF-16 character offsets, not byte offsets.
  -- We must convert Neovim's byte-based positions to character counts
  -- to handle files containing multi-byte UTF-8 characters.
  local char_offset = 0
  if line > 1 then
    local prev_lines = vim.api.nvim_buf_get_lines(bufnr, 0, line - 1, false)
    for _, l in ipairs(prev_lines) do
      char_offset = char_offset + vim.fn.strchars(l) + 1 -- +1 for newline
    end
  end
  -- Add character offset within the current line
  local cur_line_text = vim.api.nvim_buf_get_lines(bufnr, line - 1, line, false)[1] or ""
  local col_text = cur_line_text:sub(1, col)
  char_offset = char_offset + vim.fn.strchars(col_text)

  if char_offset < 0 then
    return
  end

  state.request_id = state.request_id + 1
  local my_id = state.request_id

  local log = require("ts-explorer.log")
  log.debug("resolve: requesting at char_offset=" .. char_offset .. " file=" .. file)

  rpc.request("resolve", { filePath = file, position = char_offset }, function(err, result)
    log.debug("resolve callback: my_id=" .. my_id .. " current_id=" .. state.request_id)
    if my_id ~= state.request_id then
      log.debug("resolve: stale response discarded")
      return
    end
    if err then
      log.debug("resolve: error " .. vim.inspect(err))
      return
    end
    if result and result.node and result.node ~= vim.NIL then
      log.debug("resolve: got node kind=" .. tostring(result.node.kind) .. " name=" .. tostring(result.node.name))
      M._update_tree(result.node)
    else
      log.debug("resolve: no node in result")
    end
    -- If result.node is nil/NIL, keep last result (no flicker)
  end)
end

--- Debounced handler for cursor movement events.
--- @param bufnr number
function M._on_cursor_move(bufnr)
  -- Guard: don't trigger on the panel buffer itself
  if bufnr == state.bufnr then
    return
  end
  -- Guard: panel must be open
  if not state.winid or not vim.api.nvim_win_is_valid(state.winid) then
    return
  end
  -- Guard: check filetype
  local ft = vim.bo[bufnr].filetype
  if ft ~= "typescript" and ft ~= "typescriptreact" then
    return
  end

  local file = vim.api.nvim_buf_get_name(bufnr)
  local captured_bufnr = bufnr

  -- Debounce: stop existing timer, start new one
  if state.timer then
    state.timer:stop()
  else
    state.timer = vim.uv.new_timer()
  end

  state.timer:start(150, 0, vim.schedule_wrap(function()
    -- Verify the captured buffer is still the current buffer
    if vim.api.nvim_get_current_buf() ~= captured_bufnr then
      return
    end
    _resolve_at_cursor(file, captured_bufnr)
  end))
end

--- Update tree state with a new type node and re-render.
--- @param type_node table
function M._update_tree(type_node)
  state.tree_state = tree.new(type_node)
  M._render()
end

--- Render the current tree state into the panel buffer.
function M._render()
  if not state.tree_state then
    return
  end
  if not state.winid or not vim.api.nvim_win_is_valid(state.winid) then
    return
  end
  if not state.bufnr or not vim.api.nvim_buf_is_valid(state.bufnr) then
    return
  end

  local result = tree.render(state.tree_state)
  vim.bo[state.bufnr].modifiable = true
  vim.api.nvim_buf_set_lines(state.bufnr, 0, -1, false, result.lines)
  vim.bo[state.bufnr].modifiable = false
end

--- Open the explorer panel.
function M.open()
  -- Already open
  if state.winid and vim.api.nvim_win_is_valid(state.winid) then
    return
  end

  -- Create buffer if needed
  if not state.bufnr or not vim.api.nvim_buf_is_valid(state.bufnr) then
    state.bufnr = vim.api.nvim_create_buf(false, true)
    vim.bo[state.bufnr].buftype = "nofile"
    vim.bo[state.bufnr].bufhidden = "hide"
    vim.bo[state.bufnr].swapfile = false
    vim.bo[state.bufnr].modifiable = false
    vim.bo[state.bufnr].filetype = "tsexplorer"
    _setup_keymaps()
  end

  local config = require("ts-explorer.config").get()

  state.winid = vim.api.nvim_open_win(state.bufnr, false, {
    split = config.panel.position,
    win = 0,
    width = config.panel.width,
  })

  -- Window options
  vim.wo[state.winid].number = false
  vim.wo[state.winid].relativenumber = false
  vim.wo[state.winid].signcolumn = "no"
  vim.wo[state.winid].cursorline = true
  vim.wo[state.winid].wrap = false
  vim.wo[state.winid].spell = false

  _setup_autocmds()

  -- Immediately trigger resolve for current cursor position
  local cur_buf = vim.api.nvim_get_current_buf()
  if cur_buf ~= state.bufnr then
    local ft = vim.bo[cur_buf].filetype
    if ft == "typescript" or ft == "typescriptreact" then
      local file = vim.api.nvim_buf_get_name(cur_buf)
      _resolve_at_cursor(file, cur_buf)
    end
  end
end

--- Close the explorer panel.
function M.close()
  if state.winid and vim.api.nvim_win_is_valid(state.winid) then
    vim.api.nvim_win_close(state.winid, true)
  end
  state.winid = nil
  _teardown_autocmds()
  if state.timer then
    state.timer:stop()
    state.timer:close()
    state.timer = nil
  end
end

--- Toggle the explorer panel open/closed.
function M.toggle()
  if state.winid and vim.api.nvim_win_is_valid(state.winid) then
    M.close()
  else
    M.open()
  end
end

return M
