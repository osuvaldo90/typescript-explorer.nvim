local M = {}

function M.debug(...)
  local config = require("ts-explorer.config").get()
  if config.log and config.log.level == "debug" then
    local args = { ... }
    local parts = {}
    for _, v in ipairs(args) do
      table.insert(parts, tostring(v))
    end
    vim.notify("[ts-explorer] " .. table.concat(parts, " "), vim.log.levels.DEBUG)
  end
end

function M.error(...)
  local args = { ... }
  local parts = {}
  for _, v in ipairs(args) do
    table.insert(parts, tostring(v))
  end
  vim.notify("[ts-explorer] " .. table.concat(parts, " "), vim.log.levels.ERROR)
end

function M.on_stderr(data)
  if not data then
    return
  end
  for _, line in ipairs(data) do
    if line ~= "" then
      M.debug(line)
    end
  end
end

return M
