if vim.g.loaded_ts_explorer then
  return
end
vim.g.loaded_ts_explorer = true

vim.api.nvim_create_user_command("TsExplorerRestart", function()
  require("ts-explorer.sidecar").restart()
end, { desc = "Restart TypeScript Explorer sidecar" })

vim.api.nvim_create_autocmd("VimEnter", {
  callback = function()
    require("ts-explorer.sidecar").start()
  end,
  once = true,
})

vim.api.nvim_create_autocmd("VimLeavePre", {
  callback = function()
    require("ts-explorer.sidecar").stop()
  end,
})
