local M = {}

local buffer = ""
local pending = {}
local next_id = 0

function M.on_data(data)
  for i, chunk in ipairs(data) do
    if i == 1 then
      buffer = buffer .. chunk
    else
      M._process_line(buffer)
      buffer = chunk
    end
  end
end

function M._process_line(line)
  if line == "" then
    return
  end
  local ok, msg = pcall(vim.json.decode, line)
  if ok and msg.id and pending[msg.id] then
    local cb = pending[msg.id]
    pending[msg.id] = nil
    cb(msg.error, msg.result)
  end
end

function M.request(method, params, callback)
  next_id = next_id + 1
  local id = next_id
  pending[id] = callback
  local msg = vim.json.encode({ id = id, method = method, params = params }) .. "\n"
  vim.fn.chansend(require("ts-explorer.sidecar").get_job_id(), msg)
end

function M.reset()
  buffer = ""
  pending = {}
  next_id = 0
end

return M
