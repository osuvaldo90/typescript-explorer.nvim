local M = {}

local job_id = nil
local stopping = false
local restart_count = 0

function M.get_job_id()
  return job_id
end

function M.is_running()
  return job_id ~= nil
end

function M.start()
  if job_id then
    return
  end

  local source = debug.getinfo(1, "S").source:sub(2)
  local plugin_root = vim.fn.fnamemodify(source, ":h:h:h")
  local sidecar_path = plugin_root .. "/sidecar/dist/main.js"

  if vim.fn.filereadable(sidecar_path) ~= 1 then
    require("ts-explorer.log").error("Sidecar not found: " .. sidecar_path .. ". Run 'make build-sidecar' first.")
    return
  end

  job_id = vim.fn.jobstart({ "node", sidecar_path }, {
    on_stdout = function(_, data, _)
      require("ts-explorer.rpc").on_data(data)
    end,
    on_stderr = function(_, data, _)
      require("ts-explorer.log").on_stderr(data)
    end,
    on_exit = function(id, exit_code, _)
      -- Ignore exit from a job we intentionally stopped
      if id ~= job_id then
        return
      end
      job_id = nil
      if not stopping and exit_code ~= 0 then
        M._handle_crash()
      end
    end,
  })
end

function M.stop()
  if job_id then
    stopping = true
    vim.fn.jobstop(job_id)
    job_id = nil
    stopping = false
  end
  require("ts-explorer.rpc").reset()
end

function M.restart()
  M.stop()
  restart_count = 0
  M.start()
end

function M._handle_crash()
  restart_count = restart_count + 1
  require("ts-explorer.rpc").reset()
  local config = require("ts-explorer.config").get()
  local max = (config.sidecar and config.sidecar.max_restarts) or 3
  if restart_count <= max then
    vim.schedule(function()
      M.start()
    end)
  else
    vim.notify(
      "TypeScript Explorer: sidecar crashed repeatedly. Use :TsExplorerRestart to retry.",
      vim.log.levels.ERROR
    )
  end
end

return M
