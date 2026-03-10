local M = {}

M.defaults = {
  sidecar = {
    max_restarts = 3,
  },
  log = {
    level = "error",
  },
  keybindings = {
    toggle_panel = "<leader>te", -- set to false to disable
  },
  panel = {
    width = 40,
    position = "left", -- "left" or "right"
    keymaps = {
      toggle = "<CR>",
      expand_recursive = "L",
      collapse_recursive = "H",
      close = { "q", "<Esc>" },
    },
  },
}

M.values = nil

function M.setup(opts)
  M.values = vim.tbl_deep_extend("force", M.defaults, opts or {})
end

function M.get()
  return M.values or M.defaults
end

return M
