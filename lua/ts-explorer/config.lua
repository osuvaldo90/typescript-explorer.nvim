local M = {}

M.defaults = {
  sidecar = {
    max_restarts = 3,
  },
  log = {
    level = "error",
  },
}

M.values = {}

function M.setup(opts)
  M.values = vim.tbl_deep_extend("force", M.defaults, opts or {})
end

function M.get()
  return M.values
end

return M
