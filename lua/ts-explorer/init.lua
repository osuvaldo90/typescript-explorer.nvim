local M = {}

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

return M
