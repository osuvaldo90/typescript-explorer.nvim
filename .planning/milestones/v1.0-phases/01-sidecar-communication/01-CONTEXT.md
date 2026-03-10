# Phase 1: Sidecar Communication - Context

**Gathered:** 2026-03-09
**Status:** Ready for planning

<domain>
## Phase Boundary

Reliable bidirectional NDJSON communication between Neovim and a Node.js sidecar process. Neovim starts the sidecar on plugin load, exchanges structured JSON messages over stdio, and the sidecar self-terminates when stdin closes. Type resolution and panel UI are separate phases.

</domain>

<decisions>
## Implementation Decisions

### Crash recovery
- Auto-restart silently on crash — user doesn't notice unless it keeps failing
- 3 restart attempts, then show error via vim.notify and stop retrying
- In-flight requests are dropped on crash — next cursor move triggers a fresh request naturally
- Provide a `:TsExplorerRestart` user command for manual restart (useful for debugging or after tsconfig changes)

### Plugin structure
- LazyVim compatible setup — follow Neovim/LazyVim plugin best practices
- Standard Lua plugin layout conventions

### Claude's Discretion
- Message protocol design (request/response format, message IDs, error envelopes — JSON-RPC vs custom NDJSON schema)
- Logging and debugging approach (log verbosity, file vs stderr-only, user-facing diagnostics)
- Sidecar Node.js project structure and build setup

</decisions>

<specifics>
## Specific Ideas

No specific requirements — open to standard approaches

</specifics>

<code_context>
## Existing Code Insights

### Reusable Assets
- None — greenfield project, no existing code

### Established Patterns
- None yet — this phase establishes the foundational patterns

### Integration Points
- Neovim plugin loader (lazy.nvim compatible spec)
- Node.js sidecar process spawned via vim.fn.jobstart or vim.loop
- stdio for message passing (stdout for NDJSON messages, stderr for logging)

</code_context>

<deferred>
## Deferred Ideas

None — discussion stayed within phase scope

</deferred>

---

*Phase: 01-sidecar-communication*
*Context gathered: 2026-03-09*
