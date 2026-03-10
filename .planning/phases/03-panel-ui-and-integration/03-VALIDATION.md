---
phase: 3
slug: panel-ui-and-integration
status: draft
nyquist_compliant: false
wave_0_complete: false
created: 2026-03-09
---

# Phase 3 — Validation Strategy

> Per-phase validation contract for feedback sampling during execution.

---

## Test Infrastructure

| Property | Value |
|----------|-------|
| **Framework** | Node.js built-in test runner via tsx (sidecar); manual UAT (Lua/Neovim) |
| **Config file** | sidecar/package.json `scripts.test` |
| **Quick run command** | `cd sidecar && npm test` |
| **Full suite command** | `make test` |
| **Estimated runtime** | ~5 seconds |

---

## Sampling Rate

- **After every task commit:** Manual verification in Neovim (open panel, navigate, check rendering)
- **After every plan wave:** Run `make test` (sidecar tests still pass — no regressions)
- **Before `/gsd:verify-work`:** Full manual UAT against all PANE requirements
- **Max feedback latency:** 10 seconds

---

## Per-Task Verification Map

| Task ID | Plan | Wave | Requirement | Test Type | Automated Command | File Exists | Status |
|---------|------|------|-------------|-----------|-------------------|-------------|--------|
| 03-01-01 | 01 | 1 | PANE-01 | manual-only | N/A (requires Neovim runtime) | N/A | ⬜ pending |
| 03-01-02 | 01 | 1 | PANE-06 | manual-only | N/A (requires Neovim runtime) | N/A | ⬜ pending |
| 03-02-01 | 02 | 1 | PANE-02 | manual-only | N/A (requires Neovim runtime) | N/A | ⬜ pending |
| 03-02-02 | 02 | 1 | PANE-03 | manual-only | N/A (requires Neovim runtime) | N/A | ⬜ pending |
| 03-03-01 | 03 | 2 | PANE-04 | manual-only | N/A (requires Neovim runtime) | N/A | ⬜ pending |
| 03-03-02 | 03 | 2 | PANE-05 | manual-only | N/A (requires Neovim runtime) | N/A | ⬜ pending |

*Status: ⬜ pending · ✅ green · ❌ red · ⚠️ flaky*

---

## Wave 0 Requirements

Existing infrastructure covers all phase requirements. This phase is pure Lua with no sidecar test files needed. The tree rendering logic lives in Lua, and the existing sidecar test infrastructure remains unchanged.

---

## Manual-Only Verifications

| Behavior | Requirement | Why Manual | Test Instructions |
|----------|-------------|------------|-------------------|
| Open persistent side panel (vsplit) | PANE-01 | Requires Neovim window management runtime | Open Neovim, run `:TypeExplorer`, verify vertical split opens with tree content |
| Expand/collapse with keyboard | PANE-02 | Requires Neovim keymap + buffer interaction | Navigate tree nodes, press expand/collapse keys, verify node state changes |
| Default expand depth is 1 | PANE-03 | Requires visual verification of tree state | Open panel on a type with nested properties, verify only 1 level expanded |
| Auto-update on cursor move | PANE-04 | Requires Neovim CursorHold autocmd | Move cursor to different symbol, wait for updatetime, verify panel updates |
| Replace tree on new symbol | PANE-05 | Requires Neovim cursor + RPC integration | Move to different type symbol, verify tree content replaces entirely |
| Open/close with same command | PANE-06 | Requires Neovim window lifecycle | Run `:TypeExplorer` to open, run again to close, verify toggle behavior |

---

## Validation Sign-Off

- [ ] All tasks have `<automated>` verify or Wave 0 dependencies
- [ ] Sampling continuity: no 3 consecutive tasks without automated verify
- [ ] Wave 0 covers all MISSING references
- [ ] No watch-mode flags
- [ ] Feedback latency < 10s
- [ ] `nyquist_compliant: true` set in frontmatter

**Approval:** pending
